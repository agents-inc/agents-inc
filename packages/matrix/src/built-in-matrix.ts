// Validates the vendored catalogue against the generated id vocabularies, so a
// regenerated catalogue that renamed something fails loudly. Any other
// catalogue uses `matrixSchema`.

import { z } from "zod"
import {
  AGENT_NAMES,
  CATEGORIES,
  DOMAINS,
  SKILL_IDS,
} from "./vendor/generated/source-types"

export const domainIdSchema = z.enum(DOMAINS)

const skillIdSchema = z.enum(SKILL_IDS)
const categorySchema = z.enum(CATEGORIES)
const agentNameSchema = z.enum(AGENT_NAMES)

export const categoryDefinitionSchema = z.object({
  id: categorySchema,
  displayName: z.string(),
  description: z.string(),
  // A category without one is dropped by the read model, not rejected.
  domain: domainIdSchema.exactOptional(),
  exclusive: z.boolean(),
  order: z.number(),
})

const skillRelationSchema = z.object({
  skillId: skillIdSchema,
  reason: z.string(),
})

const skillRequirementSchema = z.object({
  skillIds: z.array(skillIdSchema),
  needsAny: z.boolean(),
  reason: z.string(),
})

export const resolvedSkillSchema = z.object({
  id: skillIdSchema,
  slug: z.string(),
  displayName: z.string(),
  description: z.string(),
  // Declared so parsing does not strip it.
  usageGuidance: z.string().exactOptional(),
  activationDescription: z.string().exactOptional(),
  category: categorySchema,
  conflictsWith: z.array(skillRelationSchema),
  discourages: z.array(skillRelationSchema),
  requires: z.array(skillRequirementSchema),
})

export const resolvedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids; a stack names only the agents it staffs.
  skills: z.partialRecord(
    agentNameSchema,
    z.record(z.string(), z.array(skillIdSchema))
  ),
  allSkillIds: z.array(skillIdSchema),
  philosophy: z.string(),
  group: z.string().exactOptional(),
})

export const builtInMatrixSchema = z.object({
  version: z.string(),
  categories: z.record(z.string(), categoryDefinitionSchema),
  skills: z.record(z.string(), resolvedSkillSchema),
  suggestedStacks: z.array(resolvedStackSchema),
})

export type BuiltInMatrix = z.infer<typeof builtInMatrixSchema>
export type ParsedSkill = z.infer<typeof resolvedSkillSchema>
export type ParsedCategory = z.infer<typeof categoryDefinitionSchema>
export type ParsedStack = z.infer<typeof resolvedStackSchema>
