import type { AgentName } from "../vendor/generated/source-types"
import type { Matrix, MatrixStack } from "../matrix-schema"
import { resolveAssignment, type AssignmentTarget } from "./assignment-defaults"
import type { LoadState } from "./preload-defaults"
import { MATRIX } from "./source"
import { subAgentById } from "./sub-agents"

export type CatalogStack = {
  id: string
  name: string
  description: string
  philosophy: string
  group?: string
  skillCount: number
}

export type StackExpansion = {
  skillIds: string[]
  assignmentsBySkill: Record<string, AssignmentTarget[]>
  // No assignment names these, so applying the stack must switch them on.
  skillLessAgentIds: AgentName[]
}

const toCatalogStack = (stack: MatrixStack): CatalogStack => ({
  id: stack.id,
  name: stack.name,
  description: stack.description,
  philosophy: stack.philosophy,
  ...(stack.group !== undefined && { group: stack.group }),
  skillCount: stack.allSkillIds.length,
})

export const buildStacks = (matrix: Matrix): CatalogStack[] =>
  matrix.suggestedStacks.map(toCatalogStack)

/** The vendored public catalogue's stacks. */
export const STACKS: CatalogStack[] = buildStacks(MATRIX)

// Marketplaces ship no sub-agents, so unknown agent ids are dropped.
const rosteredAgents = (stack: MatrixStack) =>
  Object.keys(stack.skills)
    .map((agentId) => subAgentById(agentId))
    .filter((agent) => agent !== undefined)
    .map((agent) => agent.id)

const skillsOf = (stack: MatrixStack, agentId: AgentName) =>
  Object.values(stack.skills[agentId] ?? {}).flat()

const toSkillLessAgentIds = (stack: MatrixStack): AgentName[] =>
  rosteredAgents(stack).filter(
    (agentId) => skillsOf(stack, agentId).length === 0
  )

const toAgentsBySkill = (stack: MatrixStack): Record<string, AgentName[]> => {
  const agentsBySkill: Record<string, AgentName[]> = {}
  for (const agentId of rosteredAgents(stack)) {
    for (const skillId of skillsOf(stack, agentId)) {
      const agents = (agentsBySkill[skillId] ??= [])
      if (!agents.includes(agentId)) agents.push(agentId)
    }
  }
  return agentsBySkill
}

// The stack picks the agents; the shared resolver picks each one's load.
const toLoadByAgent = (skillId: string): Map<string, LoadState> =>
  new Map(
    resolveAssignment(skillId).map(({ agentId, load }) => [agentId, load])
  )

const toAssignmentsBySkill = (
  stack: MatrixStack
): Record<string, AssignmentTarget[]> =>
  Object.fromEntries(
    Object.entries(toAgentsBySkill(stack)).map(([skillId, agentIds]) => {
      const loadByAgent = toLoadByAgent(skillId)

      return [
        skillId,
        agentIds.map((agentId) => ({
          agentId,
          load: loadByAgent.get(agentId) ?? "lazy",
        })),
      ]
    })
  )

/** Expand a stack against the catalogue it came from. */
export const createStackExpander =
  (matrix: Matrix) =>
  (stackId: string): StackExpansion | undefined => {
    const stack = matrix.suggestedStacks.find(
      (candidate) => candidate.id === stackId
    )
    if (!stack) return undefined

    return {
      skillIds: stack.allSkillIds,
      assignmentsBySkill: toAssignmentsBySkill(stack),
      skillLessAgentIds: toSkillLessAgentIds(stack),
    }
  }

export const expandStack = createStackExpander(MATRIX)
