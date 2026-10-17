import { MAX_EXTERNAL_SKILL_BYTES, type SeedSkillTree } from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

// An external skill's whole directory, fetched from GitHub at add time so a
// shared id is self-contained. One tree call lists it (anonymous API budget is
// 60/hour); the files come from raw.githubusercontent.com, which has no rate
// limit.

const GITHUB_API_ORIGIN = "https://api.github.com"
const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com"

// The index carries no ref.
const DEFAULT_REF = "HEAD"

const SKILL_MANIFEST = "SKILL.md"

const BYTES_PER_KB = 1024

// Sizes come from the tree, so the cap is answered before downloading.
const treeSchema = z.object({
  // Only matters when the prefix then matches nothing.
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

/** `not-text`: a non-UTF-8 file would be corrupted on someone's disk. */
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

/** Exported so the add dialog asks the same question of the index's `bytes`. */
export const isPastCarryLimit = (bytes: number) =>
  bytes > MAX_EXTERNAL_SKILL_BYTES

export const carryLimitRefusal = (bytes: number) =>
  `${asKb(bytes)}, past the ${asKb(MAX_EXTERNAL_SKILL_BYTES)} a shared link may carry`

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

type ListResult =
  { ok: true; blobs: Blob[] } | { ok: false; failure: SkillContentsResult }

// With the separator, so `skills/docx` does not collect `skills/docx-legacy`.
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
    // Not reported: an offline browser is not our fault.
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
    // Truncation is the one reason an empty listing is not the repository's
    // answer.
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

// Fatal: a lenient decoder would write replacement characters to disk.
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
  // Relative to the skill directory, which is what the CLI writes.
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

const treeBytes = (blobs: Blob[]) =>
  blobs.reduce((total, blob) => total + blob.size, 0)

/**
 * The whole directory, not SKILL.md alone: references and examples are part of
 * the skill.
 */
export const fetchSkillContents = async (
  repo: string,
  path: string
): Promise<SkillContentsResult> => {
  const listed = await listSkillTree(repo, path)
  if (!listed.ok) return listed.failure

  // Checked again: the index's weight is a snapshot.
  const bytes = treeBytes(listed.blobs)
  if (isPastCarryLimit(bytes)) return tooLarge(`${repo}/${path}`, bytes)

  const fetched = await Promise.all(
    listed.blobs.map((blob) => fetchFile(repo, blob, path))
  )

  // All or nothing: half a skill installs and then cannot do what it says.
  const files: Record<string, string> = {}
  for (const file of fetched) {
    if (!file.ok) return file.failure
    files[file.relative] = file.text
  }

  if (!(SKILL_MANIFEST in files)) {
    return unreadable(`${repo}/${path} has no ${SKILL_MANIFEST}`)
  }

  return { ok: true, files }
}
