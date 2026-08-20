// The validation boundary for `BUILT_IN_MATRIX` — the one catalogue this package
// vendors — and for everything the read models build on it.
//
// These schemas describe only what the editor actually reads, not the full CLI types.
// Unknown keys are stripped, so the vendored data can grow fields without touching this file.
// What they do catch is the case that matters: a regenerated catalog that dropped or renamed
// something we depend on. That fails here, loudly, instead of rendering a blank table.
//
// The narrowing is what makes it the VENDORED boundary rather than a general
// one: every id is held against a generated vocabulary, so a catalogue whose
// ids came from somewhere else is rejected by construction. That other case is
// `matrixSchema` in `matrix-schema.ts`, which describes any marketplace's
// catalogue and is the schema a fetched `catalog.json` is parsed with.

import { z } from "zod"
import {
  AGENT_NAMES,
  CATEGORIES,
  DOMAINS,
  SKILL_IDS,
} from "./vendor/generated/source-types"

export const domainIdSchema = z.enum(DOMAINS)

// The generated vocabularies, as the boundary's own alphabet. Ids validated
// against them arrive downstream already narrowed, which is what spares every
// read model from casting a `string` back into the union it came from.
const skillIdSchema = z.enum(SKILL_IDS)
const categorySchema = z.enum(CATEGORIES)
const agentNameSchema = z.enum(AGENT_NAMES)

export const categoryDefinitionSchema = z.object({
  id: categorySchema,
  displayName: z.string(),
  description: z.string(),
  // Optional in the CLI's type. Present on all 89 built-in categories today; a category without
  // one cannot be placed in the UI, so the read model drops it rather than failing the whole boot.
  domain: domainIdSchema.exactOptional(),
  exclusive: z.boolean(),
  required: z.boolean(),
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
  category: categorySchema,
  conflictsWith: z.array(skillRelationSchema),
  discourages: z.array(skillRelationSchema),
  requires: z.array(skillRequirementSchema),
})

export const resolvedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // agent id → category id → skill ids. Partial because a stack names the few
  // agents it staffs, not the whole roster; the category keys are the one level
  // nothing here reads, so they stay unvalidated strings.
  skills: z.partialRecord(
    agentNameSchema,
    z.record(z.string(), z.array(skillIdSchema))
  ),
  allSkillIds: z.array(skillIdSchema),
  philosophy: z.string(),
  // Never populated by the CLI today; the stack rail groups by it when it appears.
  group: z.string().exactOptional(),
})

export const builtInMatrixSchema = z.object({
  // Stamped into every seed payload so a consumer can explain skipped ids.
  version: z.string(),
  categories: z.record(z.string(), categoryDefinitionSchema),
  skills: z.record(z.string(), resolvedSkillSchema),
  suggestedStacks: z.array(resolvedStackSchema),
})

export type BuiltInMatrix = z.infer<typeof builtInMatrixSchema>
export type ParsedSkill = z.infer<typeof resolvedSkillSchema>
export type ParsedCategory = z.infer<typeof categoryDefinitionSchema>
export type ParsedStack = z.infer<typeof resolvedStackSchema>
