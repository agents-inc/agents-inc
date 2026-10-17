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
  it("pins nothing, and still switches on the whole declared roster", () => {
    const config = appliedStack(FULLY_STAFFED_STACK)

    expect(config.agents).toStrictEqual({})
    expect(onAgentIds(config)).toStrictEqual(
      declaredRoster(FULLY_STAFFED_STACK)
    )
  })
})
