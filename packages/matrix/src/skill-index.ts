import { z } from "zod"

// Wire contract for the federated skill index the worker serves at `GET /skills`.
// No version field: the index is rebuilt daily, so a shape change bumps the KV key.

// `repo` + `path` are the install coordinates.
export const skillIndexEntrySchema = z.object({
  // Frontmatter `name`, else the directory name.
  name: z.string().min(1),
  // Frontmatter `description`, else the first heading; may be empty.
  description: z.string(),
  // `owner/name`.
  repo: z.string().min(1),
  // The skill's directory (`skills/docx`), not its SKILL.md.
  path: z.string().min(1),
  // The repo's stars, repeated per entry for ranking.
  stars: z.number().int().nonnegative(),
  // Directory size from GitHub's tree listing, checked against `MAX_EXTERNAL_SKILL_BYTES`.
  bytes: z.number().int().nonnegative(),
})

export const skillIndexSchema = z.object({
  builtAt: z.iso.datetime(),
  skills: z.array(skillIndexEntrySchema),
})

// `stale`: a failed refresh or a cold index still filling in.
export const skillIndexFreshnessSchema = z.enum(["fresh", "stale"])

export const SKILL_INDEX_FRESHNESS_HEADER = "x-skill-index"

export type SkillIndexEntry = z.infer<typeof skillIndexEntrySchema>
export type SkillIndex = z.infer<typeof skillIndexSchema>
export type SkillIndexFreshness = z.infer<typeof skillIndexFreshnessSchema>
