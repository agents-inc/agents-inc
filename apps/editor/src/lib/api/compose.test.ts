import {
  COMPOSED_PROPOSAL,
  COMPOSE_TOO_LONG_BODY,
  COMPOSE_URL,
  composeRefusedHandler,
  composeRefusedHandlerFor,
  composeTooLongHandler,
  composeTooManyHandler,
  composeUnreachableHandler,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { getResponse, http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { composeProposal } from "./compose"

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

const SENTENCE = "a react app with tests"

const MODEL_SILENT = 502

const BAD_REQUEST = 400

const notAProposalHandler = http.post(COMPOSE_URL, () =>
  HttpResponse.json({ skillIds: "web-framework-react" })
)

beforeEach(() => {
  setReportingSink(sink)
})

describe("composeProposal", () => {
  it("returns the skill ids the worker chose", async () => {
    configMockServer.use(...signedInHandlers)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: true,
      proposal: COMPOSED_PROPOSAL,
    })
  })

  it("sends the sentence and nothing else", async () => {
    const sent: unknown[] = []
    configMockServer.use(
      http.post(COMPOSE_URL, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(COMPOSED_PROPOSAL)
      })
    )

    await composeProposal(SENTENCE)

    expect(sent).toStrictEqual([{ sentence: SENTENCE }])
  })

  it("names a lapsed session, and does not report it", async () => {
    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "signed-out",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("names the limiter doing its job, and does not report it", async () => {
    configMockServer.use(composeTooManyHandler, ...signedInHandlers)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "too-many",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // Ahead of the signed-in set: `use()` matches in argument order.
  it("reports a refusal the worker did not name", async () => {
    configMockServer.use(composeRefusedHandler, ...signedInHandlers)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(sink.issue).toHaveBeenCalledWith("Compose refused", {
      status: MODEL_SILENT,
    })
  })

  it("names a sentence past the worker's cap, and does not report it", async () => {
    // Guard the double first: it must carry the worker's literal, or the
    // assertion below proves nothing.
    const served = await getResponse(
      [composeTooLongHandler],
      new Request(COMPOSE_URL, { method: "POST" })
    )
    expect(
      await served?.json(),
      "the double must still carry the worker's own discriminator"
    ).toStrictEqual(COMPOSE_TOO_LONG_BODY)

    configMockServer.use(composeTooLongHandler, ...signedInHandlers)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "too-long",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("falls back to a plain refusal for a 400 it cannot read, and reports that", async () => {
    configMockServer.use(
      composeRefusedHandlerFor(BAD_REQUEST),
      ...signedInHandlers
    )

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(sink.issue).toHaveBeenCalledWith("Compose refused", {
      status: BAD_REQUEST,
    })
  })

  it("refuses an answer that is not a proposal, and reports nothing", async () => {
    configMockServer.use(notAProposalHandler)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "refused",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("separates never getting an answer from being refused", async () => {
    configMockServer.use(composeUnreachableHandler)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "unreachable",
    })
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Compose could not reach the worker",
    ])
  })
})
