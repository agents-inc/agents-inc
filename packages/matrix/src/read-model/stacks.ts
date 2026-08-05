import { STACK_PRELOADS } from "../generated/stack-preloads"
import type { AgentName, SkillId } from "../vendor/generated/source-types"
import { StackPreloadsSchema, type ParsedStack } from "../schema"
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
  // Which sub-agents each skill is assigned to.
  agentsBySkill: Record<string, AgentName[]>
  preloadedSkillIds: SkillId[]
}

const parsedStacks = MATRIX.suggestedStacks
const parsedPreloads = StackPreloadsSchema.parse(STACK_PRELOADS)

export const STACKS: CatalogStack[] = parsedStacks.map((stack) => ({
  id: stack.id,
  name: stack.name,
  description: stack.description,
  philosophy: stack.philosophy,
  group: stack.group,
  skillCount: stack.allSkillIds.length,
}))

// Expands a stack into skill selections plus their sub-agent assignments.
//
// `preloadedSkillIds` comes from STACK_PRELOADS rather than the stack itself: resolving a stack
// into `BUILT_IN_MATRIX.suggestedStacks` flattens `SkillAssignment[]` to `SkillId[]` and loses
// the flag. See packages/matrix/src/generated/stack-preloads.ts.
// Inverts the stack's agent → category → skills nesting into skill → agents.
const toAgentsBySkill = (stack: ParsedStack): Record<string, AgentName[]> => {
  const agentsBySkill: Record<string, AgentName[]> = {}
  for (const [agentId, categories] of Object.entries(stack.skills)) {
    for (const skillId of Object.values(categories).flat()) {
      const agents = (agentsBySkill[skillId] ??= [])
      if (!agents.includes(agentId as AgentName))
        agents.push(agentId as AgentName)
    }
  }
  return agentsBySkill
}

export const expandStack = (stackId: string): StackExpansion | undefined => {
  const stack = parsedStacks.find((candidate) => candidate.id === stackId)
  if (!stack) return undefined

  return {
    skillIds: stack.allSkillIds as SkillId[],
    agentsBySkill: toAgentsBySkill(stack),
    preloadedSkillIds: (parsedPreloads[stackId] ?? []) as SkillId[],
  }
}
