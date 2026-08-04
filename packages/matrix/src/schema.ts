// The validation boundary between the vendored CLI data and everything we build on it.
//
// These schemas describe only what the editor actually reads, not the full CLI types.
// Unknown keys are stripped, so the vendored data can grow fields without touching this file.
// What they do catch is the case that matters: a regenerated catalog that dropped or renamed
// something we depend on. That fails here, loudly, instead of rendering a blank table.

import { z } from "zod"
import { DOMAINS } from "./vendor/generated/source-types"

export const DomainIdSchema = z.enum(DOMAINS)

export const CategoryDefinitionSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  // Optional in the CLI's type. Present on all 89 built-in categories today; a category without
  // one cannot be placed in the UI, so the read model drops it rather than failing the whole boot.
  domain: DomainIdSchema.optional(),
  exclusive: z.boolean(),
  required: z.boolean(),
  order: z.number(),
})

const SkillRelationSchema = z.object({
  skillId: z.string(),
  reason: z.string(),
})

const SkillRequirementSchema = z.object({
  skillIds: z.array(z.string()),
  needsAny: z.boolean(),
  reason: z.string(),
})

export const ResolvedSkillSchema = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  isRecommended: z.boolean(),
  recommendedReason: z.string().optional(),
  conflictsWith: z.array(SkillRelationSchema),
  discourages: z.array(SkillRelationSchema),
  requires: z.array(SkillRequirementSchema),
  compatibleWith: z.array(z.string()),
})

export const ResolvedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids
  skills: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
  allSkillIds: z.array(z.string()),
  philosophy: z.string(),
  // Never populated by the CLI today; the stack rail groups by it when it appears.
  group: z.string().optional(),
})

export const MatrixSchema = z.object({
  // Stamped into every seed payload so a consumer can explain skipped ids.
  version: z.string(),
  categories: z.record(z.string(), CategoryDefinitionSchema),
  skills: z.record(z.string(), ResolvedSkillSchema),
  suggestedStacks: z.array(ResolvedStackSchema),
})

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  model: z.string().optional(),
  tools: z.array(z.string()),
  flavor: z.string(),
})

export const AgentDefinitionsSchema = z.record(
  z.string(),
  AgentDefinitionSchema
)

export const StackPreloadsSchema = z.record(z.string(), z.array(z.string()))

export type ParsedMatrix = z.infer<typeof MatrixSchema>
export type ParsedSkill = z.infer<typeof ResolvedSkillSchema>
export type ParsedCategory = z.infer<typeof CategoryDefinitionSchema>
export type ParsedStack = z.infer<typeof ResolvedStackSchema>
export type ParsedAgentDefinition = z.infer<typeof AgentDefinitionSchema>
