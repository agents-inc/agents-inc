// The validation boundary between the vendored CLI data and everything we build on it.
//
// These schemas describe only what the editor actually reads, not the full CLI types.
// Unknown keys are stripped, so the vendored data can grow fields without touching this file.
// What they do catch is the case that matters: a regenerated catalog that dropped or renamed
// something we depend on. That fails here, loudly, instead of rendering a blank table.

import { z } from "zod"
import {
  AGENT_NAMES,
  CATEGORIES,
  DOMAINS,
  SKILL_IDS,
} from "./vendor/generated/source-types"
import { MODEL_NAMES } from "./vendor/matrix"

export const DomainIdSchema = z.enum(DOMAINS)

// The generated vocabularies, as the boundary's own alphabet. Ids validated
// against them arrive downstream already narrowed, which is what spares every
// read model from casting a `string` back into the union it came from.
const SkillIdSchema = z.enum(SKILL_IDS)
const CategorySchema = z.enum(CATEGORIES)
const AgentNameSchema = z.enum(AGENT_NAMES)
const ModelNameSchema = z.enum(MODEL_NAMES)

export const CategoryDefinitionSchema = z.object({
  id: CategorySchema,
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
  skillId: SkillIdSchema,
  reason: z.string(),
})

const SkillRequirementSchema = z.object({
  skillIds: z.array(SkillIdSchema),
  needsAny: z.boolean(),
  reason: z.string(),
})

export const ResolvedSkillSchema = z.object({
  id: SkillIdSchema,
  slug: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: CategorySchema,
  conflictsWith: z.array(SkillRelationSchema),
  discourages: z.array(SkillRelationSchema),
  requires: z.array(SkillRequirementSchema),
})

export const ResolvedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids. Partial because a stack names the few
  // agents it staffs, not the whole roster; the category keys are the one level
  // nothing here reads, so they stay unvalidated strings.
  skills: z.partialRecord(
    AgentNameSchema,
    z.record(z.string(), z.array(SkillIdSchema))
  ),
  allSkillIds: z.array(SkillIdSchema),
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
  id: AgentNameSchema,
  title: z.string(),
  description: z.string(),
  model: ModelNameSchema.optional(),
  tools: z.array(z.string()),
  // Not narrowed here: which roles are sayable is authored in the read model's
  // preload table, which reads this file — so the check lives where the list
  // does, in `flavorOf`, rather than being imported back into the boundary.
  flavor: z.string(),
})

export const AgentDefinitionsSchema = z.record(
  z.string(),
  AgentDefinitionSchema
)

export type ParsedMatrix = z.infer<typeof MatrixSchema>
export type ParsedSkill = z.infer<typeof ResolvedSkillSchema>
export type ParsedCategory = z.infer<typeof CategoryDefinitionSchema>
export type ParsedStack = z.infer<typeof ResolvedStackSchema>
export type ParsedAgentDefinition = z.infer<typeof AgentDefinitionSchema>
