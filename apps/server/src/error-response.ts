import { z } from "@hono/zod-openapi"

/** A refusal whose body is `{ error }`. */
export const errorResponse = (description: string) => ({
  content: {
    "application/json": { schema: z.object({ error: z.string() }) },
  },
  description,
})
