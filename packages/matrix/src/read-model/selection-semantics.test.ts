import { describe, expect, it } from "vitest"

import {
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "../contract/selection-scenarios"
import {
  catalogFactsOf,
  createSelectionSemantics,
  judgeSelection,
  type SelectionCatalogFacts,
  type SelectionSkillFacts,
} from "./selection-semantics"
import { MATRIX } from "./source"

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

// A skill with no relations; each test names only the ones it isolates.
const skillFact = (
  id: string,
  over: Partial<Omit<SelectionSkillFacts, "id">> = {}
): SelectionSkillFacts => ({
  id,
  categoryId: "companions",
  conflictsWith: [],
  discourages: [],
  requires: [],
  ...over,
})

const judgeAmong = (
  skills: readonly SelectionSkillFacts[],
  exclusiveCategoryIds: readonly string[] = []
) =>
  createSelectionSemantics({
    skills,
    exclusiveCategoryIds: new Set(exclusiveCategoryIds),
  })

describe("the requires-closure, by kind of requirement", () => {
  it("implies every member of a requirement that needs them all", () => {
    const judgeAllOf = judgeAmong([
      skillFact("app", {
        requires: [{ skillIds: ["router", "store"], needsAny: false }],
      }),
      skillFact("router"),
      skillFact("store"),
    ])

    expect([...judgeAllOf(["app"]).implied].sort()).toStrictEqual([
      "router",
      "store",
    ])
  })

  it("implies the one skill a needs-any requirement offers no alternative to", () => {
    const judgeSoleOption = judgeAmong([
      skillFact("app", {
        requires: [{ skillIds: ["router"], needsAny: true }],
      }),
      skillFact("router"),
    ])

    expect(judgeSoleOption(["app"]).implied).toStrictEqual(["router"])
  })

  it("settles a requirement cycle", () => {
    const judgeCycle = judgeAmong([
      skillFact("client", {
        requires: [{ skillIds: ["server"], needsAny: false }],
      }),
      skillFact("server", {
        requires: [{ skillIds: ["client"], needsAny: false }],
      }),
    ])

    expect(judgeCycle(["client"]).implied).toStrictEqual(["server"])
  })
})

describe("the dependent fixpoint, in any catalogue order", () => {
  it("strands a dependent the catalogue lists before what it depends on", () => {
    const judgeOutOfOrder = judgeAmong([
      skillFact("starter", {
        requires: [{ skillIds: ["meta-framework"], needsAny: false }],
      }),
      skillFact("meta-framework", {
        requires: [{ skillIds: ["vue"], needsAny: false }],
      }),
      skillFact("vue"),
      skillFact("react", { conflictsWith: ["vue"] }),
    ])

    expect([...judgeOutOfOrder(["react"]).outOfReach].sort()).toStrictEqual([
      "meta-framework",
      "starter",
      "vue",
    ])
  })
})

describe("a skill's relations to itself", () => {
  it("never rules a selected skill out for conflicting with itself", () => {
    const judgeSelfConflict = judgeAmong([
      skillFact("solo", { conflictsWith: ["solo"] }),
    ])

    expect(judgeSelfConflict(["solo"]).verdictOf("solo")).toStrictEqual({
      status: "normal",
    })
  })

  it("never warns a selected skill off itself", () => {
    const judgeSelfWarning = judgeAmong([
      skillFact("solo", {
        discourages: [{ skillId: "solo", reason: "Pick another" }],
      }),
    ])

    expect(judgeSelfWarning(["solo"]).verdictOf("solo")).toStrictEqual({
      status: "normal",
    })
  })
})

describe("soft warnings name their pairing", () => {
  it("warns no skill the reached skill's warning does not name", () => {
    expect(judge(["scss"]).verdictOf("react")).toStrictEqual({
      status: "normal",
    })
  })

  it("warns a skill only once the partner its warning names is reached", () => {
    expect(judge(["react"]).verdictOf("scss")).toStrictEqual({
      status: "normal",
    })
  })
})

describe("the pick-one swap rule, outside an impossibility", () => {
  it("keeps a conflict between two skills of a category that is not pick-one", () => {
    const judgeCompanions = judgeAmong([
      skillFact("styled", { conflictsWith: ["emotion"] }),
      skillFact("emotion"),
    ])

    expect(judgeCompanions(["styled"]).verdictOf("emotion")).toStrictEqual({
      status: "incompatible",
      cause: { kind: "conflict", skillId: "styled" },
    })
  })

  it("keeps a pick-one sibling's warning, since the swap re-judges only an impossibility", () => {
    const judgeRenderers = judgeAmong(
      [
        skillFact("react", {
          categoryId: "framework",
          discourages: [{ skillId: "solid", reason: "One renderer at a time" }],
        }),
        skillFact("solid", { categoryId: "framework" }),
      ],
      ["framework"]
    )

    expect(judgeRenderers(["react"]).verdictOf("solid")).toStrictEqual({
      status: "discouraged",
      reason: "One renderer at a time",
    })
  })
})

describe("catalogFactsOf", () => {
  it("makes pick-one only the categories the catalogue marks exclusive", () => {
    const { exclusiveCategoryIds } = catalogFactsOf(MATRIX)

    expect(exclusiveCategoryIds.has("web-framework")).toBe(true)
    expect(exclusiveCategoryIds.has("web-styling")).toBe(false)
  })
})
