import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { seedPayloadSchema } from "@workspace/matrix/seed"
import { cors } from "hono/cors"

// A realistic payload is a few KB; anything bigger is not an editor
// config, so it is refused before JSON parsing spends memory on it.
const MAX_BODY_BYTES = 32_768

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
    503: { description: "The store refused the read" },
  },
})

const app = new OpenAPIHono<{ Bindings: Env }>()

// Registered before the routes so a preflight never reaches them. Only the
// configured web origin may call from a browser; the CLI is not a browser and
// is unaffected.
const allowOnlyWebOrigin = cors({
  origin: (origin, c) => (origin === c.env.WEB_ORIGIN ? origin : null),
})

app.use("/configs/*", allowOnlyWebOrigin)
app.use("/configs", allowOnlyWebOrigin)
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

// Workers Logs is already enabled in wrangler.jsonc, and it ingests a logged
// object as structured fields — so this is queryable in the dashboard without
// an SDK, a dependency or a second vendor. A KV write is the one thing here
// that can fail for reasons outside this code: the free tier allows 1000 a
// day, and past that a share fails with nothing anywhere saying why.
const logKvFailure = (operation: string, error: unknown) =>
  console.error({
    event: "kv_failure",
    operation,
    message: error instanceof Error ? error.message : String(error),
  })

app.openapi(createConfigRoute, async (c) => {
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
})

app.openapi(getConfigRoute, async (c) => {
  const { id } = c.req.valid("param")

  let stored: string | null
  try {
    stored = await c.env.CONFIGS.get(id)
  } catch (error) {
    logKvFailure("get", error)
    return c.text("Could not read this config", 503)
  }

  if (stored === null) return c.text("No config under this id", 404)

  // Content-addressed, therefore immutable: a CLI or proxy may cache forever.
  return c.json(JSON.parse(stored), 200, {
    "cache-control": `public, max-age=${YEAR_SECONDS}, immutable`,
  })
})

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

app.openapi(tunnelRoute, async (c) => {
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
})

// Named for build-time OpenAPI spec generation; default for the Workers runtime.
export { app }
export default app
