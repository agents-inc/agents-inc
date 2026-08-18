import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { seedPayloadSchema } from "@workspace/matrix/seed"
import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexSchema,
} from "@workspace/matrix/skill-index"
import { cors } from "hono/cors"

import { messageOf } from "./log"
import { freshnessOf, readSkillIndex, secondsUntilStale } from "./skill-index"

import type { RouteHandler } from "@hono/zod-openapi"
import type { Context } from "hono"

// This worker's own bindings, named once. `Env` is the global `wrangler types`
// writes; wrapping it is what the app, its handlers and the CORS callback all
// need, and spelling that wrapper out four times is four places to get wrong.
type WorkerEnv = { Bindings: Env }

// Sized on measured payloads rather than on a guess, and raised from 32 KB when
// the payload started carrying skill CONTENT (seed v5).
//
// A catalogue-only configuration is 1.9 KB — twenty skills, their assignments
// and an agent map — which is what the old cap was set against. An external
// skill travels its whole directory inline, and those are 20-84 KB each in the
// allowlisted repositories, so one of them alone outgrew that cap: three
// together measure 161 KB raw and 48 KB gzipped.
//
// 1 MB therefore holds a dozen typical external skills or six at the per-skill
// cap `seedPayloadSchema` enforces, which is far past any configuration anyone
// has built. It is 4% of KV's 25 MiB value limit and nothing against a Worker's
// 128 MB, so the refusal is about what a share link should reasonably be rather
// than about what this can hold.
const MAX_BODY_BYTES = 1_048_576

// 8 base64url chars = 48 bits. Content-addressing makes collisions a birthday
// problem (~16M configs before one is likely), far beyond this store's scale.
const ID_LENGTH = 8

const YEAR_SECONDS = 31_536_000

// The id is the payload's own hash: the same config always mints the same id,
// a retry can never double-store, and a stored payload can never change under
// its id — which is what lets the GET declare itself immutable.
const contentAddress = async (body: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  )
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .slice(0, ID_LENGTH)
}

const configIdSchema = z
  .object({ id: z.string().length(ID_LENGTH) })
  .openapi("ConfigId", { example: { id: "Ab3xY9_Q" } })

const createConfigRoute = createRoute({
  method: "post",
  path: "/configs",
  operationId: "createConfig",
  tags: ["Configs"],
  request: {
    body: {
      content: { "application/json": { schema: seedPayloadSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Stored; the id is the payload's content hash",
      content: { "application/json": { schema: configIdSchema } },
    },
    400: { description: "Body is not a valid seed payload" },
    413: { description: "Body exceeds the size cap" },
    503: { description: "The store refused the write" },
  },
})

const getConfigRoute = createRoute({
  method: "get",
  path: "/configs/{id}",
  operationId: "getConfig",
  tags: ["Configs"],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: "The stored seed payload",
      content: { "application/json": { schema: seedPayloadSchema } },
    },
    404: { description: "No config under this id" },
    500: { description: "What is stored under this id is not a seed payload" },
    503: { description: "The store refused the read" },
  },
})

// The whole index in one response, on purpose. Three repositories yield a list
// of a few dozen skills — small enough that the add-skills dialog filters it in
// the browser, which is worth far more than a server-side query: no call per
// keystroke, no debounce, and no rate limit to design around.
const skillIndexRoute = createRoute({
  method: "get",
  path: "/skills",
  operationId: "getSkillIndex",
  tags: ["Skills"],
  responses: {
    200: {
      description:
        "Every skill the allowlisted external repositories are known to hold",
      content: { "application/json": { schema: skillIndexSchema } },
    },
    503: {
      description: "The scheduled build has not published an index yet",
    },
  },
})

const app = new OpenAPIHono<WorkerEnv>()

// Registered before the routes so a preflight never reaches them. Only the
// configured web origin may call from a browser; the CLI is not a browser and
// is unaffected.
// `cors` types its callback's context as the default `Env`, whose bindings are
// `any` — so the annotation is what makes `WEB_ORIGIN` a checked read of this
// worker's own binding rather than a property fetched off `any`.
//
// `exposeHeaders` is what lets the editor read `x-skill-index` at all. A custom
// response header is hidden from a cross-origin caller unless the server names
// it here — `hono/cors` exposes nothing by default and emits the header only
// when this array is non-empty — so setting the header on the index response is
// half the job and sending it is the other half. Nothing in either workspace's
// suite is a browser, which is why the editor keeps a Playwright stub that
// withholds this and a spec asserting the dialog survives it.
const allowOnlyWebOrigin = cors({
  origin: (origin, c: Context<WorkerEnv>) =>
    origin === c.env.WEB_ORIGIN ? origin : null,
  exposeHeaders: [SKILL_INDEX_FRESHNESS_HEADER],
})

app.use("/configs/*", allowOnlyWebOrigin)
app.use("/configs", allowOnlyWebOrigin)
// A plain GET preflights nothing, but the browser still refuses to hand the
// body to the app without an allow-origin header on the response — so the
// index needs this as much as the routes that do preflight.
app.use("/skills", allowOnlyWebOrigin)
app.use("/skills/*", allowOnlyWebOrigin)
// The tunnel is called cross-origin from the web app, and an envelope's
// content type is not CORS-safelisted, so it preflights like the rest.
app.use("/monitoring", allowOnlyWebOrigin)

// Refused on the declared length alone — bodies without one parse as usual and
// the JSON validator rejects anything that is not a payload anyway.
app.use("/configs", async (c, next) => {
  const declared = Number(c.req.header("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return c.text("Payload too large", 413)
  return next()
})

// A KV write is the one thing here that can fail for reasons outside this
// code: the free tier allows 1000 a day, and past that a share fails with
// nothing anywhere saying why. `messageOf` lives in ./log because the skill
// index logs the same way and importing it back from here would be a cycle.
const logKvFailure = (operation: string, error: unknown) =>
  console.error({ event: "kv_failure", operation, message: messageOf(error) })

// The other thing worth a dashboard query. Unlike a KV failure this one cannot
// happen by quota or outage: it means the bytes under a content-addressed key
// are not the bytes that were hashed into it, so the id is logged alongside.
const logCorruptPayload = (id: string, error: unknown) =>
  console.error({ event: "corrupt_payload", id, message: messageOf(error) })

const createConfig: RouteHandler<typeof createConfigRoute, WorkerEnv> = async (
  c
) => {
  const payload = c.req.valid("json")

  // What is stored is the re-serialized *validated* payload, so unknown keys
  // are already stripped and the hash covers exactly what a GET returns.
  const body = JSON.stringify(payload)
  const id = await contentAddress(body)

  try {
    // Content-addressed, so a key that exists already holds byte-identical
    // content: re-writing it would spend one of the free tier's 1000 daily
    // writes to store what is already there. Reads are 100x more plentiful,
    // and that asymmetry is what makes minting an id every time the install
    // dialog opens affordable — fifty opens of one config cost a single write.
    const existing = await c.env.CONFIGS.get(id)
    if (existing === null) await c.env.CONFIGS.put(id, body)
  } catch (error) {
    logKvFailure("put", error)
    return c.text("Could not store this config", 503)
  }

  return c.json({ id }, 201)
}

const getConfig: RouteHandler<typeof getConfigRoute, WorkerEnv> = async (c) => {
  const { id } = c.req.valid("param")

  let stored: string | null
  try {
    stored = await c.env.CONFIGS.get(id)
  } catch (error) {
    logKvFailure("get", error)
    return c.text("Could not read this config", 503)
  }

  if (stored === null) return c.text("No config under this id", 404)

  // The route's 200 declares `seedPayloadSchema`, so what is served has to be
  // one — and `JSON.parse` alone promises nothing. Reaching here with something
  // else means the store diverged from what this worker wrote: the POST
  // validates before storing, and the key is the payload's own hash, so no
  // write of ours can produce it. That is an integrity failure on our side,
  // which is 500 — not 404 (the config is present) and not 503 (the store
  // answered). Serving it unvalidated would make the contract a lie instead.
  let payload: unknown
  try {
    payload = JSON.parse(stored)
  } catch (error) {
    logCorruptPayload(id, error)
    return c.text("Stored config is unreadable", 500)
  }

  const parsed = seedPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    logCorruptPayload(id, parsed.error)
    return c.text("Stored config is unreadable", 500)
  }

  // Content-addressed, therefore immutable: a CLI or proxy may cache forever.
  return c.json(parsed.data, 200, {
    "cache-control": `public, max-age=${YEAR_SECONDS}, immutable`,
  })
}

// One KV read. Whatever the scheduled build last published is what this
// serves, complete, with no upstream anywhere in the request — see
// `skill-index.ts` for why the crawl is not here any more. The stored value
// carries no expiry, so the last good index survives an upstream outage, a
// broken workflow and a revoked token alike.
//
// 503 is therefore the one narrow case left: no build has ever succeeded, or
// what is stored is no longer readable as an index. Neither is a degraded
// answer this route could improve on by trying harder.
//
// `x-skill-index` still says whether the list is the current picture, but the
// question it answers has changed with the design. It no longer means "this is
// part of the index" — every answer is the whole index now — it means the
// build behind it has stopped running. Callers already handle both words and
// need no change.
const getSkillIndex: RouteHandler<typeof skillIndexRoute, WorkerEnv> = async (
  c
) => {
  const outcome = await readSkillIndex(c.env.CONFIGS)

  if (!outcome.served) {
    return c.text("The skill index is not available yet", 503)
  }

  const { builtAt } = outcome.index

  return c.json(outcome.index, 200, {
    "cache-control": `public, max-age=${String(secondsUntilStale(builtAt))}`,
    [SKILL_INDEX_FRESHNESS_HEADER]: freshnessOf(builtAt),
  })
}

// ── Sentry tunnel ────────────────────────────────────────────────────────
//
// Browsers block `*.ingest.sentry.io` by default — not only via extensions
// but through Edge's Tracking Prevention, Safari's ITP and Firefox's ETP. A
// site whose users are developers loses a large and self-selecting share of
// its error reports that way, which is worse than losing all of them: what
// survives looks authoritative and is not.
//
// Relaying through this worker makes the request same-site, so there is
// nothing for a blocklist to match. Sentry documents the SDK half (`tunnel`)
// but hosts nothing, so the endpoint is ours to write.
//
// The envelope's first line is a JSON header carrying the DSN it was built
// for. Checking it against the one project this worker serves is what stops
// the route being an open relay into anyone's Sentry account.
const tunnelRoute = createRoute({
  method: "post",
  path: "/monitoring",
  operationId: "tunnelEnvelope",
  tags: ["Monitoring"],
  request: {
    body: {
      content: { "application/x-sentry-envelope": { schema: z.string() } },
      required: true,
    },
  },
  responses: {
    200: { description: "Relayed to Sentry" },
    400: { description: "Not a readable envelope" },
    403: { description: "Envelope is addressed to another project" },
  },
})

const tunnelEnvelope: RouteHandler<typeof tunnelRoute, WorkerEnv> = async (
  c
) => {
  const envelope = await c.req.text()

  const headerEnd = envelope.indexOf("\n")
  if (headerEnd === -1) return c.text("Not a readable envelope", 400)

  let dsn: URL
  try {
    const header = JSON.parse(envelope.slice(0, headerEnd)) as { dsn?: string }
    if (!header.dsn) return c.text("Envelope carries no DSN", 400)
    dsn = new URL(header.dsn)
  } catch {
    return c.text("Not a readable envelope", 400)
  }

  // The DSN's path is `/<projectId>`.
  const projectId = dsn.pathname.slice(1)
  if (
    dsn.hostname !== c.env.SENTRY_INGEST_HOST ||
    projectId !== c.env.SENTRY_PROJECT_ID
  ) {
    return c.text("Envelope is addressed to another project", 403)
  }

  const upstream = await fetch(
    `https://${c.env.SENTRY_INGEST_HOST}/api/${projectId}/envelope/`,
    { method: "POST", body: envelope }
  )

  // The browser has nothing to do with Sentry's response body, and forwarding
  // it would only widen what this route can be used to probe.
  return new Response(null, { status: upstream.status })
}

// One chain, not three statements, and that is a type-level requirement rather
// than a style. `.openapi()` returns the app with the route folded into its
// *type* while returning the very same instance at runtime, so registering
// each route on its own line throws the return value away and leaves
// `typeof app` claiming to serve nothing. apps/editor infers its client from
// exactly that type, so a route dropped out of this chain would vanish from
// the editor's API surface rather than fail here.
const api = app
  .openapi(createConfigRoute, createConfig)
  .openapi(getConfigRoute, getConfig)
  .openapi(skillIndexRoute, getSkillIndex)
  .openapi(tunnelRoute, tunnelEnvelope)

// What apps/editor imports, and the only thing it imports from this worker:
// `hc<AppType>` reads the routes off it and gives the editor a client that
// cannot outlive them. A type erases at compile time, so nothing here reaches
// the browser bundle.
export type AppType = typeof api

// Named for build-time OpenAPI spec generation; default for the Workers
// runtime. Both are the chained value, not the bare instance above: they are
// the same object either way, but only this one carries the routes in its type.
export { api as app }
export default api
