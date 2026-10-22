import { seedToInstallSelection } from "@workspace/compile/seed-to-config"
import { MATRIX, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { afterEach, describe, expect, it } from "vitest"

import { activeMatrix } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { isAgentOn, type PersistedConfig } from "@/stores/persisted-schema"

import {
  isStackCustom,
  selectInstallInventory,
  selectInstalledAgents,
} from "./derive"
import { toSeedPayload } from "./seed"

const SKILL_LESS_STACK = "nextjs-fullstack"
const FULLY_STAFFED_STACK = "cli-ink-oclif"
const SKILL_LESS_AGENT = "cli-tester"
// Reaches the api sub-agents, which the fully staffed stack does not declare.
const OUTSIDE_SKILL = "api-framework-hono"

const declaredSkills = (stackId: string) =>
  MATRIX.suggestedStacks.find((stack) => stack.id === stackId)!.skills

const declaredRoster = (stackId: string) =>
  Object.keys(declaredSkills(stackId)).sort()

const appliedStack = (stackId: string) => {
  useConfigStore.getState().applyStack(stackId)
  return useConfigStore.getState()
}

const onAgentIds = (config: PersistedConfig) =>
  Object.keys(SUB_AGENTS_BY_ID)
    .filter((agentId) => isAgentOn(config, agentId))
    .sort()

afterEach(() => {
  useConfigStore.getState().reset()
})

describe("applying a stack that declares a sub-agent with no skills", () => {
  it("switches on every sub-agent the stack declares", () => {
    expect(declaredSkills(SKILL_LESS_STACK)[SKILL_LESS_AGENT]).toStrictEqual({})

    expect(onAgentIds(appliedStack(SKILL_LESS_STACK))).toStrictEqual(
      declaredRoster(SKILL_LESS_STACK)
    )
  })

  it("installs the whole declared roster, the skill-less one as a base agent", () => {
    const config = appliedStack(SKILL_LESS_STACK)

    expect(
      selectInstalledAgents(config, "claude")
        .map((agent) => agent.id)
        .sort()
    ).toStrictEqual(declaredRoster(SKILL_LESS_STACK))
    expect(
      selectInstallInventory(config, "claude")
        .agents.filter((row) => row.baseOnly)
        .map((row) => row.agent.id)
    ).toStrictEqual([SKILL_LESS_AGENT])
  })

  it("sends the skill-less sub-agent switched on, and init --from's decode selects it", () => {
    const payload = toSeedPayload(appliedStack(SKILL_LESS_STACK))

    expect(payload.agents[SKILL_LESS_AGENT]).toStrictEqual({ on: true })

    const { result } = seedToInstallSelection(payload, activeMatrix())
    expect([...result.selectedAgents].sort()).toStrictEqual(
      declaredRoster(SKILL_LESS_STACK)
    )
  })

  it("reads as the stack itself rather than a custom one", () => {
    expect(isStackCustom(appliedStack(SKILL_LESS_STACK))).toBe(false)
  })

  it("reads as custom once the skill-less sub-agent is switched off", () => {
    appliedStack(SKILL_LESS_STACK)
    useConfigStore.getState().toggleAgentPin(SKILL_LESS_AGENT)

    expect(isStackCustom(useConfigStore.getState())).toBe(true)
  })
})

describe("applying a stack whose every sub-agent carries a skill", () => {
  it("pins every sub-agent it declares on, and switches on that roster", () => {
    const config = appliedStack(FULLY_STAFFED_STACK)

    expect(config.agents).toStrictEqual(
      Object.fromEntries(
        declaredRoster(FULLY_STAFFED_STACK).map((agentId) => [
          agentId,
          { on: true },
        ])
      )
    )
    expect(onAgentIds(config)).toStrictEqual(
      declaredRoster(FULLY_STAFFED_STACK)
    )
  })
})

describe("removing the last skill of a sub-agent the stack declares", () => {
  const STAFFED_AGENT = "cli-tester"

  const carriedBy = (agentId: string) =>
    Object.entries(useConfigStore.getState().skills)
      .filter(([, entry]) => entry.assignments[agentId]?.enabled)
      .map(([skillId]) => skillId)

  const strippedOfItsSkills = () => {
    appliedStack(FULLY_STAFFED_STACK)
    const skillIds = carriedBy(STAFFED_AGENT)
    expect(skillIds).not.toStrictEqual([])

    for (const skillId of skillIds)
      useConfigStore.getState().toggleAssignmentEnabled(skillId, STAFFED_AGENT)

    return useConfigStore.getState()
  }

  it("keeps it on, installed as a base agent", () => {
    const config = strippedOfItsSkills()

    expect(isAgentOn(config, STAFFED_AGENT)).toBe(true)
    expect(
      selectInstallInventory(config, "claude")
        .agents.filter((row) => row.baseOnly)
        .map((row) => row.agent.id)
    ).toStrictEqual([STAFFED_AGENT])
  })

  it("keeps it on when the skills themselves are deselected", () => {
    appliedStack(FULLY_STAFFED_STACK)

    for (const skillId of carriedBy(STAFFED_AGENT))
      useConfigStore.getState().toggleSkill(skillId)

    expect(carriedBy(STAFFED_AGENT)).toStrictEqual([])
    expect(isAgentOn(useConfigStore.getState(), STAFFED_AGENT)).toBe(true)
  })

  it("switches it off once it is clicked off", () => {
    strippedOfItsSkills()

    useConfigStore.getState().toggleAgentPin(STAFFED_AGENT)

    expect(isAgentOn(useConfigStore.getState(), STAFFED_AGENT)).toBe(false)
  })

  it("lets a sub-agent the stack does not declare go off with its last skill", () => {
    const OUTSIDE_AGENT = "api-developer"
    expect(declaredRoster(FULLY_STAFFED_STACK)).not.toContain(OUTSIDE_AGENT)
    appliedStack(FULLY_STAFFED_STACK)
    useConfigStore.getState().toggleSkill(OUTSIDE_SKILL)
    expect(isAgentOn(useConfigStore.getState(), OUTSIDE_AGENT)).toBe(true)

    useConfigStore.getState().toggleSkill(OUTSIDE_SKILL)

    expect(isAgentOn(useConfigStore.getState(), OUTSIDE_AGENT)).toBe(false)
  })
})
