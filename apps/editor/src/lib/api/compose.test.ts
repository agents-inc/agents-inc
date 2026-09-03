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

// The one status on this route that the status alone cannot explain. `/compose`
// spends it on two guards — an empty sentence and one past its cap — and names
// which in the body, so every claim below about a 400 is a claim about a body.
const BAD_REQUEST = 400

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

  // The guard the route runs BEFORE it reaches the model, and the reason this
  // client has to read a body at all. Refused for length, the worker never
  // called Claude — so "the model did not answer" was not merely unhelpful, it
  // was false, and it was the sentence the composer drew.
  //
  // Not reported, and it belongs with the two silences above rather than with
  // the branch below: a sentence somebody typed past the cap is the guard doing
  // its job, exactly as the limiter above is. Nothing went wrong here.
  it("names a sentence past the worker's cap, and does not report it", async () => {
    // EDITOR-69. THE DOUBLE, GUARDED RATHER THAN TRUSTED — the same self-check
    // `handlers.test.ts` makes on `OUT_OF_SCOPE_PAYLOAD` before standing on it,
    // and the one thing that makes the outcome below a claim about the WORKER.
    //
    // Everything under test here turns on four copies of one string agreeing:
    // the worker's own literal, the fixture, this double, and `TOO_LONG` in
    // compose.ts — which is the copy the shipped bug lives in and the only one
    // no spec can import, `@workspace/api-mocks` being a test dependency. The
    // assertion below reaches that copy through the double, so a double that
    // stopped carrying the fixture would leave this test agreeing with the
    // editor about a string the worker no longer sends, which is precisely the
    // state EDITOR-69 exists to make impossible. Naming the fixture here pins
    // the double to the same one definition `compose.test.ts` in apps/server
    // now pins the route to.
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

  // The DEGRADE half of the one above, and the reason it is a separate test
  // rather than the same test's other branch: reading a body is how this goes
  // wrong. A 400 that carries nothing to read — the worker's own empty-sentence
  // guard, a proxy, a gateway — must produce exactly what the status alone
  // produced before any of this, report included.
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
