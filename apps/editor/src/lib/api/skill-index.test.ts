import {
  SKILL_INDEX,
  SKILL_INDEX_URL,
  STALE_SKILL_INDEX,
  skillIndexUnavailableHandler,
  staleSkillIndexHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import { fetchSkillIndex, formatStars } from "./skill-index"

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

  it("drops a trailing zero from the fraction", () => {
    expect(formatStars(2000)).toBe("2k")
  })
})

describe("what fetchSkillIndex says when it cannot hand back an index", () => {
  it("names an index it cannot read, and reports it", async () => {
    configMockServer.use(
      http.get(SKILL_INDEX_URL, () => HttpResponse.json({ skills: "none" }))
    )

    expect(await fetchSkillIndex()).toStrictEqual({
      ok: false,
      error: "the skill index is unreadable",
    })
    expect(sink.issue.mock.calls).toStrictEqual([
      ["Skill index returned an unreadable body", undefined],
    ])
  })

  it("says the index is unreachable, and reports it", async () => {
    configMockServer.use(http.get(SKILL_INDEX_URL, () => HttpResponse.error()))

    expect(await fetchSkillIndex()).toStrictEqual({
      ok: false,
      error: "the skill index is unreachable",
    })
    expect(sink.issue.mock.calls).toStrictEqual([
      ["Skill index GET could not reach the worker", undefined],
    ])
  })
})

describe("formatStars past ten thousand", () => {
  it("rounds to a whole thousand rather than keeping a fraction", () => {
    expect(formatStars(12_345)).toBe("12k")
  })
})
