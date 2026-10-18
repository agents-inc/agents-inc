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

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

// Undeclared by the route (201 and 401 only), but anything may answer at
// runtime.
const SERVER_ERROR = 500

const CREATED = 201

const notAStackListHandler = http.get(STACKS_URL, () =>
  HttpResponse.json([{ id: SAVED_STACK.id }])
)

const notAStackHandler = http.post(STACKS_URL, () =>
  HttpResponse.json({ id: SAVED_STACK.id }, { status: CREATED })
)

const listUnreachableHandler = http.get(STACKS_URL, () => HttpResponse.error())

beforeEach(() => {
  setReportingSink(sink)
})

describe("listStacks", () => {
  it("returns the stacks the worker holds, newest first", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(listStacks()).resolves.toStrictEqual(SAVED_STACKS)
  })

  it("is empty when nobody is signed in, and reports nothing", async () => {
    await expect(listStacks()).resolves.toStrictEqual([])
    expect(sink.issue).not.toHaveBeenCalled()
  })

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
  // The mock echoes what it was sent, as the worker does.
  it("returns the stack the worker saved", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: true, stack: SAVED_STACK })
  })

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

  it("names a lapsed session, and does not report it", async () => {
    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "signed-out" })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // Ahead of the signed-in set: `use()` matches in argument order.
  it("reports a refusal the worker did not name", async () => {
    configMockServer.use(stackRefusedHandler, ...signedInHandlers)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "refused" })
    expect(sink.issue).toHaveBeenCalledWith("Stack POST rejected", {
      status: SERVER_ERROR,
    })
  })

  it("refuses a body that does not match the contract", async () => {
    configMockServer.use(notAStackHandler)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "refused" })
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

// Only an answer the worker stood behind lists anything.
describe("listStacks on a refused answer", () => {
  it("lists nothing even when its body holds stacks", async () => {
    configMockServer.use(
      http.get(STACKS_URL, () =>
        HttpResponse.json(SAVED_STACKS, { status: SERVER_ERROR })
      )
    )

    expect(await listStacks()).toStrictEqual([])
  })
})
