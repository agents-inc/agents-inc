import { describe, expect, it } from "vitest"

import { MAX_EXTERNAL_SKILL_BYTES } from "./seed"
import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexEntrySchema,
  skillIndexFreshnessSchema,
  skillIndexSchema,
} from "./skill-index"

const entry = (over: Record<string, unknown> = {}) => ({
  name: "docx",
  description: "Create, read and edit Word documents.",
  repo: "anthropics/skills",
  path: "skills/docx",
  stars: 166_923,
  bytes: 1_128_695,
  ...over,
})

describe("skillIndexEntrySchema", () => {
  it("carries the weight of the skill's whole directory", () => {
    expect(skillIndexEntrySchema.parse(entry()).bytes).toBe(1_128_695)
  })

  it("refuses an entry that does not say how big the skill is", () => {
    const { bytes: _dropped, ...sizeless } = entry()

    expect(skillIndexEntrySchema.safeParse(sizeless).success).toBe(false)
  })

  it("refuses a weight that is not a whole count of bytes", () => {
    expect(skillIndexEntrySchema.safeParse(entry({ bytes: -1 })).success).toBe(
      false
    )
    expect(skillIndexEntrySchema.safeParse(entry({ bytes: 1.5 })).success).toBe(
      false
    )
  })

  it("accepts a weight of zero, which is what an unweighable directory sums to", () => {
    expect(skillIndexEntrySchema.parse(entry({ bytes: 0 })).bytes).toBe(0)
  })

  it("indexes a skill past the per-skill cap rather than dropping it", () => {
    const oversized = entry({ bytes: MAX_EXTERNAL_SKILL_BYTES + 1 })

    expect(skillIndexEntrySchema.safeParse(oversized).success).toBe(true)
  })
})

describe("skillIndexSchema", () => {
  it("refuses a whole index whose entries predate the weight", () => {
    const { bytes: _dropped, ...sizeless } = entry()
    const published = {
      builtAt: "2026-08-18T09:00:00.000Z",
      skills: [sizeless],
    }

    expect(skillIndexSchema.safeParse(published).success).toBe(false)
  })
})

describe("skillIndexFreshnessSchema", () => {
  it.each(["fresh", "stale"])("reads an index that is %s", (freshness) => {
    expect(skillIndexFreshnessSchema.parse(freshness)).toBe(freshness)
  })

  it("refuses a freshness the worker never sends", () => {
    expect(skillIndexFreshnessSchema.safeParse("cold").success).toBe(false)
  })
})

// The worker and the editor deploy apart, so the name is part of the wire contract.
describe("SKILL_INDEX_FRESHNESS_HEADER", () => {
  it("is the header the worker sets and its callers read", () => {
    expect(SKILL_INDEX_FRESHNESS_HEADER).toBe("x-skill-index")
  })
})
