import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// A saved stack is a NAME AND A POINTER. The bytes live in KV under the id
// `POST /configs` minted — the same id a share link carries — so nothing here
// serializes a configuration and none of these calls can drift from the payload
// contract, because none of them knows it.

// Revalidated against the contract even though `api` types the response, for
// the reason `configs.ts` gives: those types describe the worker this was
// *built* against, and what answers at runtime is whatever is deployed.
const savedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  configId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type RemoteStack = z.infer<typeof savedStackSchema>

/**
 * This person's stacks, or `[]`.
 *
 * A 401 is `[]` rather than an error: it means signed out, which the caller
 * already draws a sign-in control for, and the alternative is two components
 * telling one story.
 */
export const listStacks = async (): Promise<RemoteStack[]> => {
  try {
    const response = await api.stacks.$get()
    if (!response.ok) return []

    const parsed = z.array(savedStackSchema).safeParse(await response.json())
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/**
 * Why a stack was not saved, and nothing about how to say so — the same shape
 * `ShareResult` uses in `api/configs.ts`, and for the same reason.
 *
 * A `null` covered all three of these and the caller could only ignore it,
 * which is how a signed-in Save came to do nothing in silence while the
 * signed-out one always succeeded: one button, two meanings.
 *
 * - `signed-out` — the session expired while the tab was open. The only ending
 *   here that names an action, and the worker answers 401 rather than 403
 *   precisely so this side can tell it from a refusal — see
 *   `apps/server/src/stacks.ts`.
 * - `refused` — the worker answered and would not take it: an outage or a bug.
 * - `unreachable` — the request never got an answer at all.
 */
export type StackRefusal = "signed-out" | "refused" | "unreachable"

export type StackResult =
  { ok: true; stack: RemoteStack } | { ok: false; refusal: StackRefusal }

const SIGNED_OUT = 401

export const createStack = async (
  name: string,
  configId: string
): Promise<StackResult> => {
  try {
    const response = await api.stacks.$post({ json: { name, configId } })

    // Read off the response before the branches below narrow it away, and the
    // detour is what keeps the last refusal reachable. The route declares 201
    // and 401 and nothing else, so `tsc` can prove `response.status` is 401
    // inside the block below — while what actually answers is whatever is
    // deployed, plus anything between it and here. Letting an undeclared status
    // fall through instead would put it into the `catch` as `unreachable`,
    // which is a different thing to tell a person: the worker did answer.
    const { status } = response

    if (!response.ok) {
      // Not reported, for the reason a 404 on a share link is not: a session
      // that lapsed is ordinary, the button names its own fix, and counting it
      // would bury the one below in noise.
      if (status === SIGNED_OUT) return { ok: false, refusal: "signed-out" }

      reportIssue("Stack POST rejected", { status })
      return { ok: false, refusal: "refused" }
    }

    const parsed = savedStackSchema.safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Stack POST returned an unreadable body")
      return { ok: false, refusal: "refused" }
    }

    return { ok: true, stack: parsed.data }
  } catch {
    reportIssue("Stack POST could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}

// There is deliberately no `deleteStack` here. `DELETE /stacks/{id}` ships on
// the worker and nothing in the editor draws a control for it yet — a client
// function with no caller is not a head start, it is an untested path that the
// first person to wire a delete button will trust. Write it with the control.
