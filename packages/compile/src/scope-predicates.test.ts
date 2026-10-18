import { describe, expect, it } from "vitest"

import {
  activeAgentNames,
  activeAgentScopeMap,
  activeProjectAgentNames,
  activeSkillScopeMap,
  effectivelyExcludedSkillIds,
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
} from "./scope-predicates"
import {
  buildAgentScopeConfig,
  buildSkillConfig,
} from "./__tests__/factories/config-factories"

const REACT = "web-framework-react"
const ZUSTAND = "web-state-zustand"
const VITEST = "web-testing-vitest"

describe("isActiveAt", () => {
  it("holds for an entry at that scope", () => {
    expect(isActiveAt({ scope: "project" }, "project")).toBe(true)
  })

  it("does not hold for an entry at the other scope", () => {
    expect(isActiveAt({ scope: "global" }, "project")).toBe(false)
  })

  it("does not hold for an excluded entry at that scope", () => {
    expect(isActiveAt({ scope: "project", excluded: true }, "project")).toBe(
      false
    )
  })
})

describe("isGlobalTombstone", () => {
  it("holds for an excluded global entry", () => {
    expect(isGlobalTombstone({ scope: "global", excluded: true })).toBe(true)
  })

  it("does not hold for an active global entry", () => {
    expect(isGlobalTombstone({ scope: "global" })).toBe(false)
  })

  it("does not hold for an excluded project entry", () => {
    expect(isGlobalTombstone({ scope: "project", excluded: true })).toBe(false)
  })
})

describe("isProjectOwned", () => {
  it("holds for a project entry", () => {
    expect(isProjectOwned({ scope: "project" })).toBe(true)
  })

  it("holds for the project's tombstone over a global install", () => {
    expect(isProjectOwned({ scope: "global", excluded: true })).toBe(true)
  })

  it("does not hold for an active global entry", () => {
    expect(isProjectOwned({ scope: "global" })).toBe(false)
  })
})

describe("the active agents of a roster", () => {
  const roster = [
    buildAgentScopeConfig("web-developer", { scope: "project" }),
    buildAgentScopeConfig("api-developer", { scope: "global" }),
    buildAgentScopeConfig("cli-developer", {
      scope: "project",
      excluded: true,
    }),
    buildAgentScopeConfig("pm", { scope: "global", excluded: true }),
  ]

  it("at project scope are the project rows nothing excludes", () => {
    expect(activeProjectAgentNames(roster)).toStrictEqual(["web-developer"])
  })

  it("at any scope are every row nothing excludes", () => {
    expect(activeAgentNames(roster)).toStrictEqual([
      "web-developer",
      "api-developer",
    ])
  })

  it("map each active agent to its scope", () => {
    expect([...activeAgentScopeMap(roster)]).toStrictEqual([
      ["web-developer", "project"],
      ["api-developer", "global"],
    ])
  })

  it("map nothing for no roster", () => {
    expect([...activeAgentScopeMap(undefined)]).toStrictEqual([])
  })
})

describe("activeSkillScopeMap", () => {
  it("maps each active skill to its scope and leaves the excluded out", () => {
    const skills = [
      buildSkillConfig(REACT, { scope: "global" }),
      buildSkillConfig(ZUSTAND, { scope: "project", excluded: true }),
      buildSkillConfig(VITEST, { scope: "project" }),
    ]

    expect([...activeSkillScopeMap(skills)]).toStrictEqual([
      [REACT, "global"],
      [VITEST, "project"],
    ])
  })

  it("maps nothing for no skills", () => {
    expect([...activeSkillScopeMap(undefined)]).toStrictEqual([])
  })
})

describe("effectivelyExcludedSkillIds", () => {
  it("names an excluded skill with no active entry", () => {
    const skills = [
      buildSkillConfig(REACT, { scope: "global", excluded: true }),
      buildSkillConfig(VITEST, { scope: "project" }),
    ]

    expect([...effectivelyExcludedSkillIds(skills)]).toStrictEqual([REACT])
  })

  it("leaves out an excluded global entry that an active project entry rescues", () => {
    const skills = [
      buildSkillConfig(REACT, { scope: "global", excluded: true }),
      buildSkillConfig(REACT, { scope: "project" }),
    ]

    expect([...effectivelyExcludedSkillIds(skills)]).toStrictEqual([])
  })
})
