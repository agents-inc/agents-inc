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
  // Narrowed by `flavorOf`, where the role list lives.
  flavor: z.string(),
})

export const agentDefinitionsSchema = z.record(
  z.string(),
  agentDefinitionSchema
)

export type ParsedAgentDefinition = z.infer<typeof agentDefinitionSchema>
