import { AGENTS_NOT_ON_CODEX } from "@workspace/compile/agent-source"
import { describe, expect, it } from "vitest"

import {
  AGENTS_LEFT_OUT_OF_CODEX,
  compilesAgent,
  offersPlacement,
  patchForPress,
} from "./provider"

// `provider.ts` cannot import the renderer's roster, so the mirror is pinned
// here.
describe("the roster Codex leaves out", () => {
  it("is the renderer's own list, mirrored", () => {
    expect([...AGENTS_LEFT_OUT_OF_CODEX]).toStrictEqual([
      ...AGENTS_NOT_ON_CODEX,
    ])
  })

  it("is what the grid and the roster ask about", () => {
    for (const agent of AGENTS_NOT_ON_CODEX) {
      expect(compilesAgent("codex", agent)).toBe(false)
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

describe("the patch a press produces", () => {
  const EJECT_PROJECT = { install: "eject", scope: "project" } as const
  const PLUGIN_GLOBAL = { install: "plugin", scope: "global" } as const

  it("takes a plugin press to global on Codex", () => {
    expect({
      ...EJECT_PROJECT,
      ...patchForPress("codex", { install: "plugin" }),
    }).toStrictEqual(PLUGIN_GLOBAL)
  })

  it("leaves a plugin press at project on Claude", () => {
    expect({
      ...EJECT_PROJECT,
      ...patchForPress("claude", { install: "plugin" }),
    }).toStrictEqual({ install: "plugin", scope: "project" })
  })

  it("leaves the scope of an eject press alone on Codex", () => {
    expect({
      ...PLUGIN_GLOBAL,
      ...patchForPress("codex", { install: "eject" }),
    }).toStrictEqual({ install: "eject", scope: "global" })
  })

  it("passes a scope press through unchanged on Codex", () => {
    expect(patchForPress("codex", { scope: "project" })).toStrictEqual({
      scope: "project",
    })
  })
})
