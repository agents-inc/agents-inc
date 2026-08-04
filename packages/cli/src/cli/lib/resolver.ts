import path from "path";
import { DIRS, STANDARD_FILES } from "../consts";
import type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  Category,
  CompileAgentConfig,
  CompileConfig,
  ProjectConfig,
  Skill,
  SkillDefinitionMap,
  SkillReference,
  Stack,
  StackAgentConfig,
} from "../types";
import { fileExists } from "../utils/fs";
import { verbose } from "../utils/logger";
import { typedKeys } from "../utils/typed-object";
import { resolveAgentConfigToSkills } from "./stacks/stacks-loader";

export async function resolveClaudeMd(projectRoot: string, stackId: string): Promise<string> {
  const stackClaude = path.join(projectRoot, DIRS.stacks, stackId, STANDARD_FILES.CLAUDE_MD);
  if (await fileExists(stackClaude)) return stackClaude;

  throw new Error(
    `Stack '${stackId}' is missing required ${STANDARD_FILES.CLAUDE_MD} file. Expected at: ${stackClaude}`,
  );
}

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
    source: ref.source,
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
 * Resolves skill references for an agent from a Stack definition.
 *
 * Stack values are already SkillAssignment[] normalized by loadStacks().
 * Returns an empty array if the agent is not present in the stack or has
 * no technology-specific skills configured.
 *
 * @param agentName - Agent to resolve skills for
 * @param stack - Loaded stack definition with normalized skill assignments
 * @returns Skill references with usage and preloaded flags from the stack
 */
export function resolveAgentSkillsFromStack(agentName: AgentName, stack: Stack): SkillReference[] {
  const agentConfig = stack.agents[agentName];

  if (!agentConfig) {
    verbose(`Agent '${agentName}' not found in stack '${stack.id}'`);
    return [];
  }

  // Empty config {} means agent has no technology-specific skills
  if (typedKeys<Category>(agentConfig).length === 0) {
    verbose(`Agent '${agentName}' has no technology config in stack '${stack.id}'`);
    return [];
  }

  const skillRefs = resolveAgentConfigToSkills(agentConfig);

  verbose(`Resolved ${skillRefs.length} skills for agent '${agentName}' from stack '${stack.id}'`);

  return skillRefs;
}

/**
 * Resolves skill references for an agent using a priority hierarchy.
 *
 * Priority order:
 * 1. Explicit skills defined in the agent's compile config
 * 2. Skills derived from the stack definition
 *
 * @param agentName - Agent to resolve skills for
 * @param agentConfig - Compile-time agent config (may contain explicit skills)
 * @param stack - Optional stack definition for fallback skill resolution
 * @returns Skill references from the highest-priority source, or empty array
 */
export async function resolveAgentSkillRefs(
  agentName: AgentName,
  agentConfig: CompileAgentConfig,
  stack?: Stack,
): Promise<SkillReference[]> {
  // Priority 1: Explicit skills in compile config
  if (agentConfig.skills && agentConfig.skills.length > 0) {
    return agentConfig.skills;
  }

  // Priority 2: Stack-based skills — values are already skill IDs
  if (stack) {
    const stackSkills = resolveAgentSkillsFromStack(agentName, stack);
    if (stackSkills.length > 0) {
      verbose(`Resolved ${stackSkills.length} skills from stack for ${agentName}`);
      return stackSkills;
    }
  }

  return [];
}

/**
 * Resolves all agents referenced in a compile config into fully populated AgentConfigs
 * with their skill lists materialized from definitions.
 *
 * For each agent in `compileConfig.agents`, this function:
 * 1. Validates the agent exists in the scanned agent definitions
 * 2. Resolves skill references (from explicit config or stack fallback)
 * 3. Materializes skill references into full Skill objects using the skill definitions map
 * 4. Merges the agent definition with its resolved skills into an AgentConfig
 *
 * @param agents - Available agent definitions keyed by name (from scanning agent directories)
 * @param skills - Available skill definitions keyed by ID (from scanning skill directories)
 * @param compileConfig - Compilation config specifying which agents to compile and their overrides
 * @param _projectRoot - Project root directory (currently unused, reserved for future use)
 * @param stack - Optional stack definition for stack-based skill resolution
 * @returns Map of agent names to fully resolved AgentConfig objects ready for compilation
 * @throws When an agent referenced in compileConfig is not found in scanned agents
 */
export async function resolveAgents(
  agents: Record<AgentName, AgentDefinition>,
  skills: SkillDefinitionMap,
  compileConfig: CompileConfig,
  _projectRoot: string,
  stack?: Stack,
): Promise<Record<AgentName, AgentConfig>> {
  const agentNames = typedKeys<AgentName>(compileConfig.agents);

  const entries = await Promise.all(
    agentNames.map(async (agentName) => {
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

      const agentConfig = compileConfig.agents[agentName];
      const skillRefs = await resolveAgentSkillRefs(agentName, agentConfig, stack);
      const resolvedSkills = resolveSkillReferences(skillRefs, skills);

      return [
        agentName,
        {
          name: agentName,
          title: definition.title,
          description: definition.description,
          // The project config carries the user's deliberate choice; the agent's own metadata
          // carries the default. Config wins, silently — warning on every compile for a setting
          // someone made on purpose is noise.
          model: agentConfig?.model ?? definition.model,
          effort: agentConfig?.effort ?? definition.effort,
          tools: definition.tools,
          skills: resolvedSkills,
          path: definition.path,
          sourceRoot: definition.sourceRoot,
          agentBaseDir: definition.agentBaseDir,
        },
      ] as const;
    }),
  );

  // Structural cast: Object.fromEntries returns Record<string, V>, narrowing to typed keys
  return Object.fromEntries(entries) as Record<AgentName, AgentConfig>;
}

export function convertStackToCompileConfig(stackId: string, stack: ProjectConfig): CompileConfig {
  return {
    name: stack.name,
    description: stack.description || "",
    stack: stackId,
    // Structural cast: Object.fromEntries returns Record<string, V>, narrowing to typed keys
    agents: Object.fromEntries(stack.agents.map((a) => [a.name, {}])) as Record<
      AgentName,
      CompileAgentConfig
    >,
  };
}
