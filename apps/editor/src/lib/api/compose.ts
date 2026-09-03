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
 * Five members rather than a message, for the reason `ShareRefusal` has four:
 * these are different situations for the person at the keyboard, and only some
 * of them name an action. `signed-out` and `too-long` are the two that do.
 */
export type ComposeRefusal =
  "signed-out" | "too-many" | "too-long" | "refused" | "unreachable"

export type ComposeResult =
  | { ok: true; proposal: ComposedProposal }
  | { ok: false; refusal: ComposeRefusal }

const REFUSAL_BY_STATUS: Record<number, ComposeRefusal> = {
  401: "signed-out",
  429: "too-many",
}

// The one status on this route the status cannot explain, so it is held out of
// the table above rather than added to it.
const BAD_REQUEST = 400

/**
 * The worker's own word for the guard that turned a sentence away.
 *
 * `/compose` spends ONE 400 on TWO guards — an empty sentence, and one past its
 * cap — and tells them apart in the body. Reading only `response.status` is why
 * an over-long sentence used to arrive here as the generic refusal and get
 * narrated as "the model did not answer", which was not merely unhelpful: both
 * guards run BEFORE the model is called, so the model had never been asked.
 */
const TOO_LONG = "too long"

const refusalBodySchema = z.object({ error: z.string() })

type ComposeResponse = Awaited<ReturnType<typeof api.compose.$post>>

/**
 * Which refusal an answer is, and the only place that decides.
 *
 * Every status but one is answered by the table above. The 400 is answered by
 * the BODY, because that is where the worker put the distinction: it spends one
 * status on two guards and names which of them refused.
 *
 * What it reads is a CODE and never a sentence, which is the division
 * `ShareRefusal` draws too — the worker names the situation and this side owns
 * the words, so a refusal the editor renders can never turn out to be advice
 * written for somebody else's client.
 *
 * DEGRADES TO `refused` for everything it cannot read: an empty body, prose
 * from a proxy, an envelope of another shape, or a body that throws while being
 * drained — which is why the read is guarded as well as the parse. Reading a
 * body is how this kind of change goes wrong, so the fallback is exactly what
 * the status alone produced before any of it.
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
      // Signed-out, rate-limited and over-long are ORDINARY here and are not
      // reported: a lapsed session, the limiter doing its job, and a guard
      // turning away a sentence somebody typed. Sending them would drown the
      // signal in expected traffic — and the last of the three is why this
      // branch is keyed on the refusal rather than on the status, since a
      // length refusal used to arrive as `refused` and page the alert channel
      // for a request that never cost anything. A refusal the worker did not
      // name is the one worth knowing about, this being the route that spends
      // money on every call.
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
