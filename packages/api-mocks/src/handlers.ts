import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix/seed"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { http, HttpResponse } from "msw"

import {
  BINARY_FILE_BYTES,
  COMPOSED_PROPOSAL,
  COMPOSE_FAILED_BODY,
  COMPOSE_TOO_MANY_BODY,
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
  WORKER_ORIGIN,
  savedStack,
} from "./fixtures"

import type { JsonBodyType, PathParams } from "msw"

// One mock of the routes apps/editor calls. `/monitoring` is deliberately
// absent: Sentry's SDK reaches it, no code in the editor does, and it is
// somebody else's envelope format rather than this worker's contract.

// The routes, exported because both of apps/editor's suites had re-declared
// what this file already names — the Playwright support modules and the unit
// tests beside each client. Two copies of a route string cannot see each other
// drift, and neither is wrong on its own.
export const CONFIGS_URL = `${WORKER_ORIGIN}/configs`
export const SKILL_INDEX_URL = `${WORKER_ORIGIN}/skills`

const READ_CONFIG_URL = `${CONFIGS_URL}/:id`

const CREATED = 201
const NOT_FOUND = 404
const INTEGRITY_FAILURE = 500

/**
 * The two statuses `POST /configs` refuses with, and they are two rather than
 * one because only the first names something the person at the keyboard can do
 * (SERVER-04): the tab is running a bundle from before the last deploy, and a
 * reload is the whole fix.
 */
export const OUT_OF_DATE = 409
export const STORE_UNAVAILABLE = 503

/**
 * The answer `POST /configs` gives: the content address it minted.
 *
 * The id is content-addressed, so the real worker mints the same one for the
 * same payload every time — which is what makes answering with a constant
 * faithful rather than a simplification.
 *
 * Named apart from the handler below so a spy that RECORDS the request can
 * answer with it rather than restate it. apps/editor's `captureCreateConfig`
 * wrote out the status and the shape itself before this existed, which is a
 * second claim about what the worker mints.
 */
export const mintedConfig = () =>
  HttpResponse.json({ id: STORED_ID }, { status: CREATED })

const createConfig = http.post(CONFIGS_URL, mintedConfig)

// Which answer comes back is decided by the id, exactly as the store decides
// it: one id holds a payload, one holds bytes that no longer parse, and every
// other id — including `DEAD_LINK_ID` — has never been seen. That default is
// the worker's own behaviour, not a fallback invented here.
const readConfig = http.get<{ id: string }>(READ_CONFIG_URL, ({ params }) => {
  if (params.id === STORED_ID) return HttpResponse.json(STORED_PAYLOAD)

  if (params.id === UNREADABLE_CONFIG_ID) {
    return HttpResponse.text(UNREADABLE_CONFIG_BODY, {
      status: INTEGRITY_FAILURE,
    })
  }

  return HttpResponse.text(NO_CONFIG_BODY, { status: NOT_FOUND })
})

/** The worker answering as it does when nothing has gone wrong. */
export const configHandlers = [createConfig, readConfig]

/**
 * The store holding ONE named id, answering with the payload it was given.
 *
 * `readConfig` above knows exactly the ids this package has fixtures for, and a
 * spec that mints its own — a marketplace payload, or a body it captured off
 * its own POST a moment earlier — needs the store to hold that one instead.
 * Installed AHEAD of `configHandlers`, since `readConfig` claims every id.
 *
 * The payload is whatever JSON the caller holds rather than a `SeedPayload`,
 * because the sharpest use of it is a body read straight off the wire and
 * deliberately NOT parsed: parsing is what the round trip is being tested for.
 */
export const storedConfigHandlerFor = (id: string, payload: JsonBodyType) =>
  http.get(`${CONFIGS_URL}/${id}`, () => HttpResponse.json(payload))

/**
 * The store having never heard of one named id — `readConfig`'s default arm,
 * aimed at an id it would otherwise answer for.
 */
export const missingConfigHandlerFor = (id: string) =>
  http.get(`${CONFIGS_URL}/${id}`, () =>
    HttpResponse.text(NO_CONFIG_BODY, { status: NOT_FOUND })
  )

/**
 * The mint refusing, named by the status it refuses with.
 *
 * A body only where the route declares one: `createSharedConfig` branches on
 * the status alone and never reads a refusal's body, so a body invented for the
 * others would be a claim about the worker that nothing checks.
 */
export const configRefusedHandlerFor = (status: number) =>
  http.post(CONFIGS_URL, () =>
    status === STORE_UNAVAILABLE
      ? HttpResponse.text(STORE_REFUSED_BODY, { status })
      : new HttpResponse(null, { status })
  )

/**
 * KV refusing the write — the one failure the POST has that no request can
 * provoke, since the body was built from the contract's own schema. Installed
 * per test with `configMockServer.use(...)` rather than living in the default
 * set, because a store that always refuses is not the worker's resting state.
 */
export const storeRefusedHandler = configRefusedHandlerFor(STORE_UNAVAILABLE)

/**
 * The mint never getting an answer at all — offline, DNS, a proxy that dropped
 * the connection. Not a refusal: the worker never saw it, so there is no status
 * to read and the app has to say something different about it.
 */
export const configUnreachableHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.error()
)

// The index as the worker serves it when the daily build behind it is landing:
// the whole thing, every allowlisted repository, in one response. The freshness
// header travels with it because it is the half of the contract a body cannot
// carry.
const readSkillIndex = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "fresh" },
  })
)

/** The worker answering as it does when nothing has gone wrong. */
export const skillIndexHandlers = [readSkillIndex]

/**
 * The scheduled build behind the index has stopped landing, so what the worker
 * holds has been ageing for days. A 200 and not a 502 by design: a list of
 * external skills from last week is worth almost what today's is worth, and an
 * error is worth nothing. Installed per test with `configMockServer.use(...)`,
 * because a build that has stopped running is not the resting state.
 */
export const staleSkillIndexHandler = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(STALE_SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "stale" },
  })
)

/**
 * The only case the route refuses outright: no index has been published to KV,
 * so there is genuinely nothing to serve. Reachable in production exactly once
 * — between a first deploy and the first scheduled build that succeeds — and
 * never again afterwards, because the published index carries no expiry.
 */
export const skillIndexUnavailableHandler = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.text(SKILL_INDEX_UNAVAILABLE_BODY, { status: STORE_UNAVAILABLE })
)

// GitHub's contents API, which is where a marketplace's catalogue really lives.
// Wildcarded on the path because the caller builds it, and a handler that
// rebuilt the same string would only be asserting that two copies of one
// expression agree.
export const CATALOG_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/contents/*`

const UNAUTHORIZED = 401
const RATE_LIMITED = 403

const repoOf = (params: { owner: string; repo: string }) =>
  `${params.owner}/${params.repo}`

/**
 * GitHub's own refusal for a repository the caller may not see — and for one
 * that does not exist, which is the same answer on purpose.
 *
 * Exported because a browser suite that answers a per-spec estate of
 * repositories still has to refuse the ones outside it, and a second spelling
 * of this body would be a second claim about GitHub.
 */
export const githubNotFound = () =>
  HttpResponse.json({ message: "Not Found" }, { status: NOT_FOUND })

/** Whether this request carries the token the private marketplace accepts. */
export const carriesMarketplaceToken = (request: Request) =>
  request.headers.get("Authorization") === `Bearer ${MARKETPLACE_TOKEN}`

/**
 * The public marketplace, served to anyone. A private one 404s until the token
 * arrives — GitHub's own behaviour, and the reason a 404 offers the token
 * rather than declaring the name wrong: an unauthorized caller cannot tell a
 * repository that does not exist from one they may not see, and neither can we.
 */
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

/** GitHub answering as it does for a marketplace anyone may read. */
export const catalogHandlers = [readCatalog]

/**
 * A catalogue that is JSON and is not a catalogue. The one failure the editor
 * must never retry: the bytes will not improve, so the author's build is what
 * has to change, and the message has to name the field that says so.
 */
export const malformedCatalogHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json(MALFORMED_CATALOG)
)

/** A token that was real and is not any more — revoked, expired, mistyped. */
export const catalogUnauthorizedHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json({ message: "Bad credentials" }, { status: UNAUTHORIZED })
)

/**
 * A token whose scopes do not cover this repository, and the unauthenticated
 * rate limit — GitHub spends one status on both. Either way the answer is the
 * same shape of fix as a 401's, so the token field is what has to appear.
 */
export const catalogForbiddenHandler = http.get(CATALOG_URL, () =>
  HttpResponse.json(
    { message: "API rate limit exceeded" },
    { status: RATE_LIMITED }
  )
)

/** GitHub unreachable — offline, DNS, a proxy that dropped the connection. */
export const catalogUnreachableHandler = http.get(CATALOG_URL, () =>
  HttpResponse.error()
)

// ── An external skill's own directory ────────────────────────────────────
//
// Two origins, because the real fetch uses two. The git trees API lists the
// whole repository in ONE request whatever the nesting depth — which is what
// keeps a skill with a `reference/` directory to a single call against the
// sixty-an-hour anonymous limit — and every file after that comes off the raw
// CDN, which is rate-limit-free and sends `access-control-allow-origin: *`.

const TREE_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/git/trees/:ref`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/:owner/:repo/:ref/*`

// The two skills the specs stage, by the repository they come from.
const SKILL_TREES = [EXTERNAL_SKILL, OTHER_EXTERNAL_SKILL]

const blobsOf = (skill: { path: string; files: Record<string, string> }) =>
  Object.entries(skill.files).map(([relative, text]) => ({
    path: `${skill.path}/${relative}`,
    mode: "100644",
    type: "blob",
    size: text.length,
    sha: relative,
  }))

// A repository holds more than the one skill a spec is after, so the tree
// carries a decoy: a listing filtered by prefix is only proved by entries the
// prefix has to exclude.
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

/** GitHub answering as it does for a public repository holding a skill. */
export const skillContentsHandlers = [readSkillTree, readSkillFile]

/**
 * A skill directory far past the per-skill cap. One file rather than the real
 * sixty-one, because what is being tested is the refusal and not the arithmetic
 * of summing a tree.
 */
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

/**
 * A skill directory holding a file that is not text. The tree says nothing
 * about encoding — every entry is a blob — so this is only detectable once the
 * bytes arrive, which is why the refusal lives at the decode and not the list.
 */
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

// The signed-in half of the worker, added on 2026-08-29: a session, a person's
// saved stacks and the composer's one call. Every one of them sits behind
// `authenticated` (apps/server/src/auth.ts), which is why the DEFAULT set here
// is the worker as it answers a browser holding no cookie — `null` for the
// session, 401 for the other five. That is the state every first visit is in,
// and the one the app is fully usable in.

const AUTH_URL = `${WORKER_ORIGIN}/api/auth`

// Exported for the reason `CONFIGS_URL` is: each of these was written out again
// beside a test that records the request rather than the answer, and two copies
// of a route string cannot see each other drift.
export const SESSION_URL = `${AUTH_URL}/get-session`
export const SIGN_IN_URL = `${AUTH_URL}/sign-in/social`

const SIGN_OUT_URL = `${AUTH_URL}/sign-out`
export const STACKS_URL = `${WORKER_ORIGIN}/stacks`
export const COMPOSE_URL = `${WORKER_ORIGIN}/compose`

const STACK_URL = `${STACKS_URL}/:id`

const NO_CONTENT = 204
const TOO_MANY = 429
const SERVER_ERROR = 500
const MODEL_SILENT = 502

const readNoSession = http.get(SESSION_URL, () => HttpResponse.json(NO_SESSION))

// Answered the same whether or not a session exists, because starting a flow
// is what a signed-out browser does — this is the one auth route the default
// set and the signed-in set agree about.
const startSignIn = http.post(SIGN_IN_URL, () =>
  HttpResponse.json({ url: GITHUB_AUTHORIZE_URL })
)

const signOut = http.post(SIGN_OUT_URL, () =>
  HttpResponse.json({ success: true })
)

/** The worker's auth surface answering a browser that holds no session. */
export const authHandlers = [readNoSession, startSignIn, signOut]

const refuseUnauthorized = () =>
  HttpResponse.json(UNAUTHORIZED_BODY, { status: UNAUTHORIZED })

/**
 * All four stack routes, refusing. Four rather than the two the editor has a
 * client for: what the routes answer without a cookie is not a function of who
 * calls them, and a set describing half the worker would let a mock and a
 * worker disagree in the half nothing looked at.
 */
export const stackHandlers = [
  http.get(STACKS_URL, refuseUnauthorized),
  http.post(STACKS_URL, refuseUnauthorized),
  http.patch(STACK_URL, refuseUnauthorized),
  http.delete(STACK_URL, refuseUnauthorized),
]

/** The composer's route, refusing for the same reason. */
export const composeHandlers = [http.post(COMPOSE_URL, refuseUnauthorized)]

const readSignedInSession = http.get(SESSION_URL, () =>
  HttpResponse.json(SIGNED_IN_SESSION)
)

const listStacks = http.get(STACKS_URL, () => HttpResponse.json(SAVED_STACKS))

// Answers with what it was sent, exactly as the worker does: the id and the
// timestamps are minted server-side, and the name and the pointer come off the
// request untouched. Nothing is stored, for the reason `createConfig` stores
// nothing — a mock that keeps a list is a second implementation of the route,
// and what is worth asserting about a save is the REQUEST.
const createStack = http.post<PathParams, { name: string; configId: string }>(
  STACKS_URL,
  async ({ request }) => {
    const { name, configId } = await request.json()
    return HttpResponse.json(savedStack(name, configId), { status: CREATED })
  }
)

// An update in place: the id, the pointer and the creation time are untouched,
// the name is the caller's and `updatedAt` moves. WHICH row is a question only
// a store can answer, so the mock renames the one it has and echoes the id it
// was asked for.
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

// 204 whether or not a row went, because the caller's question is "make this
// not exist" and the answer is the same either way.
const deleteStack = http.delete(
  STACK_URL,
  () => new HttpResponse(null, { status: NO_CONTENT })
)

const compose = http.post(COMPOSE_URL, () =>
  HttpResponse.json(COMPOSED_PROPOSAL)
)

/**
 * The whole signed-in worker in one array, installed per test with
 * `configMockServer.use(...signedInHandlers)`.
 *
 * One array rather than one per surface, deliberately: a single cookie decides
 * all of it, so a set that flips the session to signed in while leaving
 * `/stacks` answering 401 describes a worker that cannot exist — and a test
 * built on one asserts against a state production never reaches.
 *
 * A refusal below that can only be reached signed in goes AHEAD of this in the
 * same call — `use(stackNotFoundHandler, ...signedInHandlers)`, not the other
 * way round. `use()` matches in argument order, so a one-off placed after this
 * array is shadowed by it and never answers anything.
 */
export const signedInHandlers = [
  readSignedInSession,
  listStacks,
  createStack,
  renameStack,
  deleteStack,
  compose,
]

/**
 * A rename naming a stack this person does not have. 404 and not 403, and the
 * distinction is the worker's: another person's id and an id nobody has are
 * the same answer, because the alternative confirms the stack exists.
 *
 * Installed on top of `signedInHandlers`, which is the only state it can be
 * reached from.
 */
export const stackNotFoundHandler = http.patch(STACK_URL, () =>
  HttpResponse.json(NO_STACK_BODY, { status: NOT_FOUND })
)

// A status and nothing else, here and in the five below. The clients branch on
// the status alone and never read a refusal's body — `createStack` in
// apps/editor/src/lib/api/stacks.ts and both calls in `api/auth.ts` — so a
// body invented here would be a claim about the worker that nothing checks.
// The routes that DO declare a body get it, above.

/**
 * The save refusing, named by the status it refuses with.
 *
 * Parameterised because a suite names the status it is exercising, and a fixed
 * handler per status would be this one expression written out again — which is
 * what apps/editor's `stubStackRefusal` was.
 */
export const stackRefusedHandlerFor = (status: number) =>
  http.post(STACKS_URL, () =>
    status === UNAUTHORIZED
      ? refuseUnauthorized()
      : new HttpResponse(null, { status })
  )

/** The save failing for a reason the route does not declare: an outage, a bug. */
export const stackRefusedHandler = stackRefusedHandlerFor(SERVER_ERROR)

/** The save never getting an answer at all — the worker never saw it. */
export const stackUnreachableHandler = http.post(STACKS_URL, () =>
  HttpResponse.error()
)

/**
 * The composer's route refusing, named by the status it refuses with.
 *
 * The two bodies the route declares, and nothing for every other — `/compose`
 * writes its own 429 and its own 502, and `composeProposal` reads neither, so
 * a body invented for the rest would be a claim nothing checks.
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

/**
 * The limiter doing its job. Keyed on the person rather than the address
 * (apps/server/src/compose.ts), which is what an identity buys: this route
 * spends real money on every call, and a signed-in caller is one that can be
 * quota'd rather than merely counted.
 */
export const composeTooManyHandler = composeRefusedHandlerFor(TOO_MANY)

/**
 * The model answering with nothing usable, or not at all. One handler for both
 * because the worker spends one status on them, and it says no more than that
 * on purpose — an upstream message can carry request ids, account details and
 * quota figures, none of which belong in a browser.
 */
export const composeRefusedHandler = composeRefusedHandlerFor(MODEL_SILENT)

/** The compose call never getting an answer at all. */
export const composeUnreachableHandler = http.post(COMPOSE_URL, () =>
  HttpResponse.error()
)

/**
 * Sign-in refused by the auth routes' own limiter, which is tighter than the
 * rest of them — the windows are in apps/server/src/auth.ts. The one auth
 * refusal that names its own fix, which is why the client tells it apart.
 */
export const signInRateLimitedHandler = http.post(
  SIGN_IN_URL,
  () => new HttpResponse(null, { status: TOO_MANY })
)

/** The worker answering, and declining to start the flow. */
export const signInRefusedHandler = http.post(
  SIGN_IN_URL,
  () => new HttpResponse(null, { status: SERVER_ERROR })
)

/**
 * A 200 that carries no `url`. Its own case rather than a variant of the
 * refusal above: the request succeeded, so nothing about the status says the
 * browser is not about to leave, and the client has to notice that it isn't.
 */
export const signInWithoutRedirectHandler = http.post(SIGN_IN_URL, () =>
  HttpResponse.json({})
)

/** Sign-in never getting an answer at all. */
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

/**
 * The session read never getting an answer. Not a refusal on this side: the
 * client reads an unreachable worker as signed out, so an outage degrades to
 * the experience every first visitor already has rather than to an error
 * nobody can act on.
 */
export const sessionUnreachableHandler = http.get(SESSION_URL, () =>
  HttpResponse.error()
)

/**
 * The whole worker answering a browser that holds no cookie — the resting
 * state, and the one every first visit is in.
 *
 * Named here rather than assembled by each runner, because a runner that
 * composes its own list is a second statement of what a first visit sees, free
 * to fall a route behind without either side noticing. `configMockServer` in
 * `./node` spreads this, and so does any binding that installs these handlers
 * its own way.
 *
 * The signed-in worker is deliberately not part of it: one cookie decides the
 * session, all four `/stacks` routes and `/compose` at once, so a suite that
 * wants that worker installs `signedInHandlers` ahead of these.
 */
export const defaultHandlers = [
  ...configHandlers,
  ...skillIndexHandlers,
  ...catalogHandlers,
  ...skillContentsHandlers,
  ...authHandlers,
  ...stackHandlers,
  ...composeHandlers,
]
