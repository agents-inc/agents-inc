import type { AgentConfig, Skill, SkillId } from "../../types"

/**
 * The agent definitions and skills this package's renderer specs hand `buildAgentTemplateContext`,
 * `renderAgent`, `renderAgentBody`, `renderAgentFromCorpus` and `renderAgentRoleToml`.
 *
 * Here rather than borrowed from the CLI's `src/cli/lib/__tests__/factories/`, which this package
 * cannot import: the dependency runs the other way. And deliberately not a copy of them. The CLI's
 * `createMockAgentConfig` defaults `tools` to a writer's grant, while every spec here reads `tools`
 * back — the Skill grant, the completion gate only a writer stops against, the Codex shell toggle
 * only an agent without Bash gets — so a default there would supply the very condition an
 * assertion depends on, out of sight of the call site.
 *
 * `contract/emission-scenarios.ts` writes its configurations out rather than building them, and
 * that stays right: a contract module is the single declaration of what it pins. These serve the
 * unit specs.
 */

/**
 * One sub-agent's resolved definition.
 *
 * `tools` and `skills` have no default, which is the whole design: a spec states the grant and the
 * skills its assertion depends on where it builds the agent. Only `title` and `description` are
 * filled in, and no assertion in this package depends on what either says.
 */
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

/**
 * One skill as an agent carries it.
 *
 * `preloaded` is required rather than defaulted: it decides whether the skill is listed in the
 * frontmatter or loaded through the Skill tool, and specs here assert on each side of that.
 */
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
