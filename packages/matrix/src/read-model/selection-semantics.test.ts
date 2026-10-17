import { describe, expect, it } from "vitest"

import {
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "../contract/selection-scenarios"
import {
  createSelectionSemantics,
  judgeSelection,
  type SelectionCatalogFacts,
} from "./selection-semantics"

// Fabricated ids isolating each rule.
const FACTS: SelectionCatalogFacts = {
  skills: [
    // Conflict declared one way round; the symmetric read is the module's job.
    {
      id: "react",
      categoryId: "framework",
      conflictsWith: ["vue"],
      discourages: [],
      requires: [],
    },
    {
      id: "vue",
      categoryId: "framework",
      conflictsWith: [],
      discourages: [],
      requires: [],
    },
    {
      id: "nextjs",
      categoryId: "meta-framework",
      conflictsWith: ["nuxt"],
      discourages: [],
      requires: [{ skillIds: ["react"], needsAny: false }],
    },
    {
      id: "nuxt",
      categoryId: "meta-framework",
      conflictsWith: [],
      discourages: [],
      requires: [{ skillIds: ["vue"], needsAny: false }],
    },
    {
      id: "nextjs-starter",
      categoryId: "companions",
      conflictsWith: [],
      discourages: [],
      requires: [{ skillIds: ["nextjs"], needsAny: false }],
    },
    // Implied by neither host, stranded when both go.
    {
      id: "pinia",
      categoryId: "companions",
      conflictsWith: [],
      discourages: [],
      requires: [{ skillIds: ["vue", "nuxt"], needsAny: true }],
    },
    // Outside any pick-one category, so no swap forgives it.
    {
      id: "styled",
      categoryId: "companions",
      conflictsWith: ["react"],
      discourages: [],
      requires: [],
    },
    {
      id: "scss",
      categoryId: "companions",
      conflictsWith: [],
      discourages: [{ skillId: "vue", reason: "Prefer utility classes" }],
      requires: [],
    },
  ],
  exclusiveCategoryIds: new Set(["framework", "meta-framework"]),
}

const judge = createSelectionSemantics(FACTS)

describe("the requires-closure", () => {
  it("counts what a selection is built on as chosen", () => {
    expect(judge(["nextjs"]).implied).toStrictEqual(["react"])
  })

  it("carries the closure through more than one hop", () => {
    expect([...judge(["nextjs-starter"]).implied].sort()).toStrictEqual([
      "nextjs",
      "react",
    ])
  })

  it("implies nothing from a requirement offering a choice", () => {
    expect(judge(["pinia"]).implied).toStrictEqual([])
  })

  it("implies nothing from nothing", () => {
    const judgement = judge([])
    expect(judgement.implied).toStrictEqual([])
    expect(judgement.reached.size).toBe(0)
    expect(judgement.outOfReach.size).toBe(0)
  })
})

describe("the dependent fixpoint", () => {
  it("keeps stranding dependents until nothing more is stranded", () => {
    const { outOfReach } = judge(["react"])

    expect(outOfReach.has("vue")).toBe(true)
    expect(outOfReach.has("nuxt")).toBe(true)
    expect(outOfReach.has("pinia")).toBe(true)
  })

  it("never rules out what the selection reaches", () => {
    const { outOfReach } = judge(["nextjs"])
    expect(outOfReach.has("react")).toBe(false)
    expect(outOfReach.has("nextjs")).toBe(false)
  })
})

describe("the cell verdict", () => {
  it("reports a conflict with what the selection implies", () => {
    expect(judge(["nextjs"]).verdictOf("styled")).toStrictEqual({
      status: "incompatible",
      cause: { kind: "conflict", skillId: "react" },
    })
  })

  it("reads a conflict from whichever side declared it", () => {
    // React declares the conflict; Vue never mentions React back.
    expect(judge(["vue"]).verdictOf("styled").status).toBe("normal")
    expect(judge(["vue"]).incompatibilityOf("react")).toStrictEqual({
      kind: "conflict",
      skillId: "vue",
    })
  })

  it("names the requirement a stranded skill lost", () => {
    const verdict = judge(["react"]).verdictOf("pinia")

    expect(verdict).toStrictEqual({
      status: "incompatible",
      cause: {
        kind: "unreachableRequirement",
        requirement: { skillIds: ["vue", "nuxt"], needsAny: true },
        lostIds: ["vue", "nuxt"],
      },
    })
  })

  it("leaves a merely unselected requirement alone", () => {
    expect(judge([]).verdictOf("nextjs").status).toBe("normal")
  })

  it("asks nothing of an empty selection", () => {
    const judgement = judge([])
    const ruledOut = FACTS.skills
      .map((skill) => skill.id)
      .filter(
        (skillId) => judgement.verdictOf(skillId).status === "incompatible"
      )

    expect(ruledOut).toStrictEqual([])
  })

  it("throws for a skill the catalogue does not hold", () => {
    expect(() => judge([]).verdictOf("unknown-skill")).toThrow(
      "Skill not found: unknown-skill"
    )
  })
})

describe("the pick-one swap rule", () => {
  it("forgives a conflict with a selected sibling", () => {
    expect(judge(["react"]).verdictOf("vue").status).toBe("normal")
  })

  it("forgives a conflict with a merely implied sibling", () => {
    // React is implied, not clicked; the swap forgives all the same.
    expect(judge(["nextjs"]).verdictOf("vue").status).toBe("normal")
  })

  it("keeps an impossibility the swap would not resolve", () => {
    expect(judge(["react", "nextjs"]).verdictOf("nuxt")).toStrictEqual({
      status: "incompatible",
      cause: {
        kind: "unreachableRequirement",
        requirement: { skillIds: ["vue"], needsAny: false },
        lostIds: ["vue"],
      },
    })
  })

  it("leaves the resolver surface unswapped", () => {
    expect(judge(["react"]).incompatibilityOf("vue")).toStrictEqual({
      kind: "conflict",
      skillId: "react",
    })
  })
})

describe("soft warnings", () => {
  it("surfaces a discouraged pairing with its authored reason", () => {
    expect(judge(["scss"]).verdictOf("vue")).toStrictEqual({
      status: "discouraged",
      reason: "Prefer utility classes",
    })
  })

  it("reads the discouragement from whichever side declared it", () => {
    expect(judge(["vue"]).verdictOf("scss")).toStrictEqual({
      status: "discouraged",
      reason: "Prefer utility classes",
    })
    expect(judge(["vue"]).discourageReasonOf("scss")).toBe(
      "Prefer utility classes"
    )
  })

  it("yields to an incompatibility", () => {
    const facts: SelectionCatalogFacts = {
      skills: [
        {
          id: "react",
          categoryId: "framework",
          conflictsWith: ["vue"],
          discourages: [{ skillId: "vue", reason: "Pick a lane" }],
          requires: [],
        },
        {
          id: "vue",
          categoryId: "companions",
          conflictsWith: [],
          discourages: [],
          requires: [],
        },
      ],
      exclusiveCategoryIds: new Set(["framework"]),
    }

    expect(
      createSelectionSemantics(facts)(["react"]).verdictOf("vue")
    ).toStrictEqual({
      status: "incompatible",
      cause: { kind: "conflict", skillId: "react" },
    })
  })
})

describe("the shared semantics honour the selection contract", () => {
  const assertScenario = (scenario: SelectionScenario) => {
    const judgement = judgeSelection([...scenario.selection])

    expect([...judgement.implied].sort()).toStrictEqual(
      [...scenario.implied].sort()
    )

    for (const skillId of scenario.outOfReach) {
      expect(
        judgement.verdictOf(skillId).status,
        `${skillId} must be ruled out`
      ).toBe("incompatible")
    }

    for (const skillId of scenario.inReach) {
      expect(
        judgement.verdictOf(skillId).status,
        `${skillId} must stay offerable`
      ).not.toBe("incompatible")
    }

    for (const skillId of scenario.discouraged) {
      expect(
        judgement.verdictOf(skillId).status,
        `${skillId} must not be disabled`
      ).not.toBe("incompatible")
    }
  }

  for (const scenario of SELECTION_SCENARIOS) {
    it(scenario.title, () => {
      assertScenario(scenario)
    })
  }
})
