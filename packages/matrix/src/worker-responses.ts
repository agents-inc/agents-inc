import { z } from "zod"

// Bodies the worker answers and the editor revalidates. The worker names each
// as an OpenAPI component with `.openapi()`.

// `configId` points into KV; the payload is fetched via `GET /configs/:id`.
export const savedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  configId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// Skill ids only; everything else derives from them.
export const proposalSchema = z.object({
  skillIds: z.array(z.string()),
  reason: z.string(),
})

export type SavedStack = z.infer<typeof savedStackSchema>
export type Proposal = z.infer<typeof proposalSchema>
