import {
  CONFIGS_URL,
  DEAD_LINK_ID,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_ID,
  configUnreachableHandler,
  storeRefusedHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import type { ReportingSink } from "@/lib/observability/report"

import { createSharedConfig, fetchSharedConfig } from "./configs"

// The client's half of the worker round trip, against the same mock of that
// worker the Playwright specs draw their payloads from. What is under test is
// the translation: a status the worker documents becomes one of this module's
// two result shapes, and the message the user reads is decided here rather
// than by the worker's body.

// `reportIssue` is the seam this module reports through, so a recording sink is
// both what keeps the suite quiet and what lets the one deliberate silence — a
// 404 — be asserted rather than assumed.
// Typed to the sink's own contract rather than left as bare `vi.fn()`, so a
// test that reads back what was reported gets the arguments' types with it.
const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

// The worker's answer to a payload naming a seed version it does not serve.
// Defined here rather than beside the other config handlers because it is the
// only response in the set that describes the CALLER rather than the worker:
// what is stale is this bundle, and the worker is behaving perfectly.
const staleBundleHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(
    "Reload the page: this configuration names another version of the sharing contract",
    { status: 409 }
  )
)

beforeEach(() => {
  setReportingSink(sink)
})

describe("createSharedConfig", () => {
  it("returns the id the worker minted", async () => {
    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: true, id: STORED_ID })
  })

  // The worker answers 503 when KV refuses the write. Nothing the person at the
  // keyboard can do about it, and nothing they can be told to do — which is
  // exactly what separates it from the 409 below.
  it("reads a refused write as a refusal nobody can act on", async () => {
    configMockServer.use(storeRefusedHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "refused" })
    expect(sink.issue).toHaveBeenCalledWith("Share POST rejected", {
      status: 503,
    })
  })

  // The one refusal with an action attached. This tab is running a bundle from
  // before the last deploy: it mints the version it was BUILT with, its own
  // bundled schema accepts that, and the worker refuses it — on this click and
  // on every click after it, until the page is reloaded. Folded in with the
  // above it is a word the user cannot act on; told apart it is an instruction.
  it("reads a 409 as this page being out of date", async () => {
    configMockServer.use(staleBundleHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "out-of-date" })
  })

  // Reported under its own name rather than with the refusals above. It is not
  // a bug in the worker and not an outage — it is how often a deploy leaves
  // open tabs behind, which is a number worth watching on its own.
  it("reports a stale bundle apart from a worker that refused", async () => {
    configMockServer.use(staleBundleHandler)

    await createSharedConfig(STORED_PAYLOAD)

    expect(sink.issue).toHaveBeenCalledWith("Share POST refused a stale page", {
      status: 409,
    })
  })

  // Offline, DNS, a proxy that dropped it. The fetch throws rather than
  // answering, so this is the one failure that never reaches a status at all.
  it("reads an unreachable worker as its own refusal", async () => {
    configMockServer.use(configUnreachableHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, refusal: "unreachable" })
    // The message alone, since this one carries no context to assert on — what
    // is worth pinning is that it is reported under its own name and not with
    // the two above.
    expect(sink.issue.mock.calls.map(([message]) => message)).toStrictEqual([
      "Share POST could not reach the worker",
    ])
  })
})

describe("fetchSharedConfig", () => {
  it("returns the stored payload", async () => {
    const result = await fetchSharedConfig(STORED_ID)

    expect(result).toStrictEqual({ ok: true, payload: STORED_PAYLOAD })
  })

  // An id the store does not hold is an ordinary mistyped link, not an
  // incident, and the source says so: reporting it would bury the real
  // failures in noise.
  it("reads a dead link as a dead link and reports nothing", async () => {
    const result = await fetchSharedConfig(DEAD_LINK_ID)

    expect(result).toStrictEqual({
      ok: false,
      error: "this share link points to nothing",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // 500 is the worker's integrity failure: the bytes under a content-addressed
  // key are not the bytes that were hashed into it. The client cannot tell that
  // apart from any other server fault, so it reads as a status.
  it("reads an unreadable stored config as a failure carrying the status", async () => {
    const result = await fetchSharedConfig(UNREADABLE_CONFIG_ID)

    expect(result).toStrictEqual({
      ok: false,
      error: "loading the shared config failed (500)",
    })
    expect(sink.issue).toHaveBeenCalledWith("Share GET failed", { status: 500 })
  })
})
