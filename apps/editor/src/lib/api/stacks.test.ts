import {
  SAVED_STACK,
  SAVED_STACKS,
  STACKS_URL,
  stackRefusedHandler,
  stackUnreachableHandler,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { createStack, listStacks } from "./stacks"

// The client's half of the saved-stack round trip, against the same mock of the
// worker the Playwright specs save against. What is under test is the
// translation: a status the worker documents becomes one of this module's two
// result shapes, and which failures are worth reporting is decided here.
//
// The deliberate SILENCES are the part a transport change can lose with nothing
// going red — a lapsed session is ordinary traffic, and counting it would bury
// the outages underneath it. So they are asserted rather than assumed.

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

// Undeclared by the route, which declares 201 and 401 and nothing else. That is
// the point of covering it: what answers at runtime is whatever is deployed
// plus whatever sits between it and here, and this side has to tell a status it
// was not promised apart from no answer at all.
const SERVER_ERROR = 500

const CREATED = 201

const notAStackListHandler = http.get(STACKS_URL, () =>
  HttpResponse.json([{ id: SAVED_STACK.id }])
)

const notAStackHandler = http.post(STACKS_URL, () =>
  HttpResponse.json({ id: SAVED_STACK.id }, { status: CREATED })
)

// The GET's own network failure. Its POST counterpart is shared, and this one
// is not, because `listStacks` is the only caller of the GET and this is the
// only place that answer means anything.
const listUnreachableHandler = http.get(STACKS_URL, () => HttpResponse.error())

beforeEach(() => {
  setReportingSink(sink)
})

describe("listStacks", () => {
  // Order is the assertion, not a side effect of it: the worker sorts on
  // `updatedAt` and the rail draws them in the order it is handed.
  it("returns the stacks the worker holds, newest first", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(listStacks()).resolves.toStrictEqual(SAVED_STACKS)
  })

  // The resting state of every first visit, and it reports nothing: signed out
  // is a state the caller already draws a control for, so an empty list here is
  // the answer rather than a failure.
  it("is empty when nobody is signed in, and reports nothing", async () => {
    await expect(listStacks()).resolves.toStrictEqual([])
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // A body that does not satisfy the schema is an empty list rather than a
  // throw — the caller is a render path, and an exception is a blank rail.
  it("is empty when the list does not match the contract", async () => {
    configMockServer.use(notAStackListHandler)

    await expect(listStacks()).resolves.toStrictEqual([])
  })

  it("is empty when the worker cannot be reached", async () => {
    configMockServer.use(listUnreachableHandler)

    await expect(listStacks()).resolves.toStrictEqual([])
  })
})

describe("createStack", () => {
  // The mock answers with what it was sent, exactly as the worker does, so
  // saving under the canonical fixture's own name and pointer is what makes
  // that fixture the expected row.
  it("returns the stack the worker saved", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: true, stack: SAVED_STACK })
  })

  // A NAME AND A POINTER, and nothing else on the wire. Nothing here serializes
  // a configuration, which is what keeps this call unable to drift from the
  // payload contract.
  it("sends the name and the id the payload was minted under", async () => {
    const sent: unknown[] = []
    configMockServer.use(
      http.post(STACKS_URL, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(SAVED_STACK, { status: CREATED })
      })
    )

    await createStack(SAVED_STACK.name, SAVED_STACK.configId)

    expect(sent).toStrictEqual([
      { name: SAVED_STACK.name, configId: SAVED_STACK.configId },
    ])
  })

  // The session lapsed while the tab was open. The one ending that names its
  // own fix, and the one that is not reported: it is ordinary, and the button
  // says what to do about it.
  it("names a lapsed session, and does not report it", async () => {
    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "signed-out" })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // The other half of the pair above, and the reason both are here: the same
  // failed save is silent on one status and counted on another. The refusal
  // goes AHEAD of the signed-in set because `use()` matches in argument order.
  it("reports a refusal the worker did not name", async () => {
    configMockServer.use(stackRefusedHandler, ...signedInHandlers)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "refused" })
    expect(sink.issue).toHaveBeenCalledWith("Stack POST rejected", {
      status: SERVER_ERROR,
    })
  })

  // A 201 whose body is not a stack: a refusal, not a throw, and reported under
  // its own name — a worker answering the wrong shape is a different fault from
  // one refusing outright, and folding them together would hide it.
  it("refuses a body that does not match the contract", async () => {
    configMockServer.use(notAStackHandler)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "refused" })
    // The message alone, matching `configs.test.ts`: these carry no context,
    // and what is worth pinning is that each is reported under its own name
    // rather than folded into the one above.
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Stack POST returned an unreadable body",
    ])
  })

  it("separates never getting an answer from being refused", async () => {
    configMockServer.use(stackUnreachableHandler)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "unreachable" })
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Stack POST could not reach the worker",
    ])
  })
})
