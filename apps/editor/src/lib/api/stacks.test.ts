import {
  SAVED_STACK,
  SAVED_STACKS,
  STACKS_URL,
  savedStack,
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
const SERVICE_UNAVAILABLE = 503

const CREATED = 201

const notAStackListHandler = http.get(STACKS_URL, () =>
  HttpResponse.json([{ id: SAVED_STACK.id }])
)

const notAStackHandler = http.post(STACKS_URL, () =>
  HttpResponse.json({ id: SAVED_STACK.id }, { status: CREATED })
)

const listUnreachableHandler = http.get(STACKS_URL, () => HttpResponse.error())

const emptyAccountHandler = http.get(STACKS_URL, () => HttpResponse.json([]))

beforeEach(() => {
  setReportingSink(sink)
})

// An empty list is an answer about the account: a first sign-in carries every
// local save into it. So a list that could not be read must never look like
// one.
describe("listStacks", () => {
  it("returns the stacks the worker holds, newest first", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(listStacks()).resolves.toStrictEqual({
      ok: true,
      stacks: SAVED_STACKS,
    })
  })

  it("lists nothing for an account that holds no stacks", async () => {
    configMockServer.use(emptyAccountHandler)

    await expect(listStacks()).resolves.toStrictEqual({ ok: true, stacks: [] })
  })

  // The owner's ruling: the list is read only once the session read vouched
  // for one, so a 401 here is a session that ended mid-load, and a list the
  // editor couldn't read. Which refusal it names is the code's; the grid and
  // Save read any refusal alike.
  it("fails, rather than listing nothing, when the worker answers that nobody is signed in", async () => {
    expect(await listStacks()).toMatchObject({ ok: false })
  })

  it("fails, rather than listing nothing, when the list does not match the contract", async () => {
    configMockServer.use(notAStackListHandler)

    await expect(listStacks()).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
  })

  it("fails, rather than listing nothing, when the worker cannot be reached", async () => {
    configMockServer.use(listUnreachableHandler)

    await expect(listStacks()).resolves.toStrictEqual({
      ok: false,
      refusal: "unreachable",
    })
  })
})

describe("createStack", () => {
  // The mock echoes what it was sent, as the worker does, under a name none of
  // the account's stacks holds.
  it("returns the stack the worker saved", async () => {
    configMockServer.use(...signedInHandlers)
    const fresh = savedStack("Side project", SAVED_STACK.configId)

    await expect(
      createStack(fresh.name, fresh.configId)
    ).resolves.toStrictEqual({ ok: true, stack: fresh })
  })

  // The worker's 409. A name in use is the person's to change, not a fault.
  it("names a name another of the account's stacks holds, and does not report it", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(
      createStack(SAVED_STACK.name, SAVED_STACK.configId)
    ).resolves.toStrictEqual({ ok: false, refusal: "taken" })
    expect(sink.issue).not.toHaveBeenCalled()
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

// The owner's ruling: a list that could not be read is reported as the sibling
// reads report theirs. A refusal carries its status; a body or a missing answer
// has none to carry.
describe("what listStacks reports", () => {
  it.each([SERVER_ERROR, SERVICE_UNAVAILABLE])(
    "reports a list the worker refused with %i, with that status",
    async (status) => {
      configMockServer.use(
        http.get(STACKS_URL, () => new HttpResponse(null, { status }))
      )

      await listStacks()

      expect(sink.issue.mock.calls).toStrictEqual([
        ["Stack list GET failed", { status }],
      ])
    }
  )

  it("reports a list that does not match the contract", async () => {
    configMockServer.use(notAStackListHandler)

    await listStacks()

    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Stack list returned an unreadable body",
    ])
  })

  it("reports never getting an answer", async () => {
    configMockServer.use(listUnreachableHandler)

    await listStacks()

    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Stack list GET could not reach the worker",
    ])
  })

  // As today, and as the save and the composer treat a lapsed session: not
  // reported. No ruling says a list read should report one.
  it("reports nothing when the worker answers that nobody is signed in", async () => {
    await listStacks()

    expect(sink.issue).not.toHaveBeenCalled()
  })

  // The allowed half, so the reports above are shown to come from the failure
  // and not from the read.
  it("reports nothing for a list it read", async () => {
    configMockServer.use(...signedInHandlers)

    await listStacks()

    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("reports nothing for an account that holds no stacks", async () => {
    configMockServer.use(emptyAccountHandler)

    await listStacks()

    expect(sink.issue).not.toHaveBeenCalled()
  })
})

// Only an answer the worker stood behind lists anything.
describe("listStacks on a refused answer", () => {
  it("fails, listing none of the stacks its body holds", async () => {
    configMockServer.use(
      http.get(STACKS_URL, () =>
        HttpResponse.json(SAVED_STACKS, { status: SERVER_ERROR })
      )
    )

    expect(await listStacks()).toStrictEqual({ ok: false, refusal: "refused" })
  })
})
