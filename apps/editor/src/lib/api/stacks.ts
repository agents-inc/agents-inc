import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// A saved stack is a name and a pointer to the KV id `POST /configs` minted.

// Revalidated: the response types describe the worker this was built against.
const savedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  configId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type RemoteStack = z.infer<typeof savedStackSchema>

/**
 * `signed-out` and `taken` name an action: sign in, or pick another name. The
 * worker answers 401 and 409 for them.
 */
export type StackRefusal = "signed-out" | "taken" | "refused" | "unreachable"

export type StackResult =
  { ok: true; stack: RemoteStack } | { ok: false; refusal: StackRefusal }

// Only a write can meet a name.
export type ListRefusal = Exclude<StackRefusal, "taken">

type StackListResult =
  { ok: true; stacks: RemoteStack[] } | { ok: false; refusal: ListRefusal }

const SIGNED_OUT = 401
const NAME_TAKEN = 409

/** An empty list is an answer about the account, so a failed read refuses. */
export const listStacks = async (): Promise<StackListResult> => {
  try {
    const response = await api.stacks.$get()

    // Read before narrowing: the route declares only 200 and 401, but anything
    // may answer.
    const { status } = response

    if (!response.ok) {
      // Not reported: a lapsed session is ordinary.
      if (status === SIGNED_OUT) return { ok: false, refusal: "signed-out" }

      reportIssue("Stack list GET failed", { status })
      return { ok: false, refusal: "refused" }
    }

    const parsed = z.array(savedStackSchema).safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Stack list returned an unreadable body")
      return { ok: false, refusal: "refused" }
    }

    return { ok: true, stacks: parsed.data }
  } catch {
    reportIssue("Stack list GET could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}

export const createStack = async (
  name: string,
  configId: string
): Promise<StackResult> => {
  try {
    const response = await api.stacks.$post({ json: { name, configId } })

    // Read before narrowing: the route declares only 201, 401 and 409, but
    // anything may answer.
    const { status } = response

    if (!response.ok) {
      // Not reported: a lapsed session is ordinary, and a name in use is the
      // person's to change.
      if (status === SIGNED_OUT) return { ok: false, refusal: "signed-out" }
      if (status === NAME_TAKEN) return { ok: false, refusal: "taken" }

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
