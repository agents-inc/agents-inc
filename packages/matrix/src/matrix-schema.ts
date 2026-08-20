import { z } from "zod"

// The wire contract for a catalogue: the CLI's `MergedSkillsMatrix`, described
// without reference to any particular vocabulary of ids.
//
// It has two callers and they want the same thing for different reasons. A
// marketplace's `build marketplace` emits `catalog.json` in this shape, and the
// editor fetches that file and `safeParse`s it — one fetch, one parse, no
// transform layer, whichever marketplace it came from. And `generate:matrix`
// asks it whether the artefact it is about to vendor is still a matrix at all,
// which byte-comparison against the CLI's own copy cannot answer.
//
// NOT to be confused with `builtInMatrixSchema` in `built-in-matrix.ts`. That
// one narrows every id to the vendored vocabulary — `SKILL_IDS`, `CATEGORIES`,
// `AGENT_NAMES` — so it catches a regenerated catalogue that renamed something
// the read models index by. It is the right boundary for the catalogue this
// package ships and the wrong one for every other: a marketplace's ids are its
// own, and parsing a fetched `catalog.json` with it would reject all of them by
// construction.
//
// Ids are therefore `z.string().min(1)` here, and unknown keys are stripped, so
// a matrix may grow fields without this file moving. What it does hold is the
// fields a consumer reads — the same surface `built-in-matrix.ts` models, for
// the same reason: a catalogue that dropped one fails here, loudly, rather than
// rendering a blank grid.

const idSchema = z.string().min(1)

const matrixCategorySchema = z.object({
  id: idSchema,
  displayName: z.string(),
  description: z.string(),
  // Optional in the CLI's type. A category without one cannot be placed in the
  // UI, so a consumer drops it rather than failing the whole catalogue.
  domain: z.string().exactOptional(),
  exclusive: z.boolean(),
  required: z.boolean(),
  order: z.number(),
})

const skillRelationSchema = z.object({
  skillId: idSchema,
  reason: z.string(),
})

const skillRequirementSchema = z.object({
  skillIds: z.array(idSchema),
  needsAny: z.boolean(),
  reason: z.string(),
})

const matrixSkillSchema = z.object({
  id: idSchema,
  slug: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: idSchema,
  conflictsWith: z.array(skillRelationSchema),
  discourages: z.array(skillRelationSchema),
  requires: z.array(skillRequirementSchema),
})

const matrixStackSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids. A stack names the few agents it staffs
  // rather than the whole roster, and the agent roster is as marketplace-owned
  // as the skills are, so neither level is narrowed.
  skills: z.record(z.string(), z.record(z.string(), z.array(idSchema))),
  allSkillIds: z.array(idSchema),
  philosophy: z.string(),
  // Never populated by the CLI today; a stack rail groups by it when it appears.
  group: z.string().exactOptional(),
})

export const matrixSchema = z.object({
  version: z.string(),
  categories: z.record(z.string(), matrixCategorySchema),
  skills: z.record(z.string(), matrixSkillSchema),
  suggestedStacks: z.array(matrixStackSchema),
})

export type Matrix = z.infer<typeof matrixSchema>
export type MatrixSkill = z.infer<typeof matrixSkillSchema>
export type MatrixCategory = z.infer<typeof matrixCategorySchema>
export type MatrixStack = z.infer<typeof matrixStackSchema>
