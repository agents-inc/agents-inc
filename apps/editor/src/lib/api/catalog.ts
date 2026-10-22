import { matrixSchema, type Matrix } from "@workspace/matrix/matrix-schema"

import { reportIssue, reportableIssues } from "@/lib/observability/report"

// A marketplace's catalogue, fetched from GitHub directly so an org's catalogue
// and token never pass through our worker. A failure carries a kind, because
// each has a different fix.

// The subpath: the barrel parses the whole vendored matrix at import.

const GITHUB_API_ORIGIN = "https://api.github.com"

// The CLI spells this in `consts.ts`; a test pins `catalogUrl` to it.
const CATALOG_PATH = ".claude-plugin/catalog.json"

// The raw bytes rather than the base64 envelope.
const RAW_CONTENT = "application/vnd.github.raw+json"

// `owner/repo`, stripped of the `github:`/`gh:` prefixes and a pasted
// github.com URL.
const MARKETPLACE_PATTERN =
  /^(?:(?:github|gh):|https?:\/\/(?:www\.)?github\.com\/)?([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#([^\s#]+))?$/

export type MarketplaceRef = {
  owner: string
  repo: string
  /** A branch or tag, for a catalogue not yet on the default branch. */
  ref?: string
}

/**
 * `undefined` when it is not a repository, so the field can refuse it without
 * asking GitHub.
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

// The prefix `--marketplace` reads as GitHub; the CLI states it too.
const CANONICAL_PREFIX = "github:"

const formatMarketplaceRef = ({ owner, repo, ref }: MarketplaceRef) =>
  `${CANONICAL_PREFIX}${owner}/${repo}${ref === undefined ? "" : `#${ref}`}`

/**
 * The one stored form: the credential key, the button label and the payload's
 * ref. `--marketplace` reads a ref without a protocol as a local path, so bare
 * `owner/repo` would resolve wrongly. Applied on arrival so one repository
 * never sits under two keys.
 */
export const canonicalMarketplaceRef = (input: string): string => {
  const parsed = parseMarketplaceRef(input)
  return parsed ? formatMarketplaceRef(parsed) : input.trim()
}

/** Where that repository's catalogue lives, on the CORS-enabled contents API. */
export const catalogUrl = ({ owner, repo, ref }: MarketplaceRef): string => {
  const base = `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/contents/${CATALOG_PATH}`
  return ref === undefined ? base : `${base}?ref=${encodeURIComponent(ref)}`
}

/**
 * `unauthorized` covers 404: GitHub 404s a private repository for a caller who
 * may not see it.
 */
export type CatalogFailureKind = "unauthorized" | "invalid" | "unreachable"

export type CatalogFailure = { kind: CatalogFailureKind; error: string }

export type CatalogResult =
  { ok: true; matrix: Matrix } | ({ ok: false } & CatalogFailure)

// The statuses a token can change.
const TOKEN_MIGHT_FIX = new Set([401, 403, 404])

const wholePath = (path: PropertyKey[]) => path.join(".") || "(root)"

/**
 * `shown` keeps the whole path, for the visitor's own dialog. `reported` keeps
 * the first segment only: past it, `matrixSchema` keys are names the org chose.
 */
type CatalogIssues = { shown: string[]; reported: string[] }

const issuesOf = (error: {
  issues: { path: PropertyKey[]; code: string }[]
}): CatalogIssues => ({
  shown: error.issues.map((issue) => `${wholePath(issue.path)}: ${issue.code}`),
  reported: reportableIssues(error),
})

const authHeaders = (token: string | undefined) =>
  token ? { Authorization: `Bearer ${token}` } : {}

const notAMarketplace = (input: string): CatalogResult => ({
  ok: false,
  kind: "invalid",
  error: `${input.trim()} is not a marketplace — name one as "owner/repo"`,
})

const unreadableCatalog = (
  name: string,
  { shown, reported }: CatalogIssues
): CatalogResult => {
  reportIssue("Marketplace published an unreadable catalog", {
    issues: reported,
  })

  return {
    ok: false,
    kind: "invalid",
    error: `${name} published an unreadable catalog.json — ${shown.join(", ")}`,
  }
}

const unreachable = (name: string): CatalogResult => ({
  ok: false,
  kind: "unreachable",
  error: `${name} is unreachable — check the connection and try again`,
})

// The 404 wording must not say the name is wrong: for a private repository it
// is not.
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

/** The token is optional; without one no `Authorization` header is sent. */
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
    // Not reported: an offline browser is not our fault.
    return unreachable(name)
  }
}
