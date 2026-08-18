import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix/seed"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { http, HttpResponse } from "msw"

import {
  BINARY_FILE_BYTES,
  EXTERNAL_SKILL,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  MALFORMED_CATALOG,
  OTHER_EXTERNAL_SKILL,
  OVERSIZED_EXTERNAL_SKILL,
  MARKETPLACE_CATALOG,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  NO_CONFIG_BODY,
  PRIVATE_MARKETPLACE_REF,
  SKILL_INDEX,
  SKILL_INDEX_UNAVAILABLE_BODY,
  STALE_SKILL_INDEX,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_REFUSED_BODY,
  UNREADABLE_CONFIG_BODY,
  UNREADABLE_CONFIG_ID,
  WORKER_ORIGIN,
} from "./fixtures"

// One mock of the three routes apps/editor calls. `/monitoring` is the worker's
// fourth route and is deliberately absent: Sentry's SDK reaches it, no code in
// the editor does, and a handler nothing calls is a claim nothing checks.

const CREATE_CONFIG_URL = `${WORKER_ORIGIN}/configs`
const READ_CONFIG_URL = `${WORKER_ORIGIN}/configs/:id`
const SKILL_INDEX_URL = `${WORKER_ORIGIN}/skills`

const CREATED = 201
const NOT_FOUND = 404
const INTEGRITY_FAILURE = 500
const STORE_UNAVAILABLE = 503

// The id is content-addressed, so the real worker mints the same one for the
// same payload every time — which is what makes answering with a constant
// faithful rather than a simplification.
const createConfig = http.post(CREATE_CONFIG_URL, () =>
  HttpResponse.json({ id: STORED_ID }, { status: CREATED })
)

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
 * KV refusing the write — the one failure the POST has that no request can
 * provoke, since the body was built from the contract's own schema. Installed
 * per test with `configMockServer.use(...)` rather than living in the default
 * set, because a store that always refuses is not the worker's resting state.
 */
export const storeRefusedHandler = http.post(CREATE_CONFIG_URL, () =>
  HttpResponse.text(STORE_REFUSED_BODY, { status: STORE_UNAVAILABLE })
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
const CATALOG_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/contents/*`

const UNAUTHORIZED = 401
const RATE_LIMITED = 403

const repoOf = (params: { owner: string; repo: string }) =>
  `${params.owner}/${params.repo}`

const isAuthorized = (request: Request) =>
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
      return isAuthorized(request)
        ? HttpResponse.json(MARKETPLACE_CATALOG)
        : HttpResponse.json({ message: "Not Found" }, { status: NOT_FOUND })
    }

    return HttpResponse.json({ message: "Not Found" }, { status: NOT_FOUND })
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

    return tree
      ? HttpResponse.json(tree)
      : HttpResponse.json({ message: "Not Found" }, { status: NOT_FOUND })
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
