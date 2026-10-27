import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import {
  SEED_VERSION,
  installableSeedPayloadSchema,
  seedPayloadSchema,
} from "@workspace/matrix/seed"
import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexSchema,
} from "@workspace/matrix/skill-index"
import { cors } from "hono/cors"

import { createAuth } from "./auth"
import { compose, composeRoute } from "./compose"
import { messageOf } from "./log"
import { freshnessOf, readSkillIndex, secondsUntilStale } from "./skill-index"
import {
  createStack,
  createStackRoute,
  deleteStack,
  deleteStackRoute,
  listStacks,
  listStacksRoute,
  renameStack,
  renameStackRoute,
} from "./stacks"

import type { RouteHandler, RouteHook } from "@hono/zod-openapi"
import type { SeedPayload } from "@workspace/matrix/seed"
import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

// External skills travel their whole directory inline; 1 MB holds about a dozen.
const MAX_BODY_BYTES = 1_048_576

// 48 bits: a collision is unlikely before ~16M configs.
const ID_LENGTH = 8

const YEAR_SECONDS = 31_536_000

// Mirrors `CONFIG_WRITES`' period in wrangler.jsonc; `limit()` never says when
// the window ends.
const CONFIG_WRITE_WINDOW_SECONDS = 60

const RETRY_AFTER_HEADER = "retry-after"

const base64UrlOf = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")

// The id is the payload's hash, so a stored payload never changes under its id.
const contentAddress = async (body: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  )
  return base64UrlOf(digest).slice(0, ID_LENGTH)
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
      // Stricter than the GET: an uninstallable config gets no link, but
      // existing links must still open for the editor to repair them.
      content: {
        "application/json": { schema: installableSeedPayloadSchema },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Stored; the id is the payload's content hash",
      content: { "application/json": { schema: configIdSchema } },
    },
    400: { description: "Body is not a valid seed payload" },
    // Distinct from 400: a stale bundle, which a reload fixes.
    409: {
      description: "Body names a seed version this worker does not serve",
    },
    413: { description: "Body exceeds the size cap" },
    // Middleware answers it; declared so the typed client knows the status.
    429: {
      description: "This address has spent its writes for the window",
      headers: z.object({ [RETRY_AFTER_HEADER]: z.string() }),
    },
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

// The whole index in one response; it is small enough to filter in the browser.
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

// Registered before the routes so a preflight never reaches them. The context
// annotation types `WEB_ORIGIN` (cors defaults to `any` bindings). Custom
// headers are hidden cross-origin unless exposed; without `credentials` the
// browser silently drops the session cookie.
const allowOnlyWebOrigin = cors({
  origin: (origin, c: Context<WorkerEnv>) =>
    origin === c.env.WEB_ORIGIN ? origin : null,
  credentials: true,
  exposeHeaders: [SKILL_INDEX_FRESHNESS_HEADER, RETRY_AFTER_HEADER],
})

// One mount per path: `/x/*` matches a bare `/x` too, and a second mount would
// run CORS twice there.
app.use("/configs/*", allowOnlyWebOrigin)
app.use("/skills", allowOnlyWebOrigin)
app.use("/monitoring", allowOnlyWebOrigin)
app.use("/stacks/*", allowOnlyWebOrigin)
app.use("/api/auth/*", allowOnlyWebOrigin)
app.use("/compose", allowOnlyWebOrigin)

// Better Auth owns these paths; the editor calls them through its own client,
// so they stay out of the OpenAPI chain.
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw)
)

// Limits writes before the body is read, so a refusal stays cheap.
// `cf-connecting-ip` is set by Cloudflare's edge; it is absent only off-edge
// (tests), where the request is let through.
app.use("/configs", async (c, next) => {
  if (c.req.method !== "POST") return next()

  const address = c.req.header("cf-connecting-ip")
  if (address === undefined) return next()

  const { success } = await c.env.CONFIG_WRITES.limit({ key: address })
  return success
    ? next()
    : c.text("Too many requests", 429, {
        [RETRY_AFTER_HEADER]: String(CONFIG_WRITE_WINDOW_SECONDS),
      })
})

// Declared length only; the validator rejects anything else anyway.
app.use("/configs", async (c, next) => {
  const declared = Number(c.req.header("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return c.text("Payload too large", 413)
  return next()
})

const logKvFailure = (operation: string, error: unknown) =>
  console.error({ event: "kv_failure", operation, message: messageOf(error) })

const logCorruptPayload = (id: string, error: unknown) =>
  console.error({ event: "corrupt_payload", id, message: messageOf(error) })

type StoredPayload =
  { success: true; data: SeedPayload } | { success: false; error: unknown }

// Bytes that are not JSON and JSON that is not a payload keep their own
// complaints, so an operator can tell them apart.
const parseStoredPayload = (stored: string): StoredPayload => {
  try {
    return seedPayloadSchema.safeParse(JSON.parse(stored))
  } catch (error) {
    return { success: false, error }
  }
}

// `v` is a literal, so any wrong or missing version is one issue on this path.
const namesAnotherSeedVersion = (error: z.ZodError) =>
  error.issues.some((issue) => issue.path.length === 1 && issue.path[0] === "v")

// The return type below is narrowed by hand: `RouteHook` also admits `void`.
type BodyValidation = Parameters<
  RouteHook<typeof createConfigRoute, WorkerEnv>
>[0]

// Returning nothing falls back to the validator's own 400.
const refuseAnotherSeedVersion = (
  validation: BodyValidation,
  c: Context<WorkerEnv>
): Response | undefined => {
  if (validation.success || !namesAnotherSeedVersion(validation.error)) {
    return undefined
  }

  return c.text(
    `Reload the page: this configuration names another version of the sharing contract, and this service serves v${String(SEED_VERSION)}`,
    409
  )
}

const createConfig: RouteHandler<typeof createConfigRoute, WorkerEnv> = async (
  c
) => {
  const payload = c.req.valid("json")

  // The validated payload, so unknown keys are stripped before hashing.
  const body = JSON.stringify(payload)
  const id = await contentAddress(body)

  try {
    // An existing key already holds identical content; skip the scarcer write.
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

  // No write of ours stores an invalid payload, so one here is an integrity
  // failure: 500.
  const parsed = parseStoredPayload(stored)
  if (!parsed.success) {
    logCorruptPayload(id, parsed.error)
    return c.text("Stored config is unreadable", 500)
  }

  // Content-addressed, therefore immutable.
  return c.json(parsed.data, 200, {
    "cache-control": `public, max-age=${YEAR_SECONDS}, immutable`,
  })
}

// Serves whatever the scheduled build last published; 503 only when no build
// has succeeded or the stored index is unreadable.
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

// Sentry tunnel: browsers block Sentry's ingest host, so envelopes relay
// same-site. The DSN check keeps it from being an open relay.
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

type EnvelopeAddress =
  { addressed: true; dsn: URL } | { addressed: false; refusal: string }

const UNREADABLE_ENVELOPE = "Not a readable envelope"

// The header is the envelope's first line.
const addressOf = (envelope: string): EnvelopeAddress => {
  const headerEnd = envelope.indexOf("\n")
  if (headerEnd === -1) {
    return { addressed: false, refusal: UNREADABLE_ENVELOPE }
  }

  try {
    // Untrusted JSON; `dsn` is checked on the next line.
    const header = JSON.parse(envelope.slice(0, headerEnd)) as { dsn?: string }
    if (!header.dsn) {
      return { addressed: false, refusal: "Envelope carries no DSN" }
    }
    return { addressed: true, dsn: new URL(header.dsn) }
  } catch {
    return { addressed: false, refusal: UNREADABLE_ENVELOPE }
  }
}

// The DSN's path is `/<projectId>`.
const isThisProject = (dsn: URL, env: Env) =>
  dsn.hostname === env.SENTRY_INGEST_HOST &&
  dsn.pathname.slice(1) === env.SENTRY_PROJECT_ID

const relayToSentry = (envelope: string, env: Env) =>
  fetch(
    `https://${env.SENTRY_INGEST_HOST}/api/${env.SENTRY_PROJECT_ID}/envelope/`,
    { method: "POST", body: envelope }
  )

const tunnelEnvelope: RouteHandler<typeof tunnelRoute, WorkerEnv> = async (
  c
) => {
  const envelope = await c.req.text()

  const address = addressOf(envelope)
  if (!address.addressed) return c.text(address.refusal, 400)
  if (!isThisProject(address.dsn, c.env)) {
    return c.text("Envelope is addressed to another project", 403)
  }

  const upstream = await relayToSentry(envelope, c.env)

  // Sentry's body is withheld so the route cannot be used to probe.
  return new Response(null, { status: upstream.status })
}

// One chain: `.openapi()` adds each route to the returned type, which
// `packages/api` infers its client from.
const api = app
  .openapi(createConfigRoute, createConfig, refuseAnotherSeedVersion)
  .openapi(getConfigRoute, getConfig)
  .openapi(skillIndexRoute, getSkillIndex)
  .openapi(tunnelRoute, tunnelEnvelope)
  .openapi(listStacksRoute, listStacks)
  .openapi(createStackRoute, createStack)
  .openapi(renameStackRoute, renameStack)
  .openapi(deleteStackRoute, deleteStack)
  .openapi(composeRoute, compose)

export type AppType = typeof api

// Named for OpenAPI spec generation; default for the Workers runtime.
export { api as app }
export default api
