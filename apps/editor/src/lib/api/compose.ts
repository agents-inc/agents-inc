import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// EDITOR-54. The composer's one call.
//
// The worker owns the model, the key, the prompt and the rate limit; this side
// sends a sentence and receives SKILL IDS. Nothing about scope, install mode or
// which sub-agent carries what crosses the wire, because none of that is the
// model's to decide — `resolveAssignment` and the CLI's own rules answer those,
// and an id is the only thing the two halves need to agree on.
const proposalSchema = z.object({
  skillIds: z.array(z.string()),
  reason: z.string(),
})

export type ComposedProposal = z.infer<typeof proposalSchema>

/**
 * Why a sentence produced nothing, in the words the composer will show.
 *
 * Four members rather than a message, for the reason `ShareRefusal` has three:
 * these are different situations for the person at the keyboard, and only some
 * of them name an action. `signed-out` is the one that does.
 */
export type ComposeRefusal =
  "signed-out" | "too-many" | "refused" | "unreachable"

export type ComposeResult =
  | { ok: true; proposal: ComposedProposal }
  | { ok: false; refusal: ComposeRefusal }

const REFUSAL_BY_STATUS: Record<number, ComposeRefusal> = {
  401: "signed-out",
  429: "too-many",
}

export const composeProposal = async (
  sentence: string
): Promise<ComposeResult> => {
  try {
    const response = await api.compose.$post({ json: { sentence } })

    if (!response.ok) {
      const refusal = REFUSAL_BY_STATUS[response.status] ?? "refused"
      // Signed-out and rate-limited are ORDINARY here and are not reported:
      // one is a lapsed session and the other is the limiter doing its job, so
      // sending them would drown the signal in expected traffic. A refusal the
      // worker did not name is the one worth knowing about — this is the route
      // that spends money on every call, and until now it reported nothing.
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
