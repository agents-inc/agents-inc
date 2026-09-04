import type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  CompileAgentConfig,
  CompileConfig,
  Skill,
  SkillDefinitionMap,
  SkillReference,
  StackAgentConfig,
} from "../types";
import { verbose } from "../utils/logger";
import { typedEntries, typedFromEntries, typedKeys } from "../utils/typed-object";
import { resolveAgentConfigToSkills } from "./stacks/stacks-loader";

export function resolveSkillReference(
  ref: SkillReference,
  skills: SkillDefinitionMap,
): Skill | null {
  const definition = skills[ref.id];
  if (!definition) {
    verbose(`Skill '${ref.id}' not found in available skills, skipping`);
    return null;
  }
  return {
    ...definition,
    usage: ref.usage,
    preloaded: ref.preloaded ?? false,
    ...(ref.source !== undefined && { source: ref.source }),
  };
}

export function resolveSkillReferences(
  skillRefs: SkillReference[],
  skills: SkillDefinitionMap,
): Skill[] {
  return skillRefs
    .map((ref) => resolveSkillReference(ref, skills))
    .filter((skill): skill is Skill => skill !== null);
}

/**
 * Builds skill references from a ProjectConfig stack mapping (agent -> category -> SkillAssignment[]).
 *
 * Values are normalized to SkillAssignment[] at load time (by normalizeStackRecord in project-config.ts).
 * Preserves preloaded flags from skill assignments.
 *
 * @param agentStack - Category-to-SkillAssignment[] mapping from ProjectConfig.stack for one agent
 * @returns Skill references with usage hints derived from category names
 */
export function buildSkillRefsFromConfig(agentStack: StackAgentConfig): SkillReference[] {
  return resolveAgentConfigToSkills(agentStack);
}

/**
 * Resolves the skill references an agent compiles with.
 *
 * The compile config is the only source: `buildCompileAgents` has already expanded
 * the project config's stack into `skills` by the time this runs.
 *
 * @param agentConfig - Compile-time agent config
 * @returns The agent's explicit skill references, or an empty array when it names none
 */
export function resolveAgentSkillRefs(agentConfig: CompileAgentConfig): SkillReference[] {
  return agentConfig.skills ?? [];
}

/**
 * Resolves all agents referenced in a compile config into fully populated AgentConfigs
 * with their skill lists materialized from definitions.
 *
 * For each agent in `compileConfig.agents`, this function:
 * 1. Validates the agent exists in the scanned agent definitions
 * 2. Resolves skill references from the agent's compile config
 * 3. Materializes skill references into full Skill objects using the skill definitions map
 * 4. Merges the agent definition with its resolved skills into an AgentConfig
 *
 * @param agents - Available agent definitions keyed by name (from scanning agent directories)
 * @param skills - Available skill definitions keyed by ID (from scanning skill directories)
 * @param compileConfig - Compilation config specifying which agents to compile and their overrides
 * @param _projectRoot - Project root directory (currently unused, reserved for future use)
 * @returns Map of agent names to fully resolved AgentConfig objects ready for compilation
 * @throws When an agent referenced in compileConfig is not found in scanned agents
 */
// Nothing below is asynchronous any more: `resolveAgentSkillRefs` never was, and
// dropping its `async` emptied this one too. The `Promise` stays because it is the
// published shape — two production callers await it and local-installer.test.ts
// doubles it with `mockResolvedValue`, so unwinding it is a change to the compile
// pipeline rather than to this line.
// eslint-disable-next-line @typescript-eslint/require-await -- published shape, see above
export async function resolveAgents(
  agents: Partial<Record<AgentName, AgentDefinition>>,
  skills: SkillDefinitionMap,
  compileConfig: CompileConfig,
  _projectRoot: string,
): Promise<Partial<Record<AgentName, AgentConfig>>> {
  const entries = typedEntries<AgentName, CompileAgentConfig>(compileConfig.agents).map(
    ([agentName, agentConfig]) => {
      const definition = agents[agentName];
      if (!definition) {
        const availableAgents = typedKeys<AgentName>(agents);
        const agentList =
          availableAgents.length > 0
            ? `Available agents: ${availableAgents.slice(0, 5).join(", ")}${availableAgents.length > 5 ? ` (and ${availableAgents.length - 5} more)` : ""}`
            : "No agents found in scanned directories";
        throw new Error(
          `Agent '${agentName}' referenced in compile config but not found in scanned agents. ${agentList}. Check that src/agents/${agentName}/metadata.yaml exists.`,
        );
      }

      const skillRefs = resolveAgentSkillRefs(agentConfig);
      const resolvedSkills = resolveSkillReferences(skillRefs, skills);

      // The project config carries the user's deliberate choice; the agent's own metadata
      // carries the default. Config wins, silently — warning on every compile for a setting
      // someone made on purpose is noise. Neither present leaves the key off entirely.
      const model = agentConfig.model ?? definition.model;
      const effort = agentConfig.effort ?? definition.effort;

      return [
        agentName,
        {
          name: agentName,
          title: definition.title,
          description: definition.description,
          ...(model !== undefined && { model }),
          ...(effort !== undefined && { effort }),
          tools: definition.tools,
          // Every optional frontmatter field `agent.liquid` reads. Spread conditionally rather
          // than unconditionally, because the template branches on presence — an explicit
          // `undefined` renders as an empty key.
          ...(definition.disallowedTools !== undefined && {
            disallowedTools: definition.disallowedTools,
          }),
          ...(definition.permissionMode !== undefined && {
            permissionMode: definition.permissionMode,
          }),
          ...(definition.isolation !== undefined && { isolation: definition.isolation }),
          ...(definition.hooks !== undefined && { hooks: definition.hooks }),
          ...(definition.experimental !== undefined && {
            experimental: definition.experimental,
          }),
          skills: resolvedSkills,
          ...(definition.path !== undefined && { path: definition.path }),
          ...(definition.sourceRoot !== undefined && { sourceRoot: definition.sourceRoot }),
          ...(definition.agentBaseDir !== undefined && { agentBaseDir: definition.agentBaseDir }),
        },
      ] as const;
    },
  );

  return typedFromEntries(entries);
}
