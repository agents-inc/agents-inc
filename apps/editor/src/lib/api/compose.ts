import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// The worker owns the model, the key, the prompt and the rate limit; only skill
// ids come back.
const proposalSchema = z.object({
  skillIds: z.array(z.string()),
  reason: z.string(),
})

export type ComposedProposal = z.infer<typeof proposalSchema>

export type ComposeRefusal =
  "signed-out" | "too-many" | "too-long" | "refused" | "unreachable"

export type ComposeResult =
  | { ok: true; proposal: ComposedProposal }
  | { ok: false; refusal: ComposeRefusal }

const REFUSAL_BY_STATUS: Record<number, ComposeRefusal> = {
  401: "signed-out",
  429: "too-many",
}

// Explained by the body, not the status.
const BAD_REQUEST = 400

/**
 * `/compose` spends one 400 on two guards (empty and too long) and names which
 * in the body.
 */
const TOO_LONG = "too long"

const refusalBodySchema = z.object({ error: z.string() })

type ComposeResponse = Awaited<ReturnType<typeof api.compose.$post>>

/**
 * Reads a code, never a sentence. Anything unreadable degrades to `refused`.
 */
const refusalFor = async (
  response: ComposeResponse
): Promise<ComposeRefusal> => {
  if (response.status !== BAD_REQUEST)
    return REFUSAL_BY_STATUS[response.status] ?? "refused"

  const body = await response.json().catch(() => null)
  const parsed = refusalBodySchema.safeParse(body)

  return parsed.success && parsed.data.error === TOO_LONG
    ? "too-long"
    : "refused"
}

export const composeProposal = async (
  sentence: string
): Promise<ComposeResult> => {
  try {
    const response = await api.compose.$post({ json: { sentence } })

    if (!response.ok) {
      const refusal = await refusalFor(response)
      // Only an unnamed refusal is reported; the rest are expected traffic.
      if (refusal === "refused")
        reportIssue("Compose refused", { status: response.status })
      return { ok: false, refusal }
    }

    const parsed = proposalSchema.safeParse(await response.json())
    return parsed.success
      ? { ok: true, proposal: parsed.data }
      : { ok: false, refusal: "refused" }
  } catch {
    reportIssue("Compose could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}
