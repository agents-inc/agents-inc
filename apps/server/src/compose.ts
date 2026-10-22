import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { createRoute, z } from "@hono/zod-openapi"
import { CATALOG } from "@workspace/matrix"

import { messageOf } from "./log"
import { UNAUTHORIZED, authenticated } from "./auth"

import type { RouteHandler } from "@hono/zod-openapi"

type WorkerEnv = { Bindings: Env }

// Input tokens are billed; this caps what one caller can paste.
const MAX_SENTENCE = 600

// The model picks skill ids only; everything else derives from them.
const proposalSchema = z.object({
  skillIds: z.array(z.string()),
  reason: z.string(),
})

// Rendered once and sorted: the cached prompt prefix must be byte-identical.
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

// Drops ids outside the catalogue and deduplicates (a repeat would toggle a
// skill on and back off in the editor).
const trustedIds = (skillIds: string[]) => [
  ...new Set(skillIds.filter((id) => id in CATALOG.skillsById)),
]

const anthropicFor = (env: Env) =>
  new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    // The AI Gateway is optional; the key is this worker's either way.
    ...(env.AI_GATEWAY_URL ? { baseURL: env.AI_GATEWAY_URL } : {}),
  })

// `null` when the reply holds no proposal.
const proposeSkills = async (client: Anthropic, sentence: string) => {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    // The catalogue is the cached prefix; only the sentence varies.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: sentence }],
    // A constrained selection from a list, not a reasoning problem.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: zodOutputFormat(proposalSchema),
    },
  })

  return response.parsed_output
}

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

// Signed-in only: an identity is what can be rate-limited.
export const compose: RouteHandler<typeof composeRoute, WorkerEnv> =
  authenticated(async (c, session) => {
    const sentence = c.req.valid("json").sentence.trim()
    if (sentence.length === 0) return c.json({ error: "empty" }, 400)
    if (sentence.length > MAX_SENTENCE) {
      return c.json({ error: "too long" }, 400)
    }

    // After the free guards, before anything that spends.
    const { success } = await c.env.COMPOSE_CALLS.limit({
      key: session.user.id,
    })
    if (!success) return c.json({ error: "too many requests" }, 429)

    const client = anthropicFor(c.env)

    try {
      const proposal = await proposeSkills(client, sentence)
      if (!proposal) return c.json({ error: "unparseable" }, 502)

      return c.json(
        { skillIds: trustedIds(proposal.skillIds), reason: proposal.reason },
        200
      )
    } catch (error) {
      // Upstream messages can carry account details; log, don't return.
      console.error({ event: "compose_failure", message: messageOf(error) })
      return c.json({ error: "the model did not answer" }, 502)
    }
  })
