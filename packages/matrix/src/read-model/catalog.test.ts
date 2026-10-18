import { describe, expect, it } from "vitest"

import type {
  Matrix,
  MatrixCategory,
  MatrixSkill,
  MatrixStack,
} from "../matrix-schema"
import { resolveAssignment } from "./assignment-defaults"
import { CATALOG, buildCatalog, skillById } from "./catalog"
import { DOMAIN_LABELS } from "./domains"
import { MATRIX } from "./source"
import { STACKS, buildStacks, createStackExpander, expandStack } from "./stacks"
import { SUB_AGENTS_BY_ID, SUB_AGENT_GROUPS, subAgentById } from "./sub-agents"

const ADDED_SKILL_ID = "github:software-mansion/react-native-reanimated"

const SKILL_LESS_STACK = "nextjs-fullstack"
const FULLY_STAFFED_STACK = "cli-ink-oclif"
const SKILL_LESS_AGENT = "cli-tester"

const matrixStack = (stackId: string) =>
  MATRIX.suggestedStacks.find((stack) => stack.id === stackId)!

const declaredRoster = (stackId: string) =>
  Object.keys(matrixStack(stackId).skills)
    .filter((agentId) => subAgentById(agentId) !== undefined)
    .sort()

describe("CATALOG", () => {
  it("parsed something", () => {
    expect(CATALOG.domains.length).toBeGreaterThan(0)
    expect(CATALOG.skillCount).toBeGreaterThan(0)
  })

  it("indexes every skill it renders", () => {
    const rendered = CATALOG.domains.flatMap((domain) =>
      domain.categories.flatMap((category) => category.skills)
    )

    expect(rendered).toHaveLength(CATALOG.skillCount)
    for (const skill of rendered) {
      expect(CATALOG.skillsById[skill.id]).toBe(skill)
    }
  })

  it("gives every category a domain that exists", () => {
    for (const category of Object.values(CATALOG.categoriesById)) {
      expect(DOMAIN_LABELS[category.domainId]).toBeTypeOf("string")
    }
  })

  it("renders no empty categories", () => {
    for (const domain of CATALOG.domains) {
      for (const category of domain.categories) {
        expect(category.skills.length).toBeGreaterThan(0)
      }
    }
  })

  it("keeps each skill's categoryId pointing at the category holding it", () => {
    for (const category of Object.values(CATALOG.categoriesById)) {
      for (const skill of category.skills) {
        expect(skill.categoryId).toBe(category.id)
        expect(skill.domainId).toBe(category.domainId)
      }
    }
  })

  it("reports a domain's skill count as the sum of its categories", () => {
    for (const domain of CATALOG.domains) {
      const summed = domain.categories.reduce(
        (total, category) => total + category.skills.length,
        0
      )
      expect(domain.skillCount).toBe(summed)
    }
  })
})

describe("skillById", () => {
  it("answers with the entry for an id the catalogue ships", () => {
    const [first] = CATALOG.domains[0]?.categories[0]?.skills ?? []

    expect(first).toBeDefined()
    expect(skillById(first!.id)).toBe(first)
  })

  it("answers undefined for an id the catalogue never had", () => {
    expect(skillById(ADDED_SKILL_ID)).toBeUndefined()
  })
})

describe("subAgentById", () => {
  it("answers with the entry for an agent the roster carries", () => {
    const [first] = SUB_AGENT_GROUPS[0]?.agents ?? []

    expect(first).toBeDefined()
    expect(subAgentById(first!.id)).toBe(first)
  })

  it("answers undefined for an agent the roster never had", () => {
    expect(subAgentById("web-engineer")).toBeUndefined()
  })
})

describe("SUB_AGENT_GROUPS", () => {
  it("indexes every agent it groups", () => {
    const grouped = SUB_AGENT_GROUPS.flatMap((group) => group.agents)

    expect(grouped.length).toBeGreaterThan(0)
    expect(Object.keys(SUB_AGENTS_BY_ID)).toHaveLength(grouped.length)
    for (const agent of grouped) {
      expect(SUB_AGENTS_BY_ID[agent.id]).toBe(agent)
    }
  })

  it("puts each agent in the group matching its domain", () => {
    for (const group of SUB_AGENT_GROUPS) {
      for (const agent of group.agents) {
        expect(agent.domainId).toBe(group.domainId)
      }
    }
  })

  it("gives every agent a non-empty label", () => {
    for (const agent of Object.values(SUB_AGENTS_BY_ID)) {
      expect(agent.label.length).toBeGreaterThan(0)
    }
  })
})

describe("expandStack", () => {
  it("expands every stack the rail offers", () => {
    for (const stack of STACKS) {
      expect(expandStack(stack.id), stack.id).toBeDefined()
    }
  })

  it("returns nothing for a stack that does not exist", () => {
    expect(expandStack("no-such-stack")).toBeUndefined()
  })

  it("only ever names skills the catalog knows", () => {
    for (const stack of STACKS) {
      for (const skillId of expandStack(stack.id)!.skillIds) {
        expect(CATALOG.skillsById[skillId], skillId).toBeDefined()
      }
    }
  })

  it("only ever names sub-agents that exist", () => {
    for (const stack of STACKS) {
      const { assignmentsBySkill } = expandStack(stack.id)!
      for (const targets of Object.values(assignmentsBySkill)) {
        for (const { agentId } of targets) {
          expect(SUB_AGENTS_BY_ID[agentId], agentId).toBeDefined()
        }
      }
    }
  })

  it("assigns agents only to skills it includes", () => {
    for (const stack of STACKS) {
      const { skillIds, assignmentsBySkill } = expandStack(stack.id)!
      const included = new Set<string>(skillIds)

      for (const skillId of Object.keys(assignmentsBySkill)) {
        expect(included.has(skillId), `${stack.id}: ${skillId}`).toBe(true)
      }
    }
  })

  it("loads every pair the way the shared resolver does", () => {
    for (const stack of STACKS) {
      const { assignmentsBySkill } = expandStack(stack.id)!

      for (const [skillId, targets] of Object.entries(assignmentsBySkill)) {
        const resolved = new Map(
          resolveAssignment(skillId).map(({ agentId, load }) => [agentId, load])
        )

        for (const { agentId, load } of targets) {
          expect(load, `${stack.id}: ${skillId} → ${agentId}`).toBe(
            resolved.get(agentId) ?? "lazy"
          )
        }
      }
    }
  })

  it("keeps one skill's two sub-agents on different load states", () => {
    const { assignmentsBySkill } = expandStack("nextjs-fullstack")!
    const targets = assignmentsBySkill["web-framework-react"] ?? []
    const loadOn = (agentId: string) =>
      targets.find((target) => target.agentId === agentId)?.load

    expect(loadOn("web-developer")).toBe("preloaded")
    expect(loadOn("codex-keeper")).toBe("lazy")
  })

  it("lists each skill once", () => {
    for (const stack of STACKS) {
      const { skillIds } = expandStack(stack.id)!
      expect(new Set(skillIds).size).toBe(skillIds.length)
    }
  })

  it("names every sub-agent the stack declares, skill-less ones included", () => {
    for (const stack of STACKS) {
      const { assignmentsBySkill, skillLessAgentIds } = expandStack(stack.id)!
      const named = new Set<string>([
        ...Object.values(assignmentsBySkill)
          .flat()
          .map(({ agentId }) => agentId),
        ...skillLessAgentIds,
      ])

      expect([...named].sort(), stack.id).toStrictEqual(
        declaredRoster(stack.id)
      )
    }
  })

  it("names a sub-agent the stack declares with no skills", () => {
    expect(
      matrixStack(SKILL_LESS_STACK).skills[SKILL_LESS_AGENT]
    ).toStrictEqual({})

    expect(expandStack(SKILL_LESS_STACK)!.skillLessAgentIds).toStrictEqual([
      SKILL_LESS_AGENT,
    ])
  })

  it("names no sub-agent skill-less when every one carries a skill", () => {
    const declared = matrixStack(FULLY_STAFFED_STACK).skills[SKILL_LESS_AGENT]
    expect(Object.values(declared ?? {}).flat()).not.toStrictEqual([])

    expect(expandStack(FULLY_STAFFED_STACK)!.skillLessAgentIds).toStrictEqual(
      []
    )
  })

  it("staffs nobody with a skill-less sub-agent this build has never heard of", () => {
    const stack = matrixStack(SKILL_LESS_STACK)
    const expand = createStackExpander({
      ...MATRIX,
      suggestedStacks: [
        { ...stack, skills: { ...stack.skills, "retired-agent": {} } },
      ],
    })

    expect(expand(SKILL_LESS_STACK)!.skillLessAgentIds).toStrictEqual([
      SKILL_LESS_AGENT,
    ])
  })
})

const matrixCategory = (
  id: string,
  over: Partial<Omit<MatrixCategory, "id">> = {}
): MatrixCategory => ({
  id,
  displayName: id,
  description: "",
  exclusive: false,
  order: 1,
  ...over,
})

const matrixSkill = (
  id: string,
  category: string,
  over: Partial<Omit<MatrixSkill, "id" | "category">> = {}
): MatrixSkill => ({
  id,
  slug: id,
  displayName: id,
  description: "",
  category,
  conflictsWith: [],
  discourages: [],
  requires: [],
  ...over,
})

const matrixOf = (
  categories: readonly MatrixCategory[],
  skills: readonly MatrixSkill[]
): Matrix => ({
  version: "0.0.0-test",
  categories: Object.fromEntries(
    categories.map((category) => [category.id, category])
  ),
  skills: Object.fromEntries(skills.map((skill) => [skill.id, skill])),
  suggestedStacks: [],
})

// Authored out of order, so every sort has something to do.
const UNSORTED_MATRIX = matrixOf(
  [
    matrixCategory("api-core", { domain: "api", order: 1 }),
    matrixCategory("web-styling", { domain: "web", order: 3 }),
    matrixCategory("web-state", { domain: "web", order: 2 }),
    matrixCategory("web-framework", { domain: "web", order: 1 }),
    matrixCategory("unplaced"),
    matrixCategory("off-map", { domain: "mars" }),
  ],
  [
    matrixSkill("zustand", "web-state", { displayName: "Zustand" }),
    matrixSkill("jotai", "web-state", { displayName: "Jotai" }),
    matrixSkill("tailwind", "web-styling"),
    matrixSkill("react", "web-framework"),
    matrixSkill("hono", "api-core"),
    matrixSkill("stray", "unplaced"),
    matrixSkill("martian", "off-map"),
  ]
)

describe("buildCatalog", () => {
  it("orders the domains, then each domain's categories by their authored order", () => {
    expect(
      buildCatalog(UNSORTED_MATRIX).domains.map((domain) => [
        domain.id,
        domain.categories.map((category) => category.id),
      ])
    ).toStrictEqual([
      ["web", ["web-framework", "web-state", "web-styling"]],
      ["api", ["api-core"]],
    ])
  })

  it("drops a category with no domain, or one the UI has no section for", () => {
    const catalog = buildCatalog(UNSORTED_MATRIX)

    expect(Object.keys(catalog.categoriesById).sort()).toStrictEqual([
      "api-core",
      "web-framework",
      "web-state",
      "web-styling",
    ])
    expect(Object.keys(catalog.skillsById).sort()).toStrictEqual([
      "hono",
      "jotai",
      "react",
      "tailwind",
      "zustand",
    ])
  })

  it("orders a category's skills by display name", () => {
    const webState = buildCatalog(UNSORTED_MATRIX).categoriesById["web-state"]
    if (!webState) throw new Error("Category not found: web-state")

    expect(webState.skills.map((skill) => skill.displayName)).toStrictEqual([
      "Jotai",
      "Zustand",
    ])
  })
})

const stackWith = (over: Partial<MatrixStack>): MatrixStack => ({
  ...matrixStack(SKILL_LESS_STACK),
  ...over,
})

const matrixWithStack = (stack: MatrixStack): Matrix => ({
  ...MATRIX,
  suggestedStacks: [stack],
})

describe("buildStacks", () => {
  it("carries a stack's group onto the entry the rail shows", () => {
    const grouped = stackWith({ group: "Starters" })

    expect(buildStacks(matrixWithStack(grouped))).toStrictEqual([
      {
        id: grouped.id,
        name: grouped.name,
        description: grouped.description,
        philosophy: grouped.philosophy,
        group: "Starters",
        skillCount: grouped.allSkillIds.length,
      },
    ])
  })

  it("leaves the group off a stack that names none", () => {
    for (const stack of STACKS) {
      expect(stack, stack.id).not.toHaveProperty("group")
    }
  })
})

describe("createStackExpander", () => {
  it("assigns a sub-agent once to a skill it lists under two categories", () => {
    const twice = stackWith({
      skills: {
        "web-developer": {
          "web-framework": ["web-framework-react"],
          "web-meta-framework": ["web-framework-react"],
        },
      },
    })
    const expansion = createStackExpander(matrixWithStack(twice))(twice.id)
    if (!expansion) throw new Error(`Stack not found: ${twice.id}`)

    const targets = expansion.assignmentsBySkill["web-framework-react"]
    if (!targets) throw new Error("Assignments not found: web-framework-react")

    expect(targets.map((target) => target.agentId)).toStrictEqual([
      "web-developer",
    ])
  })
})
