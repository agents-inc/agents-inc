// The validation boundary for `AGENT_DEFINITIONS` — the built-in sub-agent
// roster, generated from the CLI's per-agent `metadata.yaml` files.
//
// It sits beside `built-in-matrix.ts` rather than inside it because the roster
// is not part of the matrix: `MergedSkillsMatrix` carries categories, skills
// and stacks, and the agents are a second generated artefact with a second
// consumer (`read-model/sub-agents.ts`). The two boundaries narrow against the
// same generated vocabularies and answer different questions.

import { z } from "zod"
import { AGENT_NAMES } from "./vendor/generated/source-types"
import { MODEL_NAMES } from "./vendor/matrix"

const agentNameSchema = z.enum(AGENT_NAMES)
const modelNameSchema = z.enum(MODEL_NAMES)

export const agentDefinitionSchema = z.object({
  id: agentNameSchema,
  title: z.string(),
  description: z.string(),
  model: modelNameSchema.exactOptional(),
  tools: z.array(z.string()),
  // Not narrowed here: which roles are sayable is authored in the read model's
  // preload table — so the check lives where the list does, in `flavorOf`,
  // rather than the list being imported back into the boundary.
  flavor: z.string(),
})

export const agentDefinitionsSchema = z.record(
  z.string(),
  agentDefinitionSchema
)

export type ParsedAgentDefinition = z.infer<typeof agentDefinitionSchema>
