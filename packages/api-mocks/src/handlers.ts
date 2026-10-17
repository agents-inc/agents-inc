import {
  MAX_EXTERNAL_SKILL_BYTES,
  installableSeedPayloadSchema,
} from "@workspace/matrix/seed"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { http, HttpResponse } from "msw"

import { EXPOSE_HEADERS_HEADER } from "./answer"
import {
  BINARY_FILE_BYTES,
  COMPOSED_PROPOSAL,
  COMPOSE_FAILED_BODY,
  COMPOSE_TOO_LONG_BODY,
  COMPOSE_TOO_MANY_BODY,
  CONFIG_WRITE_WINDOW_SECONDS,
  EXTERNAL_SKILL,
  GITHUB_AUTHORIZE_URL,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  MALFORMED_CATALOG,
  OTHER_EXTERNAL_SKILL,
  OVERSIZED_EXTERNAL_SKILL,
  MARKETPLACE_CATALOG,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  NO_CONFIG_BODY,
  NO_SESSION,
  NO_STACK_BODY,
  PRIVATE_MARKETPLACE_REF,
  RATE_LIMITED_BODY,
  SAVED_STACK,
  SAVED_STACKS,
  SIGNED_IN_SESSION,
  SKILL_INDEX,
  SKILL_INDEX_UNAVAILABLE_BODY,
  STACK_RENAMED_AT,
  STALE_SKILL_INDEX,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_REFUSED_BODY,
  UNAUTHORIZED_BODY,
  UNREADABLE_CONFIG_BODY,
  UNREADABLE_CONFIG_ID,
  WORKER_EXPOSED_HEADERS,
  WORKER_ORIGIN,
  savedStack,
} from "./fixtures"

import type { JsonBodyType, PathParams } from "msw"

// `/monitoring` is absent: only Sentry's SDK calls it.

// Exported so the editor's suites share one copy of each route.
export const CONFIGS_URL = `${WORKER_ORIGIN}/configs`
export const SKILL_INDEX_URL = `${WORKER_ORIGIN}/skills`

const READ_CONFIG_URL = `${CONFIGS_URL}/:id`

const CREATED = 201
const NOT_FOUND = 404
const INTEGRITY_FAILURE = 500

// hono's `c.text` content type. The CLI gates quoting on it, so a bare `text/plain` would hide a
// broken check.
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8"

// The worker's own `c.text` refusals; GitHub raw CDN answers do not come through here.
const workerText = (body: string, status: number) =>
  HttpResponse.text(body, {
    status,
    headers: { "content-type": HONO_TEXT_PLAIN },
  })

// What `POST /configs` answers a body its write schema refuses.
const REFUSED = 400

// 409 is a stale bundle (a reload fixes it); 503 is the store.
export const OUT_OF_DATE = 409
export const STORE_UNAVAILABLE = 503

/** Ids are content-addressed, so a constant answer is faithful. */
export const mintedConfig = () =>
  HttpResponse.json({ id: STORED_ID }, { status: CREATED })

/**
 * Validates with the worker's own write schema; a refusal sends the `safeParse` result as
 * `@hono/zod-validator`'s default hook does.
 */
const createConfig = http.post(CONFIGS_URL, async ({ request }) => {
  const validated = installableSeedPayloadSchema.safeParse(await request.json())
  if (validated.success) return mintedConfig()

  return HttpResponse.json(
    { success: false, error: validated.error },
    { status: REFUSED }
  )
})

// Answered by id as the store does; every unknown id is a 404.
const readConfig = http.get<{ id: string }>(READ_CONFIG_URL, ({ params }) => {
  if (params.id === STORED_ID) return HttpResponse.json(STORED_PAYLOAD)

  if (params.id === UNREADABLE_CONFIG_ID) {
    return workerText(UNREADABLE_CONFIG_BODY, INTEGRITY_FAILURE)
  }

  return workerText(NO_CONFIG_BODY, NOT_FOUND)
})

export const configHandlers = [createConfig, readConfig]

/** Install ahead of `configHandlers`, whose `readConfig` claims every id. */
export const storedConfigHandlerFor = (id: string, payload: JsonBodyType) =>
  http.get(`${CONFIGS_URL}/${id}`, () => HttpResponse.json(payload))

export const missingConfigHandlerFor = (id: string) =>
  http.get(`${CONFIGS_URL}/${id}`, () => workerText(NO_CONFIG_BODY, NOT_FOUND))

export const TOO_MANY = 429

// Names the CORS exposure itself: `@msw/playwright` fulfils responses verbatim, so `retry-after`
// would otherwise be hidden from the editor.
const rateLimited = () =>
  HttpResponse.text(RATE_LIMITED_BODY, {
    status: TOO_MANY,
    headers: {
      "content-type": HONO_TEXT_PLAIN,
      "retry-after": String(CONFIG_WRITE_WINDOW_SECONDS),
      [EXPOSE_HEADERS_HEADER]: WORKER_EXPOSED_HEADERS,
    },
  })

const configRefusalOf = (status: number) => {
  if (status === STORE_UNAVAILABLE)
    return workerText(STORE_REFUSED_BODY, status)
  if (status === TOO_MANY) return rateLimited()

  return new HttpResponse(null, { status })
}

/** The worker's own answer for 503 and 429; a null body for every other status. */
export const configRefusedHandlerFor = (status: number) =>
  http.post(CONFIGS_URL, () => configRefusalOf(status))

export const configRateLimitedHandler = configRefusedHandlerFor(TOO_MANY)

/** KV refusing the write: the one refusal no body can provoke. */
export const storeRefusedHandler = configRefusedHandlerFor(STORE_UNAVAILABLE)

/** Network failure, not a refusal: there is no status to read. */
export const configUnreachableHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.error()
)

// The freshness header is the half of the contract a body cannot carry.
const readSkillIndex = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "fresh" },
  })
)

export const skillIndexHandlers = [readSkillIndex]

/** A 200 by design: last week's index beats an error. */
export const staleSkillIndexHandler = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(STALE_SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "stale" },
  })
)

/** No index published yet: only reachable before the first scheduled build succeeds. */
export const skillIndexUnavailableHandler = http.get(SKILL_INDEX_URL, () =>
  workerText(SKILL_INDEX_UNAVAILABLE_BODY, STORE_UNAVAILABLE)
)

// Wildcarded: the caller builds the path.
export const CATALOG_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/contents/*`

const UNAUTHORIZED = 401
const RATE_LIMITED = 403

const repoOf = (params: { owner: string; repo: string }) =>
  `${params.owner}/${params.repo}`

/** GitHub's answer for a repository that is missing or hidden: the same on purpose. */
export const githubNotFound = () =>
  HttpResponse.json({ message: "Not Found" }, { status: NOT_FOUND })

export const carriesMarketplaceToken = (request: Request) =>
  request.headers.get("Authorization") === `Bearer ${MARKETPLACE_TOKEN}`

// A private marketplace 404s until the token arrives, as GitHub does.
const readCatalog = http.get<{ owner: string; repo: string }>(
  CATALOG_URL,
  ({ params, request }) => {
    const repo = repoOf(params)

    if (repo === MARKETPLACE_REF) return HttpResponse.json(MARKETPLACE_CATALOG)

    if (repo === PRIVATE_MARKETPLACE_REF) {
      return carriesMarketplaceToken(request)
        ? HttpResponse.json(MARKETPLACE_CATALOG)
        : githubNotFound()
    }

    return githubNotFound()
  }
)

export const catalogHandlers = [readCatalog]

/** JSON that is not a catalogue: the one failure never worth retrying. */
export const malformedCatalogHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json(MALFORMED_CATALOG)
)

/** A token that was real and is not any more — revoked, expired, mistyped. */
export const catalogUnauthorizedHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json({ message: "Bad credentials" }, { status: UNAUTHORIZED })
)

/** GitHub spends 403 on both missing scopes and the anonymous rate limit. */
export const catalogForbiddenHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json(
    { message: "API rate limit exceeded" },
    { status: RATE_LIMITED }
  )
)

export const catalogUnreachableHandler = http.get(CATALOG_URL, () =>
  HttpResponse.error()
)

// The trees API lists the whole repo in one call (anonymous limit is 60/h); files come off the
// raw CDN, which is unlimited and CORS-open.

const TREE_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/git/trees/:ref`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/:owner/:repo/:ref/*`

const SKILL_TREES = [EXTERNAL_SKILL, OTHER_EXTERNAL_SKILL]

const blobsOf = (skill: { path: string; files: Record<string, string> }) =>
  Object.entries(skill.files).map(([relative, text]) => ({
    path: `${skill.path}/${relative}`,
    mode: "100644",
    type: "blob",
    size: text.length,
    sha: relative,
  }))

// A decoy outside the skill's prefix, so the prefix filter is proved.
const DECOY_BLOB = {
  path: "README.md",
  mode: "100644",
  type: "blob",
  size: 12,
  sha: "readme",
}

const treeFor = (repo: string) => {
  const skill = SKILL_TREES.find((candidate) => candidate.repo === repo)
  if (!skill) return undefined

  return {
    sha: "HEAD",
    truncated: false,
    tree: [DECOY_BLOB, ...blobsOf(skill)],
  }
}

const readSkillTree = http.get<{ owner: string; repo: string }>(
  TREE_URL,
  ({ params }) => {
    const tree = treeFor(repoOf(params))

    return tree ? HttpResponse.json(tree) : githubNotFound()
  }
)

const textOf = (repo: string, fullPath: string) => {
  const skill = SKILL_TREES.find((candidate) => candidate.repo === repo)
  if (!skill) return undefined

  const relative = fullPath.slice(skill.path.length + 1)
  return (skill.files as Record<string, string>)[relative]
}

const readSkillFile = http.get<{ owner: string; repo: string }>(
  RAW_URL,
  ({ params, request }) => {
    // msw's `*` lands in `params[0]`; the URL is the honest source for it.
    const fullPath = new URL(request.url).pathname.split("/").slice(4).join("/")
    const text = textOf(repoOf(params), decodeURIComponent(fullPath))

    return text === undefined
      ? HttpResponse.text("404: Not Found", { status: NOT_FOUND })
      : HttpResponse.text(text)
  }
)

export const skillContentsHandlers = [readSkillTree, readSkillFile]

/** One file past the per-skill cap. */
export const oversizedSkillHandler = http.get(TREE_URL, () =>
  HttpResponse.json({
    sha: "HEAD",
    truncated: false,
    tree: [
      {
        path: `${OVERSIZED_EXTERNAL_SKILL.path}/SKILL.md`,
        mode: "100644",
        type: "blob",
        size: MAX_EXTERNAL_SKILL_BYTES + 1,
        sha: "huge",
      },
    ],
  })
)

/** A non-text file is only detectable once the bytes arrive. */
export const binarySkillFileHandler = http.get(RAW_URL, () =>
  HttpResponse.arrayBuffer(BINARY_FILE_BYTES.buffer, {
    headers: { "content-type": "application/octet-stream" },
  })
)

/** The repository exists and holds no such directory. */
export const emptySkillTreeHandler = http.get(TREE_URL, () =>
  HttpResponse.json({ sha: "HEAD", truncated: false, tree: [DECOY_BLOB] })
)

/** GitHub unreachable while listing — the one failure retrying can fix. */
export const skillTreeUnreachableHandler = http.get(TREE_URL, () =>
  HttpResponse.error()
)

// Signed-in routes sit behind `authenticated`, so the default set answers a cookieless browser:
// a `null` session and 401 elsewhere.

const AUTH_URL = `${WORKER_ORIGIN}/api/auth`

export const SESSION_URL = `${AUTH_URL}/get-session`
export const SIGN_IN_URL = `${AUTH_URL}/sign-in/social`

export const SIGN_OUT_URL = `${AUTH_URL}/sign-out`
export const STACKS_URL = `${WORKER_ORIGIN}/stacks`
export const COMPOSE_URL = `${WORKER_ORIGIN}/compose`

const STACK_URL = `${STACKS_URL}/:id`

const NO_CONTENT = 204
const SERVER_ERROR = 500
const MODEL_SILENT = 502

const readNoSession = http.get(SESSION_URL, () => HttpResponse.json(NO_SESSION))

const UNSUPPORTED_MEDIA_TYPE = 415
const BAD_REQUEST = 400

/**
 * Better Auth's POST guards: 415 without a JSON content type, 400 for an unparseable body.
 * Reads a clone so specs can still read the request.
 */
const requiringJson =
  (answer: () => Response) =>
  async ({ request }: { request: Request }): Promise<Response> => {
    const contentType = request.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
      return HttpResponse.json(
        {
          message: "Content-Type is required. Allowed types: application/json",
          code: "UNSUPPORTED_MEDIA_TYPE",
        },
        { status: UNSUPPORTED_MEDIA_TYPE }
      )
    }

    try {
      await request.clone().json()
    } catch {
      return HttpResponse.json(
        { message: "Invalid JSON in request body", code: "BAD_REQUEST" },
        { status: BAD_REQUEST }
      )
    }

    return answer()
  }

// Same answer signed in or out: starting a flow is what a signed-out browser does.
const startSignIn = http.post(
  SIGN_IN_URL,
  requiringJson(() => HttpResponse.json({ url: GITHUB_AUTHORIZE_URL }))
)

const signOut = http.post(
  SIGN_OUT_URL,
  requiringJson(() => HttpResponse.json({ success: true }))
)

export const authHandlers = [readNoSession, startSignIn, signOut]

const refuseUnauthorized = () =>
  HttpResponse.json(UNAUTHORIZED_BODY, { status: UNAUTHORIZED })

export const stackHandlers = [
  http.get(STACKS_URL, refuseUnauthorized),
  http.post(STACKS_URL, refuseUnauthorized),
  http.patch(STACK_URL, refuseUnauthorized),
  http.delete(STACK_URL, refuseUnauthorized),
]

export const composeHandlers = [http.post(COMPOSE_URL, refuseUnauthorized)]

const readSignedInSession = http.get(SESSION_URL, () =>
  HttpResponse.json(SIGNED_IN_SESSION)
)

const listStacks = http.get(STACKS_URL, () => HttpResponse.json(SAVED_STACKS))

// Echoes the request with server-minted id and timestamps; nothing is stored.
const createStack = http.post<PathParams, { name: string; configId: string }>(
  STACKS_URL,
  async ({ request }) => {
    const { name, configId } = await request.json()
    return HttpResponse.json(savedStack(name, configId), { status: CREATED })
  }
)

// Renames in place; only `name` and `updatedAt` change.
const renameStack = http.patch<{ id: string }, { name: string }>(
  STACK_URL,
  async ({ params, request }) => {
    const { name } = await request.json()

    return HttpResponse.json({
      ...SAVED_STACK,
      id: params.id,
      name,
      updatedAt: STACK_RENAMED_AT,
    })
  }
)

// 204 whether or not a row existed.
const deleteStack = http.delete(
  STACK_URL,
  () => new HttpResponse(null, { status: NO_CONTENT })
)

const compose = http.post(COMPOSE_URL, () =>
  HttpResponse.json(COMPOSED_PROPOSAL)
)

/**
 * One cookie decides every signed-in route, so they ship as one set. `use()` matches in argument
 * order: pass one-offs ahead of this array or they are shadowed.
 */
export const signedInHandlers = [
  readSignedInSession,
  listStacks,
  createStack,
  renameStack,
  deleteStack,
  compose,
]

/** 404 rather than 403, so another person's id looks like no id. */
export const stackNotFoundHandler = http.patch(STACK_URL, () =>
  HttpResponse.json(NO_STACK_BODY, { status: NOT_FOUND })
)

// The clients branch on status alone, so the refusals below carry no body.

export const stackRefusedHandlerFor = (status: number) =>
  http.post(STACKS_URL, () =>
    status === UNAUTHORIZED
      ? refuseUnauthorized()
      : new HttpResponse(null, { status })
  )

/** The save failing for a reason the route does not declare: an outage, a bug. */
export const stackRefusedHandler = stackRefusedHandlerFor(SERVER_ERROR)

export const stackUnreachableHandler = http.post(STACKS_URL, () =>
  HttpResponse.error()
)

/**
 * Declared bodies for 429 and 502, none otherwise. `/compose` tells its two 400s apart by body, so
 * this bodiless 400 is the unreadable case and `composeTooLongHandler` the readable one.
 */
const composeRefusalOf = (status: number) => {
  if (status === TOO_MANY) {
    return HttpResponse.json(COMPOSE_TOO_MANY_BODY, { status })
  }
  if (status === MODEL_SILENT) {
    return HttpResponse.json(COMPOSE_FAILED_BODY, { status })
  }

  return new HttpResponse(null, { status })
}

export const composeRefusedHandlerFor = (status: number) =>
  http.post(COMPOSE_URL, () => composeRefusalOf(status))

/** Its own handler: an empty sentence gets the same 400, so only the body tells them apart. */
export const composeTooLongHandler = http.post(COMPOSE_URL, () =>
  HttpResponse.json(COMPOSE_TOO_LONG_BODY, { status: BAD_REQUEST })
)

export const composeTooManyHandler = composeRefusedHandlerFor(TOO_MANY)

/** One status for a silent or unusable model; upstream detail is withheld from the browser. */
export const composeRefusedHandler = composeRefusedHandlerFor(MODEL_SILENT)

export const composeUnreachableHandler = http.post(COMPOSE_URL, () =>
  HttpResponse.error()
)

/** The auth limiter: the one auth refusal that names its own fix. */
export const signInRateLimitedHandler = http.post(
  SIGN_IN_URL,
  () => new HttpResponse(null, { status: TOO_MANY })
)

/** The worker answering, and declining to start the flow. */
export const signInRefusedHandler = http.post(
  SIGN_IN_URL,
  () => new HttpResponse(null, { status: SERVER_ERROR })
)

/** A 200 with no `url`: the client must notice it is not redirecting. */
export const signInWithoutRedirectHandler = http.post(SIGN_IN_URL, () =>
  HttpResponse.json({})
)

export const signInUnreachableHandler = http.post(SIGN_IN_URL, () =>
  HttpResponse.error()
)

export const signOutRefusedHandler = http.post(
  SIGN_OUT_URL,
  () => new HttpResponse(null, { status: SERVER_ERROR })
)

export const signOutUnreachableHandler = http.post(SIGN_OUT_URL, () =>
  HttpResponse.error()
)

/** Read as signed out, so an outage degrades to a first visit. */
export const sessionUnreachableHandler = http.get(SESSION_URL, () =>
  HttpResponse.error()
)

/** The worker as a cookieless browser sees it; install `signedInHandlers` ahead of these. */
export const defaultHandlers = [
  ...configHandlers,
  ...skillIndexHandlers,
  ...catalogHandlers,
  ...skillContentsHandlers,
  ...authHandlers,
  ...stackHandlers,
  ...composeHandlers,
]
