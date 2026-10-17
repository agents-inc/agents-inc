import { z } from "zod"

// Wire contract for any catalogue (`catalog.json`), with open ids. The vendored
// catalogue's narrower schema is `builtInMatrixSchema` in `built-in-matrix.ts`.

const idSchema = z.string().min(1)

const matrixCategorySchema = z.object({
  id: idSchema,
  displayName: z.string(),
  description: z.string(),
  // A category without one is dropped by consumers, not rejected.
  domain: z.string().exactOptional(),
  exclusive: z.boolean(),
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
  // A compiled sub-agent's cue to load the skill.
  usageGuidance: z.string().exactOptional(),
  // The SKILL.md description the activation table shows; `description` is the short label.
  activationDescription: z.string().exactOptional(),
  category: idSchema,
  conflictsWith: z.array(skillRelationSchema),
  discourages: z.array(skillRelationSchema),
  requires: z.array(skillRequirementSchema),
})

const matrixStackSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids.
  skills: z.record(z.string(), z.record(z.string(), z.array(idSchema))),
  allSkillIds: z.array(idSchema),
  philosophy: z.string(),
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
