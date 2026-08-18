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
  // Never set by the CLI today. The stack rail renders flat until it is.
  group?: string
  skillCount: number
}

// What applying a stack means, in terms the config store can consume directly.
// Deliberately not the store's own shape — this package knows nothing about the app.
export type StackExpansion = {
  skillIds: string[]
  // Which sub-agents each skill is assigned to, and how each of them loads it.
  assignmentsBySkill: Record<string, AssignmentTarget[]>
}

const toCatalogStack = (stack: MatrixStack): CatalogStack => ({
  id: stack.id,
  name: stack.name,
  description: stack.description,
  philosophy: stack.philosophy,
  ...(stack.group !== undefined && { group: stack.group }),
  skillCount: stack.allSkillIds.length,
})

/**
 * The stack rail's cells, over any catalogue in the wire shape — the
 * counterpart to `buildCatalog`, and exported for the same reason: a
 * marketplace ships its own stacks and they must render by the same rules.
 */
export const buildStacks = (matrix: Matrix): CatalogStack[] =>
  matrix.suggestedStacks.map(toCatalogStack)

/** The vendored public catalogue's stacks. */
export const STACKS: CatalogStack[] = buildStacks(MATRIX)

// A stack's skill ids are its marketplace's own, but its AGENT ids are not:
// marketplaces do not ship sub-agents, so the roster is the vendored one and a
// stack can only staff an agent that exists. One naming an agent this build has
// never heard of staffs nobody with it, rather than writing an assignment
// nothing downstream could render.
const rosteredAgents = (stack: MatrixStack) =>
  Object.keys(stack.skills)
    .map((agentId) => subAgentById(agentId))
    .filter((agent) => agent !== undefined)
    .map((agent) => agent.id)

// Inverts the stack's agent → category → skills nesting into skill → agents.
const toAgentsBySkill = (stack: MatrixStack): Record<string, AgentName[]> => {
  const agentsBySkill: Record<string, AgentName[]> = {}
  for (const agentId of rosteredAgents(stack)) {
    for (const skillId of Object.values(stack.skills[agentId] ?? {}).flat()) {
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

/**
 * Binds the expander to a catalogue. A marketplace's stacks name that
 * marketplace's skills, so a stack can only be expanded against the catalogue
 * it came from — asking the public one would strand every id.
 */
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
    }
  }

/** The expander bound to the vendored catalogue. */
export const expandStack = createStackExpander(MATRIX)
