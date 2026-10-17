import type { AgentConfig, Skill, SkillId } from "../../types"

/**
 * Not the CLI's factories (this package cannot import them): those default `tools` to a writer's
 * grant, and every spec here asserts on `tools`.
 */

/** `tools` and `skills` have no default: a spec states what its assertion depends on. */
export function buildAgentConfig(
  name: string,
  fields: Pick<AgentConfig, "tools" | "skills"> &
    Partial<Omit<AgentConfig, "name">>
): AgentConfig {
  return {
    name,
    title: `${name} agent`,
    description: `The ${name} sub-agent`,
    ...fields,
  }
}

/** `preloaded` is required: specs assert on both sides of it. */
export function buildSkill(
  id: SkillId,
  { preloaded }: Pick<Skill, "preloaded">
): Skill {
  return {
    id,
    path: `skills/${id}`,
    description: `The ${id} skill`,
    usage: `when working with ${id}`,
    preloaded,
  }
}
