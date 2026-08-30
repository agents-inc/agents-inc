import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { createRoute, z } from "@hono/zod-openapi"
import { CATALOG } from "@workspace/matrix"

import { messageOf } from "./log"
import { UNAUTHORIZED, authenticated } from "./auth"

import type { RouteHandler } from "@hono/zod-openapi"

type WorkerEnv = { Bindings: Env }

// Long enough for a paragraph describing a project, short enough that it cannot
// be a payload. Input tokens are billed, so an unbounded prompt is an unbounded
// bill and nothing else here caps what one signed-in caller can paste.
const MAX_SENTENCE = 600

/**
 * WHAT THE MODEL IS ALLOWED TO DECIDE, and it is deliberately almost nothing.
 *
 * Skill ids and a sentence of reasoning. Not scopes, not install modes, not
 * which sub-agents carry what — `resolveAssignment` and `PRELOAD_DEFAULTS` in
 * packages/matrix already answer those, the CLI generates from the same rules,
 * and a model inventing a preload policy would produce a configuration the CLI
 * then contradicts. The editor derives everything else from the ids.
 */
const proposalSchema = z.object({
  skillIds: z.array(z.string()),
  reason: z.string(),
})

// The catalogue, rendered once per isolate rather than per request. It is the
// stable half of the prompt and the cached half — see the `cache_control` below
// — so it must be byte-identical between calls, which a per-request `map` over
// an object's keys is not guaranteed to be.
const CATALOGUE_LINES = Object.values(CATALOG.skillsById)
  .map((skill) => `${skill.id} — ${skill.displayName}: ${skill.description}`)
  .sort()
  .join("\n")

const SYSTEM_PROMPT = `You choose skills for a Claude Code sub-agent configuration.

Below is the whole catalogue, one skill per line as \`id — name: description\`.
Return the ids that suit what the person describes, and a single short sentence
saying why. Rules:

- Return ONLY ids that appear verbatim below. Never invent one.
- Prefer few and relevant over many. An empty list is a valid answer when the
  request names nothing the catalogue covers.
- Say nothing about scope, install mode, models or which sub-agents get what.
  Those are decided by the tool, not by you, and an opinion about them here is
  discarded.

${CATALOGUE_LINES}`

/**
 * The ids the editor is allowed to see, out of the ids the model returned.
 *
 * THE MODEL'S IDS ARE NOT TRUSTED, in two ways it gets them wrong.
 *
 * An id that is not in the catalogue at all — a plausible near-miss is the
 * likeliest shape — is dropped, so the editor never receives one it cannot
 * resolve and a hallucinated skill is silently absent rather than a broken row
 * on screen.
 *
 * An id named TWICE is worse than it looks (EDITOR-60): the editor draws a row
 * per id and applying the proposal toggles each one, so a repeat turned a
 * skill on and straight back off — a proposal reading "2 changes" that changed
 * nothing. Deduplicated at this boundary rather than in the editor, because
 * this is where the ids are already being made trustworthy.
 */
const trustedIds = (skillIds: string[]) => [
  ...new Set(skillIds.filter((id) => id in CATALOG.skillsById)),
]

const composeRequestSchema = z.object({ sentence: z.string() })

const composeResponseSchema = proposalSchema.openapi("Proposal")

export const composeRoute = createRoute({
  method: "post",
  path: "/compose",
  request: {
    body: {
      content: { "application/json": { schema: composeRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: composeResponseSchema } },
      description: "Skill ids that suit the sentence",
    },
    400: {
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
      description: "Nothing worth sending",
    },
    ...UNAUTHORIZED,
    429: {
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
      description: "Too many in a minute",
    },
    502: {
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
      description: "The model did not answer usefully",
    },
  },
})

// SIGNED-IN ONLY, and `authenticated` is the abuse control rather than a
// nicety. Every call spends real money, so the thing worth having is an
// identity that can be rate-limited and quota'd — which is why EDITOR-54's
// Turnstile requirement was re-derived once accounts landed: a CAPTCHA proves a
// human was present once and says nothing about their hundredth request.
export const compose: RouteHandler<typeof composeRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const { success } = await c.env.COMPOSE_CALLS.limit({
      key: session.user.id,
    })
    if (!success) return c.json({ error: "too many requests" }, 429)

    const sentence = c.req.valid("json").sentence.trim()
    // Refused BEFORE the model is reached, both of them. A blank prompt costing
    // a token is the cheapest bug to have and the easiest never to notice.
    if (sentence.length === 0) return c.json({ error: "empty" }, 400)
    if (sentence.length > MAX_SENTENCE) {
      return c.json({ error: "too long" }, 400)
    }

    const client = new Anthropic({
      apiKey: c.env.ANTHROPIC_API_KEY,
      // The AI Gateway when one is configured, Anthropic directly when not. BYOK
      // either way — the key is this worker's and the gateway adds no markup — so
      // the gateway is caching, analytics and a second place to throttle rather
      // than a dependency this route needs to function.
      ...(c.env.AI_GATEWAY_URL ? { baseURL: c.env.AI_GATEWAY_URL } : {}),
    })

    try {
      const response = await client.messages.parse({
        model: "claude-opus-5",
        max_tokens: 2048,
        // The catalogue is ~200 lines and identical on every call, so it is the
        // cached prefix and the sentence is the only thing that varies. Order is
        // system then messages, which is why the sentence goes second.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: sentence }],
        // Low effort on purpose: this is a constrained selection from a list
        // that is entirely in the prompt, not a problem to reason about, and the
        // whole route exists under a cost concern.
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: zodOutputFormat(proposalSchema),
        },
      })

      const parsed = response.parsed_output
      if (!parsed) return c.json({ error: "unparseable" }, 502)

      return c.json(
        { skillIds: trustedIds(parsed.skillIds), reason: parsed.reason },
        200
      )
    } catch (error) {
      // Logged rather than returned. An upstream message can carry request ids,
      // account details and quota figures, none of which belong in a browser.
      console.error({ event: "compose_failure", message: messageOf(error) })
      return c.json({ error: "the model did not answer" }, 502)
    }
  })
