import { describe, expect, it } from "vitest"

import { resolveAssignment } from "./assignment-defaults"
import { CATALOG, skillById } from "./catalog"
import { DOMAIN_LABELS } from "./domains"
import { STACKS, expandStack } from "./stacks"
import { SUB_AGENTS_BY_ID, SUB_AGENT_GROUPS, subAgentById } from "./sub-agents"

// The id the editor mints for a skill added from GitHub during a session. The
// catalogue never had it and never will, which is exactly why asking is legal.
const ADDED_SKILL_ID = "github:software-mansion/react-native-reanimated"

// The catalogue is regenerated from the agents-inc CLI, so these are
// invariants about the *shape* the read model guarantees rather than about
// particular skills. They are what stands between a bad regeneration and a
// screen that renders empty categories or unreachable skills.

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

  // An empty category renders a header with nothing under it.
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

// The catalogue is keyed by the ids it ships, but the question reaching it is
// not always one of them: the editor mints its own for skills added in-session,
// and a saved configuration can name one a later catalogue dropped. Both are
// answered rather than rejected, which is what keeps the guards at the call
// sites doing real work.
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

  // The prefix convention is what places an agent; a blank label means it failed.
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

  // A stack says which sub-agents carry a skill; how each of them loads it is
  // the shared resolver's answer, so the expansion must never differ from what
  // the same pick made by hand would produce.
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

  // The flattening this replaced answered per skill, so a framework preloaded
  // on its own domain's developer claimed to preload on every summoner that
  // also carries it.
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
})
