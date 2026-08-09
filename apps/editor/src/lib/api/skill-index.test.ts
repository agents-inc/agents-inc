import {
  SKILL_INDEX,
  STALE_SKILL_INDEX,
  skillIndexUnavailableHandler,
  staleSkillIndexHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import { fetchSkillIndex, formatStars } from "./skill-index"

// The client's half of the worker's `GET /skills`, against the same mock of
// that worker the Playwright specs draw their fixtures from. What is under
// test is the translation: a status and a header the worker documents become
// one of this module's two result shapes, and the message the user reads is
// decided here rather than by the worker's body.

// `reportIssue` is the seam this module reports through, so a recording sink is
// both what keeps the suite quiet and what lets the one deliberate silence — a
// stale index, which is a degraded answer rather than a fault — be asserted
// rather than assumed.
const sink = { issue: vi.fn(), error: vi.fn() }

beforeEach(() => {
  setReportingSink(sink)
})

describe("fetchSkillIndex", () => {
  it("returns the index the worker served and says it is the whole picture", async () => {
    const result = await fetchSkillIndex()

    expect(result).toStrictEqual({
      ok: true,
      index: SKILL_INDEX,
      freshness: "fresh",
    })
  })

  // A stale index is a 200 by design: a list of external skills from last week
  // is worth almost what today's is worth, and an error is worth nothing. So
  // this is the degraded path, not the failure path — the caller gets usable
  // results plus the one fact a body cannot carry.
  it("reads a stale index as results plus a warning, not as a failure", async () => {
    configMockServer.use(staleSkillIndexHandler)

    const result = await fetchSkillIndex()

    expect(result).toStrictEqual({
      ok: true,
      index: STALE_SKILL_INDEX,
      freshness: "stale",
    })
    expect(sink.issue).not.toHaveBeenCalled()
  })

  // The one case the route refuses outright: a cold cache AND an upstream that
  // will not answer, so there is genuinely nothing to serve.
  it("reads an unavailable index as a failure carrying the status", async () => {
    configMockServer.use(skillIndexUnavailableHandler)

    const result = await fetchSkillIndex()

    expect(result).toStrictEqual({
      ok: false,
      error: "loading the skill index failed (503)",
    })
    expect(sink.issue).toHaveBeenCalledWith("Skill index GET failed", {
      status: 503,
    })
  })
})

// This exists because the design's result row is a single line: a repository
// with 28k stars written in full wraps it. Pure string arithmetic with awkward
// boundaries, which is cheaper to pin down here than by reading pixels in a
// browser.
describe("formatStars", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1000, "1k"],
    [1100, "1.1k"],
    [9100, "9.1k"],
    [9999, "10k"],
    [23000, "23k"],
    [50000, "50k"],
  ])("renders %i as %s", (stars, expected) => {
    expect(formatStars(stars)).toBe(expected)
  })

  // A trailing `.0` is noise: 2000 is "2k", never "2.0k".
  it("drops a trailing zero from the fraction", () => {
    expect(formatStars(2000)).toBe("2k")
  })
})
