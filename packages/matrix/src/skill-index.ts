import { z } from "zod"

// The wire contract for the federated skill index. A daily GitHub Action crawls
// a small allowlist of EXTERNAL skills repositories, proves each skill
// installable by reading its SKILL.md, and publishes the result to the worker's
// KV; `apps/server` serves it under `GET /skills` and the editor's add-skills
// dialog filters that list client-side.
//
// It lives here for the same reason `seed.ts` does: the worker and the editor
// both have to agree about the shape, and neither may import the other — the
// worker's source names `Env` from `wrangler types`, which redefines DOM
// globals in anything that pulls it in. The Action's crawl reads it too, which
// is the third party this shape now has to hold still for.
//
// There is no version field, unlike the seed payload. A seed payload is stored
// forever under an id someone may have written down; an index is rebuilt from
// scratch every day, so a shape change is handled by bumping the KV key — which
// the worker owns and nothing else can hold a link to.

// One skill, as the dialog needs it: enough to show a result, and enough to
// fetch it afterwards. `repo` + `path` together are the install coordinates.
export const skillIndexEntrySchema = z.object({
  // The skill's own name — its frontmatter `name` where there is one, its
  // directory name where there is not. Never empty: a skill with neither is
  // not addressable and does not make it into the index.
  name: z.string().min(1),
  // Frontmatter `description`, or the SKILL.md's first heading. Empty when the
  // file offers neither, which is a thin result rather than an invalid one.
  description: z.string(),
  // GitHub's own `owner/name`, so a result can be attributed and fetched
  // without a second lookup.
  repo: z.string().min(1),
  // The skill DIRECTORY within that repo — `skills/docx`, not
  // `skills/docx/SKILL.md`. A skill is a directory in every consumer of this
  // index, and the file is only how the directory proves itself.
  path: z.string().min(1),
  // The repository's star count when the index was built. A property of the
  // repo rather than the skill, repeated per entry because the dialog ranks
  // and badges individual results.
  stars: z.number().int().nonnegative(),
  // How much the skill's whole DIRECTORY weighs — the sum over its blobs of the
  // sizes GitHub reported for them in the tree listing the crawl already made,
  // never a download. Repeated per entry because the cap it is read against is
  // per skill: `MAX_EXTERNAL_SKILL_BYTES` decides whether one directory can
  // ride a shared link, and without this number that decision cannot be made
  // until the consumer has listed the repository itself. Zero is a real answer,
  // for a directory GitHub reported no sizes for at all.
  bytes: z.number().int().nonnegative(),
})

export const skillIndexSchema = z.object({
  // When this index was assembled, as an ISO 8601 instant. The worker's own
  // freshness check reads it, and it is served so a caller can say how old the
  // list is rather than having to guess.
  builtAt: z.iso.datetime(),
  skills: z.array(skillIndexEntrySchema),
})

// Whether what was served is the current whole picture. `stale` covers both an
// upstream the worker could not refresh and a cold index still filling in —
// from a caller's side those are the same statement: this list is not
// everything, ask again later.
export const skillIndexFreshnessSchema = z.enum(["fresh", "stale"])

// The response header carrying it. Named here rather than spelled out in the
// worker, its mocks and the editor, because a header three packages have to
// agree about is a contract like any other.
export const SKILL_INDEX_FRESHNESS_HEADER = "x-skill-index"

export type SkillIndexEntry = z.infer<typeof skillIndexEntrySchema>
export type SkillIndex = z.infer<typeof skillIndexSchema>
export type SkillIndexFreshness = z.infer<typeof skillIndexFreshnessSchema>
