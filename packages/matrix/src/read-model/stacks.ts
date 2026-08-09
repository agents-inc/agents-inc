import type { AgentName, SkillId } from "../vendor/generated/source-types"
import type { ParsedStack } from "../schema"
import { resolveAssignment, type AssignmentTarget } from "./assignment-defaults"
import { typedEntries } from "./collections"
import type { LoadState } from "./preload-defaults"
import { MATRIX } from "./source"

export type CatalogStack = {
  id: string
  name: string
  description: string
  philosophy: string
  // Never set by the CLI today. The stack rail renders flat until it is.
  group?: string
  skillCount: number
}

// What applying a stack means, in terms the config store can consume directly.
// Deliberately not the store's own shape — this package knows nothing about the app.
export type StackExpansion = {
  skillIds: SkillId[]
  // Which sub-agents each skill is assigned to, and how each of them loads it.
  assignmentsBySkill: Record<string, AssignmentTarget[]>
}

const parsedStacks = MATRIX.suggestedStacks

export const STACKS: CatalogStack[] = parsedStacks.map((stack) => ({
  id: stack.id,
  name: stack.name,
  description: stack.description,
  philosophy: stack.philosophy,
  ...(stack.group !== undefined && { group: stack.group }),
  skillCount: stack.allSkillIds.length,
}))

// Inverts the stack's agent → category → skills nesting into skill → agents.
const toAgentsBySkill = (stack: ParsedStack): Record<string, AgentName[]> => {
  const agentsBySkill: Record<string, AgentName[]> = {}
  for (const [agentId, categories] of typedEntries(stack.skills)) {
    for (const skillId of Object.values(categories).flat()) {
      const agents = (agentsBySkill[skillId] ??= [])
      if (!agents.includes(agentId)) agents.push(agentId)
    }
  }
  return agentsBySkill
}

// The stack names which sub-agents carry a skill; the shared resolver answers
// how each of them loads it — the same table the CLI writes into config.ts and
// the same one a hand-picked skill resolves against. Per pair, so a framework
// preloads on its own domain's agents and arrives lazily on the summoners that
// also carry it. A pair the resolver does not target has no eagerness to claim.
const toLoadByAgent = (skillId: string): Map<string, LoadState> =>
  new Map(
    resolveAssignment(skillId).map(({ agentId, load }) => [agentId, load])
  )

const toAssignmentsBySkill = (
  stack: ParsedStack
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

export const expandStack = (stackId: string): StackExpansion | undefined => {
  const stack = parsedStacks.find((candidate) => candidate.id === stackId)
  if (!stack) return undefined

  return {
    skillIds: stack.allSkillIds,
    assignmentsBySkill: toAssignmentsBySkill(stack),
  }
}
