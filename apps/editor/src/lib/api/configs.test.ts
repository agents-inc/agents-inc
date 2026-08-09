import {
  DEAD_LINK_ID,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_ID,
  storeRefusedHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import { createSharedConfig, fetchSharedConfig } from "./configs"

// The client's half of the worker round trip, against the same mock of that
// worker the Playwright specs draw their payloads from. What is under test is
// the translation: a status the worker documents becomes one of this module's
// two result shapes, and the message the user reads is decided here rather
// than by the worker's body.

// `reportIssue` is the seam this module reports through, so a recording sink is
// both what keeps the suite quiet and what lets the one deliberate silence — a
// 404 — be asserted rather than assumed.
const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

describe("createSharedConfig", () => {
  it("returns the id the worker minted", async () => {
    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: true, id: STORED_ID })
  })

  // The worker answers 503 when KV refuses the write. Every non-2xx here is an
  // outage or a bug — the payload came from the contract's own schema — so
  // unlike the GET's 404 this one is reported.
  it("reads a refused write as a failure carrying the status", async () => {
    configMockServer.use(storeRefusedHandler)

    const result = await createSharedConfig(STORED_PAYLOAD)

    expect(result).toStrictEqual({ ok: false, error: "sharing failed (503)" })
    expect(sink.issue).toHaveBeenCalledWith("Share POST rejected", {
      status: 503,
    })
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
