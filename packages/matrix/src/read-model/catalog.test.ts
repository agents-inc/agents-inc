import { describe, expect, it } from "vitest"

import { CATALOG } from "./catalog"
import { DOMAIN_LABELS } from "./domains"
import { STACKS, expandStack } from "./stacks"
import { SUB_AGENTS_BY_ID, SUB_AGENT_GROUPS } from "./sub-agents"

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
      const { agentsBySkill } = expandStack(stack.id)!
      for (const agents of Object.values(agentsBySkill)) {
        for (const agentId of agents) {
          expect(SUB_AGENTS_BY_ID[agentId], agentId).toBeDefined()
        }
      }
    }
  })

  // A preloaded id outside the expansion would be an assignment to nothing.
  it("preloads only skills the stack actually includes", () => {
    for (const stack of STACKS) {
      const { skillIds, preloadedSkillIds } = expandStack(stack.id)!
      const included = new Set<string>(skillIds)

      for (const skillId of preloadedSkillIds) {
        expect(included.has(skillId), `${stack.id}: ${skillId}`).toBe(true)
      }
    }
  })

  it("assigns agents only to skills it includes", () => {
    for (const stack of STACKS) {
      const { skillIds, agentsBySkill } = expandStack(stack.id)!
      const included = new Set<string>(skillIds)

      for (const skillId of Object.keys(agentsBySkill)) {
        expect(included.has(skillId), `${stack.id}: ${skillId}`).toBe(true)
      }
    }
  })

  it("lists each skill once", () => {
    for (const stack of STACKS) {
      const { skillIds } = expandStack(stack.id)!
      expect(new Set(skillIds).size).toBe(skillIds.length)
    }
  })
})
