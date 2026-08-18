import { matrixSchema, type Matrix } from "@workspace/matrix/matrix-schema"

import { reportIssue } from "@/lib/observability/report"

// A marketplace's catalogue, fetched from GitHub DIRECTLY.
//
// Not through our worker, and that is the design rather than an optimisation:
// an org's skill names, descriptions and stack philosophy are the org's, so the
// bytes go from their repository to their browser and pass through nothing of
// ours. The worker's own role stays what it was — minting share ids — and the
// token that authorizes a private read never reaches it.
//
// `build marketplace` emits `catalog.json` in the matrix's own wire shape, so
// there is no transform layer here: one fetch, one `safeParse` against the
// schema both ends share, and what comes out is what the read models take.
//
// Built on `skill-index.ts`'s shape — a discriminated result, `safeParse` over
// the shared schema, `reportIssue` for what the user cannot see, and nothing
// thrown. It differs in one way that matters: a failure carries a KIND, because
// the three things that can go wrong here have three different fixes and the
// dialog has to offer the right one.

// The imports subpath, deliberately. The barrel pulls `read-model/source.ts`,
// which parses the whole vendored matrix at import time — measurable work a
// module whose job is one fetch has no reason to do.

const GITHUB_API_ORIGIN = "https://api.github.com"

// Where `build marketplace` writes the catalogue: beside `marketplace.json`, in
// the plugin manifest directory. The CLI spells this in `consts.ts`; the two
// are in different packages and nothing but a test would notice them disagree,
// which is why `catalogUrl` is pinned by one.
const CATALOG_PATH = ".claude-plugin/catalog.json"

// GitHub serves the file's own bytes rather than its base64 envelope when asked
// for this. The envelope would work too and would cost a base64 decode of 400 KB
// for nothing.
const RAW_CONTENT = "application/vnd.github.raw+json"

// `owner/repo`, with everything a user might paste around it stripped: the
// `github:` and `gh:` prefixes `--marketplace` takes on the CLI, and the
// https://github.com/… a browser puts on the clipboard.
const MARKETPLACE_PATTERN =
  /^(?:(?:github|gh):|https?:\/\/(?:www\.)?github\.com\/)?([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#([^\s#]+))?$/

export type MarketplaceRef = {
  owner: string
  repo: string
  /** A branch or tag, for a catalogue not yet on the default branch. */
  ref?: string
}

/**
 * The repository behind what someone typed, or `undefined` when it is not one.
 *
 * Refusing here rather than asking GitHub is what keeps the failure at the
 * field the user is looking at: a bare name is not a repository, and a 404 for
 * a URL that could never have existed says the wrong thing about why.
 */
export const parseMarketplaceRef = (
  input: string
): MarketplaceRef | undefined => {
  const match = MARKETPLACE_PATTERN.exec(input.trim())
  if (!match) return undefined

  const [, owner, repo, ref] = match
  if (!owner || !repo) return undefined

  return { owner, repo, ...(ref !== undefined && { ref }) }
}

/** Where that repository's catalogue lives, on the CORS-enabled contents API. */
export const catalogUrl = ({ owner, repo, ref }: MarketplaceRef): string => {
  const base = `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/contents/${CATALOG_PATH}`
  return ref === undefined ? base : `${base}?ref=${encodeURIComponent(ref)}`
}

/**
 * What went wrong, in the terms the fix is in.
 *
 * - `unauthorized` — 401, 403 or 404. A token might reach it, so the dialog
 *   offers one. GitHub 404s a private repository for a caller who may not see
 *   it, which is why "not found" cannot mean "wrong name" here.
 * - `invalid` — the marketplace is not a repository, or its catalogue is not a
 *   catalogue. Nothing to retry either way: the same bytes come back, so the
 *   author's build is what has to change.
 * - `unreachable` — GitHub did not answer at all. Retrying is the whole fix.
 */
export type CatalogFailureKind = "unauthorized" | "invalid" | "unreachable"

/**
 * A refusal, apart from the result that carries it.
 *
 * Named because it travels: the dialog opens with one already in it when the
 * catalogue an arriving payload needs could not be read, so the kind and the
 * sentence have to be sayable without the `ok: false` around them.
 */
export type CatalogFailure = { kind: CatalogFailureKind; error: string }

export type CatalogResult =
  { ok: true; matrix: Matrix } | ({ ok: false } & CatalogFailure)

// The statuses a token can change. 404 belongs here and not with the typos for
// the reason above; 403 is scopes or the anonymous rate limit, and a token
// answers both.
const TOKEN_MIGHT_FIX = new Set([401, 403, 404])

// Paths and codes, never values. A private marketplace's skill names are the
// org's own, and a diagnostics channel is exactly the wrong place for the one
// thing this whole design keeps off our infrastructure.
const issuesOf = (error: { issues: { path: PropertyKey[]; code: string }[] }) =>
  error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`
  )

const authHeaders = (token: string | undefined) =>
  token ? { Authorization: `Bearer ${token}` } : {}

// The four ways this ends badly, each named for what it is rather than built
// inline where it happens — so the orchestrator below reads as the walk it is.

const notAMarketplace = (input: string): CatalogResult => ({
  ok: false,
  kind: "invalid",
  error: `${input.trim()} is not a marketplace — name one as "owner/repo"`,
})

const unreadableCatalog = (name: string, issues: string[]): CatalogResult => {
  reportIssue("Marketplace published an unreadable catalog", { issues })

  return {
    ok: false,
    kind: "invalid",
    error: `${name} published an unreadable catalog.json — ${issues.join(", ")}`,
  }
}

const unreachable = (name: string): CatalogResult => ({
  ok: false,
  kind: "unreachable",
  error: `${name} is unreachable — check the connection and try again`,
})

// A status, in the terms its fix is in. The 404 wording is careful: it must not
// say the name is wrong, because for a private repository it is not.
const refusalOf = (status: number, name: string): CatalogResult => {
  if (TOKEN_MIGHT_FIX.has(status)) {
    return {
      ok: false,
      kind: "unauthorized",
      error: `${name} could not be read (${status}) — if it is private, a token with repo access will reach it`,
    }
  }

  reportIssue("Marketplace catalog GET failed", { status })
  return {
    ok: false,
    kind: "unreachable",
    error: `${name} could not be read (${status}) — try again`,
  }
}

/**
 * The catalogue a marketplace published, or why it could not be read.
 *
 * The token is optional and always has been: a public marketplace is read with
 * the field left empty, and no `Authorization` header is sent at all rather
 * than an empty one. It authorizes and never identifies — `marketplace` is the
 * only thing that says WHICH repository, so a token alone reaches nothing.
 */
export const fetchCatalog = async (
  marketplace: string,
  token?: string
): Promise<CatalogResult> => {
  const ref = parseMarketplaceRef(marketplace)
  if (!ref) return notAMarketplace(marketplace)

  const name = `${ref.owner}/${ref.repo}`

  try {
    const response = await fetch(catalogUrl(ref), {
      headers: { Accept: RAW_CONTENT, ...authHeaders(token) },
    })
    if (!response.ok) return refusalOf(response.status, name)

    const parsed = matrixSchema.safeParse(await response.json())
    if (!parsed.success) return unreadableCatalog(name, issuesOf(parsed.error))

    return { ok: true, matrix: parsed.data }
  } catch {
    // Nothing reported: an offline browser is not a fault of ours, and the
    // message on screen already says the whole of it.
    return unreachable(name)
  }
}
