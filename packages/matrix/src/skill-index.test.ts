import { describe, expect, it } from "vitest"

import { MAX_EXTERNAL_SKILL_BYTES } from "./seed"
import { skillIndexEntrySchema, skillIndexSchema } from "./skill-index"

// The wire contract for the federated skill index, tested here because it is
// where three parties meet: the Action's crawl produces it, the worker stores
// and serves it, and the editor's add-skills dialog reads it. A rule only one
// of the three enforces is not a rule.
//
// What these pin is the field the dialog needs in order to REFUSE an entry.
// Every other field exists so a result can be shown and then fetched; `bytes`
// exists so a result that can never be fetched says so where it is first seen,
// instead of after search, stage, categorise and confirm.

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

  // Required rather than optional, which is the whole reason the worker's KV
  // key was bumped. An optional field is permanently optional — every reader
  // carries the `undefined` branch forever, and the one number the refusal
  // needs is the one it may not have.
  it("refuses an entry that does not say how big the skill is", () => {
    const { bytes: _dropped, ...sizeless } = entry()

    expect(skillIndexEntrySchema.safeParse(sizeless).success).toBe(false)
  })

  // A sum over blob sizes GitHub reported. It cannot be negative and it cannot
  // be a fraction, so neither parses — a number of that shape means the crawl
  // summed something that was not a byte count.
  it("refuses a weight that is not a whole count of bytes", () => {
    expect(skillIndexEntrySchema.safeParse(entry({ bytes: -1 })).success).toBe(
      false
    )
    expect(skillIndexEntrySchema.safeParse(entry({ bytes: 1.5 })).success).toBe(
      false
    )
  })

  // Zero is what a directory whose blobs report no size at all sums to, and it
  // is a real answer rather than a missing one: the entry is served, reads as
  // addable, and the editor's own listing at confirm remains the backstop.
  it("accepts a weight of zero, which is what an unweighable directory sums to", () => {
    expect(skillIndexEntrySchema.parse(entry({ bytes: 0 })).bytes).toBe(0)
  })

  // The contract does not enforce the cap — an entry past it is a real skill in
  // a real repository and belongs in the index. What the cap decides is whether
  // the dialog offers it, and that decision needs the number to exist.
  it("indexes a skill past the per-skill cap rather than dropping it", () => {
    const oversized = entry({ bytes: MAX_EXTERNAL_SKILL_BYTES + 1 })

    expect(skillIndexEntrySchema.safeParse(oversized).success).toBe(true)
  })
})

describe("skillIndexSchema", () => {
  // The hazard the KV bump answers, stated as a test: an index built before
  // `bytes` existed does not satisfy this schema, so a worker still serving one
  // would serve nothing. Bumping the key is what stops that being a wait for
  // the next daily build.
  it("refuses a whole index whose entries predate the weight", () => {
    const { bytes: _dropped, ...sizeless } = entry()
    const published = {
      builtAt: "2026-08-18T09:00:00.000Z",
      skills: [sizeless],
    }

    expect(skillIndexSchema.safeParse(published).success).toBe(false)
  })
})
