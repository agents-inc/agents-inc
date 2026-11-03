import { z } from "zod"

export const GITHUB_API_ORIGIN = "https://api.github.com"

// Serves public files without spending the API's rate budget.
export const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com"

// `GET /repos/{repo}/git/trees/{ref}?recursive=1`. `size` is absent for
// directories, so `type` tells file from directory.
export const gitTreeEntrySchema = z.object({
  path: z.string(),
  type: z.string(),
  size: z.number().optional(),
})

export const gitTreeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(gitTreeEntrySchema),
})

export type GitTreeEntry = z.infer<typeof gitTreeEntrySchema>

export type TreeBlob = { path: string; size: number }

/**
 * The files under `directory`, at any depth. A missing size counts as zero.
 */
export const blobsUnder = (
  tree: readonly GitTreeEntry[],
  directory: string
): TreeBlob[] =>
  tree
    .filter((entry) => isBlobUnder(entry, directory))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))

// The trailing separator keeps `skills/docx` from collecting `skills/docx-legacy`.
const isBlobUnder = (entry: GitTreeEntry, directory: string) =>
  entry.type === "blob" && entry.path.startsWith(`${directory}/`)
