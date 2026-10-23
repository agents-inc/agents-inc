import { resolveAssignment, type StackExpansion } from "@workspace/matrix"

import { activeSkillById, expandActiveStack } from "@/stores/catalog-store"

import type { AgentEntry, Assignment } from "@/stores/persisted-schema"

// Passed as a taxonomy, not a bare id: the resolver looks bare ids up in the
// vendored catalogue, where a marketplace's ids would reach nobody.
const taxonomyOf = (skillId: string) => {
  const skill = activeSkillById(skillId)
  if (!skill) return undefined

  return {
    id: skill.id,
    domainId: skill.domainId,
    categoryId: skill.categoryId,
  }
}

export const defaultAssignmentsFor = (
  skillId: string
): Record<string, Assignment> => {
  const taxonomy = taxonomyOf(skillId)
  if (!taxonomy) return {}

  return Object.fromEntries(
    resolveAssignment(taxonomy).map(({ agentId, load }) => [
      agentId,
      { load, enabled: true },
    ])
  )
}

const declaredAgentIds = ({
  assignmentsBySkill,
  skillLessAgentIds,
}: StackExpansion) => {
  const assignedAgentIds = Object.values(assignmentsBySkill)
    .flat()
    .map(({ agentId }) => agentId)

  return [...new Set([...assignedAgentIds, ...skillLessAgentIds])]
}

// Every sub-agent the stack declares is pinned on, so one stays on, as a base
// agent, once its last skill is removed.
export const stackAgentPins = (
  expansion: StackExpansion
): Record<string, AgentEntry> =>
  Object.fromEntries(
    declaredAgentIds(expansion).map((agentId) => [agentId, { on: true }])
  )

/** The sub-agents the stack declares. */
export const stackAgentIds = (stackId: string | null): string[] => {
  if (stackId === null) return []

  const expansion = expandActiveStack(stackId)
  return expansion === undefined ? [] : declaredAgentIds(expansion)
}
