import { resolveAssignment, type StackExpansion } from "@workspace/matrix"

import { activeSkillById } from "@/stores/catalog-store"

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

// Skill-less agents are pinned on: no assignment names them.
export const stackAgentPins = ({
  skillLessAgentIds,
}: StackExpansion): Record<string, AgentEntry> =>
  Object.fromEntries(
    skillLessAgentIds.map((agentId) => [agentId, { on: true }])
  )
