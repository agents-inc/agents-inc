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

// A hand-sized catalogue that isolates each rule the shipped one can only
// exercise in combination. The ids are fabricated on purpose: the factory is
// parameterized over its catalogue, and these tests are about the rules, not
// the data.
const FACTS: SelectionCatalogFacts = {
  skills: [
    // Two frameworks in a pick-one category, conflicting one way round — the
    // symmetric read is the module's job.
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
    // Meta-frameworks, each built on its framework, conflicting as siblings.
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
    // A third hop for the closure to follow.
    {
      id: "nextjs-starter",
      categoryId: "companions",
      conflictsWith: [],
      discourages: [],
      requires: [{ skillIds: ["nextjs"], needsAny: false }],
    },
    // A choice between hosts: implied by neither, stranded when both go.
    {
      id: "pinia",
      categoryId: "companions",
      conflictsWith: [],
      discourages: [],
      requires: [{ skillIds: ["vue", "nuxt"], needsAny: true }],
    },
    // A conflict outside any pick-one category — no swap can forgive it.
    {
      id: "styled",
      categoryId: "companions",
      conflictsWith: ["react"],
      discourages: [],
      requires: [],
    },
    // A soft warning, declared one way round.
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

    // Vue conflicts, Nuxt is built on Vue, Pinia accepts only those two.
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
    // styled conflicts with React, React arrives through Next.js, and no swap
    // inside `companions` can remove it.
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
    // Next.js needs React, and nothing rules React out — the cell stays
    // offerable; nudging the user to pick the base is another surface's job.
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
    // React is implied by Next.js, not clicked — the swap forgives all the
    // same, because the category is pick-one either way.
    expect(judge(["nextjs"]).verdictOf("vue").status).toBe("normal")
  })

  it("keeps an impossibility the swap would not resolve", () => {
    // Nuxt conflicts with nothing selected in its own category once the swap
    // drops Next.js — but it still needs the Vue that React rules out.
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
    // `incompatibilityOf` answers for the selection as it stands — the swap
    // belongs to the cell, and the CLI's resolver layer is pinned to this.
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
    // styled conflicts with React; were it also discouraged, the hard verdict
    // must win. Pin the priority through a skill carrying both.
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

// The shared module is what both runners now delegate to, so it answers the
// contract directly as well: a scenario failing here names the semantics,
// where the same failure in a runner names a view layer.
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

    // A soft warning warns; it never takes the choice away.
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
