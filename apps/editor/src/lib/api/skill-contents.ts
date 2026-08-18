import { MAX_EXTERNAL_SKILL_BYTES, type SeedSkillTree } from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

// An external skill's own directory, fetched from GitHub DIRECTLY.
//
// This is the seam the EDITOR-03 ruling turned from a description into a
// constraint and back again. "The editor never obtains content" described the
// build as it stood; the contents API is CORS-enabled and always was, so the
// editor resolves the bytes at ADD time and the payload carries them inline.
// What that buys is a self-contained shared id: `--from` reaches into no
// third-party repository at install time, so a repo that has since moved, gone
// private or changed cannot make a link install something else — and two people
// installing one id get identical bytes.
//
// Built on `catalog.ts`'s shape, for the reasons stated there: a discriminated
// result, `safeParse` over what GitHub answers, `reportIssue` for what the user
// cannot see, and nothing thrown. It differs in using TWO origins, and that is
// the design rather than an optimisation:
//
//   - `api.github.com/repos/…/git/trees/HEAD?recursive=1` lists the repository
//     in ONE call whatever the directory's depth. An anonymous browser gets
//     sixty API requests an hour, so walking a `reference/` directory with a
//     call per level would spend that budget on a single skill.
//   - `raw.githubusercontent.com` serves the files. It is a CDN with no API
//     rate limit at all and answers `access-control-allow-origin: *`, so the
//     bytes — which are most of the requests — cost nothing from that budget.

const GITHUB_API_ORIGIN = "https://api.github.com"
const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com"

// Whatever the repository calls its default branch. The index carries no ref,
// and pinning a commit would make a re-add of the same skill a different
// snapshot for no reason a user asked for.
const DEFAULT_REF = "HEAD"

/** The file Claude Code reads to learn a skill exists at all. */
const SKILL_MANIFEST = "SKILL.md"

const BYTES_PER_KB = 1024

// GitHub's tree listing, narrowed to what is read. Sizes are the tree's own, so
// the cap is answered before a single byte is downloaded.
const treeSchema = z.object({
  // True when the repository has more entries than one response may carry. Only
  // interesting when the prefix then matches nothing — otherwise what was asked
  // for arrived.
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      size: z.number().optional(),
    })
  ),
})

type Blob = { path: string; size: number }

/**
 * What went wrong, in the terms the fix is in.
 *
 * - `unreadable` — GitHub does not serve this directory, or what is there is
 *   not a skill. The same answer comes back however often it is asked, so the
 *   index and the repository have to be reconciled rather than retried.
 * - `too-large` — the directory is past the per-skill cap. A property of what
 *   is being carried, not of the network.
 * - `not-text` — a file in it is not UTF-8. The payload holds text, and a
 *   decoder that substituted replacement characters would write a corrupted
 *   file to someone's disk with neither end being told.
 * - `unreachable` — GitHub did not answer. Retrying is the whole fix.
 */
export type SkillContentsFailureKind =
  "unreadable" | "too-large" | "not-text" | "unreachable"

export type SkillContentsResult =
  | { ok: true; files: SeedSkillTree }
  | { ok: false; kind: SkillContentsFailureKind; error: string }

const treeUrl = (repo: string) =>
  `${GITHUB_API_ORIGIN}/repos/${repo}/git/trees/${DEFAULT_REF}?recursive=1`

const rawUrl = (repo: string, fullPath: string) =>
  `${GITHUB_RAW_ORIGIN}/${repo}/${DEFAULT_REF}/${fullPath}`

const asKb = (bytes: number) => `${Math.round(bytes / BYTES_PER_KB)} KB`

/**
 * Whether a directory of this weight can ride a shared link at all.
 *
 * Exported because the add-skills dialog asks it of the index's own `bytes`
 * before a visitor stages anything, and the two have to be the same question:
 * a row marked addable here and refused below would be worse than no mark.
 */
export const isPastCarryLimit = (bytes: number) =>
  bytes > MAX_EXTERNAL_SKILL_BYTES

/**
 * The weight and the limit it is past, in the one phrase both refusals use.
 * Said once so the late refusal and the search row cannot drift apart.
 */
export const carryLimitRefusal = (bytes: number) =>
  `${asKb(bytes)}, past the ${asKb(MAX_EXTERNAL_SKILL_BYTES)} a shared link may carry`

// The failures, each named for what it is rather than built inline where it
// happens — so the orchestrator below reads as the walk it is.

const unreadable = (error: string): SkillContentsResult => ({
  ok: false,
  kind: "unreadable",
  error,
})

const unreachable = (error: string): SkillContentsResult => ({
  ok: false,
  kind: "unreachable",
  error: `${error} — try again`,
})

const tooLarge = (where: string, bytes: number): SkillContentsResult => ({
  ok: false,
  kind: "too-large",
  error: `${where} is ${carryLimitRefusal(bytes)}`,
})

const notText = (where: string): SkillContentsResult => ({
  ok: false,
  kind: "not-text",
  error: `${where} is not text — a skill's files travel as text and this one cannot`,
})

// ── Listing ──────────────────────────────────────────────────────────────

type ListResult =
  { ok: true; blobs: Blob[] } | { ok: false; failure: SkillContentsResult }

// Everything under the skill's own directory and nothing beside it. A prefix
// with the separator, so `skills/docx` cannot also collect `skills/docx-legacy`.
const blobsUnder = (tree: z.infer<typeof treeSchema>["tree"], path: string) =>
  tree
    .filter(
      (entry) => entry.type === "blob" && entry.path.startsWith(`${path}/`)
    )
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))

const listSkillTree = async (
  repo: string,
  path: string
): Promise<ListResult> => {
  let response: Response
  try {
    response = await fetch(treeUrl(repo))
  } catch {
    // Nothing reported: an offline browser is not a fault of ours, and the
    // message on screen already says the whole of it.
    return { ok: false, failure: unreachable(`${repo} is unreachable`) }
  }

  if (response.status === 404) {
    return { ok: false, failure: unreadable(`${repo} holds no ${path}`) }
  }
  if (!response.ok) {
    reportIssue("Skill tree listing failed", { status: response.status })
    return {
      ok: false,
      failure: unreachable(`${repo} could not be listed (${response.status})`),
    }
  }

  const parsed = treeSchema.safeParse(await response.json())
  if (!parsed.success) {
    reportIssue("Skill tree listing was unreadable")
    return {
      ok: false,
      failure: unreadable(`${repo} answered with no file tree`),
    }
  }

  const blobs = blobsUnder(parsed.data.tree, path)
  if (blobs.length === 0) {
    // Truncation is the one reason an empty result is not the repository's
    // answer, and saying which it was is the difference between "fix the index"
    // and "this repository is too big to read this way".
    return {
      ok: false,
      failure: unreadable(
        parsed.data.truncated
          ? `${repo} is too large to list, so ${path} could not be found in it`
          : `${repo} holds no ${path}`
      ),
    }
  }

  return { ok: true, blobs }
}

// ── Downloading ──────────────────────────────────────────────────────────

// Fatal, deliberately. A lenient decoder turns bytes it cannot read into
// replacement characters, which would put a silently corrupted file into a
// payload the CLI writes to disk — the exact failure a strict decode refuses.
const decodeText = (bytes: ArrayBuffer) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes)

type FileResult =
  | { ok: true; relative: string; text: string }
  | { ok: false; failure: SkillContentsResult }

const fetchFile = async (
  repo: string,
  blob: Blob,
  path: string
): Promise<FileResult> => {
  // Relative to the skill's own directory, because that is the directory the
  // CLI writes: a key carrying `skills/docx/` would eject the skill two levels
  // deep inside itself.
  const relative = blob.path.slice(path.length + 1)

  let response: Response
  try {
    response = await fetch(rawUrl(repo, blob.path))
  } catch {
    return { ok: false, failure: unreachable(`${relative} is unreachable`) }
  }

  if (!response.ok) {
    return { ok: false, failure: unreadable(`${relative} could not be read`) }
  }

  try {
    return {
      ok: true,
      relative,
      text: decodeText(await response.arrayBuffer()),
    }
  } catch {
    return { ok: false, failure: notText(relative) }
  }
}

// ── The walk ─────────────────────────────────────────────────────────────

const treeBytes = (blobs: Blob[]) =>
  blobs.reduce((total, blob) => total + blob.size, 0)

/**
 * A skill's whole directory, or why it could not be carried.
 *
 * The whole directory and not SKILL.md alone (owner, 2026-08-16): SKILL.md, the
 * metadata beside it, and every `reference/` or `examples-*.md` file under it.
 * Carrying the manifest alone installs something that loads and then cannot do
 * what it says.
 */
export const fetchSkillContents = async (
  repo: string,
  path: string
): Promise<SkillContentsResult> => {
  const listed = await listSkillTree(repo, path)
  if (!listed.ok) return listed.failure

  // Still checked here, and it is not a duplicate of the dialog's own check:
  // this is the authority. The index's weight is a snapshot of a repository
  // that may have grown since, and a skill reaching this point unmarked has to
  // be refused on what the listing says now.
  const bytes = treeBytes(listed.blobs)
  if (isPastCarryLimit(bytes)) return tooLarge(`${repo}/${path}`, bytes)

  // In parallel: they are independent reads off a CDN, and a skill with a
  // reference directory is a dozen of them.
  const fetched = await Promise.all(
    listed.blobs.map((blob) => fetchFile(repo, blob, path))
  )

  // All or nothing. A directory missing one of its files is not the skill the
  // repository holds, and half of one is worse than none: it installs, loads,
  // and then cannot do what its SKILL.md says.
  const files: Record<string, string> = {}
  for (const file of fetched) {
    if (!file.ok) return file.failure
    files[file.relative] = file.text
  }

  // Checked here as well as in the payload schema, because this is where the
  // fix is: the user is looking at the skill they just staged, and the answer
  // is that the repository does not hold one.
  if (!(SKILL_MANIFEST in files)) {
    return unreadable(`${repo}/${path} has no ${SKILL_MANIFEST}`)
  }

  return { ok: true, files }
}
