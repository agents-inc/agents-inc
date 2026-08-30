import {
  COMPOSED_PROPOSAL,
  COMPOSE_URL,
  composeRefusedHandler,
  composeTooManyHandler,
  composeUnreachableHandler,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { composeProposal } from "./compose"

// The composer's one call, and the five endings it can have.
//
// Two of them are deliberately NOT reported, and a third — an answer that is
// not a proposal — is not either. This is the route that spends money on every
// call, so its signal is worth keeping clean of a lapsed session and of the
// limiter working as designed; the assertions below are the only thing holding
// those silences in place.

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

const SENTENCE = "a react app with tests"

const MODEL_SILENT = 502

// A 200 whose `skillIds` is a string. The shape a model can produce and the
// worker's own filter cannot rule out, since what it validates is the ids and
// not the envelope this side reads.
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

  // A sentence, and nothing else on the wire. Scope, install mode and which
  // sub-agent carries what are not the model's to decide, so none of them
  // crosses — an id is the whole of what the two halves agree on.
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

  // The resting state: the route sits behind `authenticated`, so a browser with
  // no cookie gets this and nothing is wrong. The one refusal here that names
  // an action, and not reported for the same reason a lapsed save is not.
  it("names a lapsed session, and does not report it", async () => {
    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "signed-out",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // The limiter is keyed on the person rather than the address, so this is the
  // quota working exactly as intended. Reporting it would send expected traffic
  // to the place the unexpected traffic is meant to be visible.
  it("names the limiter doing its job, and does not report it", async () => {
    configMockServer.use(composeTooManyHandler, ...signedInHandlers)

    await expect(composeProposal(SENTENCE)).resolves.toStrictEqual({
      ok: false,
      refusal: "too-many",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // The other half of the two above: the same call, refused by a status the
  // worker did not name, IS counted. The refusal goes AHEAD of the signed-in
  // set because `use()` matches in argument order.
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

  // A 200 the schema will not take is a refusal rather than a throw: the caller
  // is a click handler, so an exception here puts the failure where only a
  // console shows it. It reports nothing, which is a decision rather than an
  // oversight — the worker already answered 200, so nothing downstream of it is
  // an outage this side can name.
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
    // The message alone, matching `configs.test.ts`: this one carries no
    // context, and what is worth pinning is that it is reported under its own
    // name rather than as the refusal above.
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Compose could not reach the worker",
    ])
  })
})
