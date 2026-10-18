import { EJECT_SOURCE } from "../../paths"
import type {
  AgentName,
  AgentScopeConfig,
  ProjectConfig,
  SkillConfig,
  SkillId,
} from "../../types"

/** `scope` has no default: every spec here asserts on which side of it an entry falls. */
export function buildSkillConfig(
  id: SkillId,
  fields: Pick<SkillConfig, "scope"> & Partial<Omit<SkillConfig, "id">>
): SkillConfig {
  return { id, origin: EJECT_SOURCE, ...fields }
}

/** `scope` has no default, as for {@link buildSkillConfig}. */
export function buildAgentScopeConfig(
  name: AgentName,
  fields: Pick<AgentScopeConfig, "scope"> &
    Partial<Omit<AgentScopeConfig, "name">>
): AgentScopeConfig {
  return { name, ...fields }
}

/** `agents` and `skills` have no default: a spec states the roster it asserts on. */
export function buildProjectConfig(
  fields: Pick<ProjectConfig, "agents" | "skills"> & Partial<ProjectConfig>
): ProjectConfig {
  return { name: "test-project", ...fields }
}
