import { AGENTS_NOT_ON_CODEX } from "@workspace/compile/agent-source"
import { describe, expect, it } from "vitest"

import {
  AGENTS_LEFT_OUT_OF_CODEX,
  compilesAgent,
  offersPlacement,
} from "./provider"

/**
 * THE MIRROR'S PIN.
 *
 * `provider.ts` cannot import the renderer's roster: a value import of `@workspace/compile` from a
 * module on the first-paint graph puts that package's 124.7 KB chunk there, which
 * `scripts/first-paint-budget.ts` refuses. So the two ids are written out there and held against
 * the renderer's own list here, where the import costs nothing.
 *
 * `toStrictEqual` over the members rather than a count, and in one assertion rather than a
 * membership check per side: a count cannot tell a summoner swapped for a nineteenth sub-agent from
 * a roster that never moved, and a nineteenth is exactly what this pin exists to survive.
 */
describe("the roster Codex leaves out", () => {
  it("is the renderer's own list, mirrored", () => {
    expect([...AGENTS_LEFT_OUT_OF_CODEX]).toStrictEqual([
      ...AGENTS_NOT_ON_CODEX,
    ])
  })

  it("is what the grid and the roster ask about", () => {
    for (const agent of AGENTS_NOT_ON_CODEX) {
      expect(compilesAgent("codex", agent)).toBe(false)
      // The control: on Claude they are ordinary sub-agents, so a guard that
      // went unconditional would fail here rather than in a browser.
      expect(compilesAgent("claude", agent)).toBe(true)
    }
  })

  it("leaves the sub-agents beside them alone", () => {
    expect(compilesAgent("codex", "reviewer")).toBe(true)
  })
})

describe("the placements a provider offers", () => {
  const PLACEMENTS = [
    { install: "plugin", scope: "global" },
    { install: "eject", scope: "global" },
    { install: "eject", scope: "project" },
  ] as const

  it("offers Codex the three it has a mechanism for", () => {
    for (const placement of PLACEMENTS) {
      expect(offersPlacement("codex", placement)).toBe(true)
    }
  })

  it("refuses the fourth on Codex and allows it on Claude", () => {
    const refused = { install: "plugin", scope: "project" } as const

    expect(offersPlacement("codex", refused)).toBe(false)
    expect(offersPlacement("claude", refused)).toBe(true)
  })
})
