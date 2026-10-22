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

function resolveSkillReference(ref: SkillReference, skills: SkillDefinitionMap): Skill | null {
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

function resolveSkillReferences(skillRefs: SkillReference[], skills: SkillDefinitionMap): Skill[] {
  return skillRefs
    .map((ref) => resolveSkillReference(ref, skills))
    .filter((skill): skill is Skill => skill !== null);
}

export function buildSkillRefsFromConfig(agentStack: StackAgentConfig): SkillReference[] {
  return resolveAgentConfigToSkills(agentStack);
}

/** Throws when the compile config names an agent no scanned directory defines. */
// eslint-disable-next-line @typescript-eslint/require-await -- callers await it
export async function resolveAgents(
  agents: Partial<Record<AgentName, AgentDefinition>>,
  skills: SkillDefinitionMap,
  compileConfig: CompileConfig,
): Promise<Partial<Record<AgentName, AgentConfig>>> {
  const entries = typedEntries<AgentName, CompileAgentConfig>(compileConfig.agents).map(
    ([agentName, agentConfig]) =>
      [agentName, resolveAgent(agentName, agentConfig, agents, skills)] as const,
  );

  return typedFromEntries(entries);
}

function resolveAgent(
  agentName: AgentName,
  agentConfig: CompileAgentConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  skills: SkillDefinitionMap,
): AgentConfig {
  const definition = agents[agentName];
  if (!definition) throw new Error(agentNotFoundError(agentName, agents));

  // `buildCompileAgents` has already expanded the stack into `skills`.
  const resolvedSkills = resolveSkillReferences(agentConfig.skills ?? [], skills);
  return assembleAgentConfig(agentName, definition, agentConfig, resolvedSkills);
}

const MAX_LISTED_AVAILABLE_AGENTS = 5;

function agentNotFoundError(
  agentName: AgentName,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): string {
  const availableAgents = describeAvailableAgents(typedKeys<AgentName>(agents));
  return `Agent '${agentName}' referenced in compile config but not found in scanned agents. ${availableAgents}. Check that src/agents/${agentName}/metadata.yaml exists.`;
}

function describeAvailableAgents(availableAgents: AgentName[]): string {
  if (availableAgents.length === 0) return "No agents found in scanned directories";

  const listed = availableAgents.slice(0, MAX_LISTED_AVAILABLE_AGENTS).join(", ");
  const unlisted = availableAgents.length - MAX_LISTED_AVAILABLE_AGENTS;
  return unlisted > 0
    ? `Available agents: ${listed} (and ${unlisted} more)`
    : `Available agents: ${listed}`;
}

function assembleAgentConfig(
  agentName: AgentName,
  definition: AgentDefinition,
  agentConfig: CompileAgentConfig,
  resolvedSkills: Skill[],
): AgentConfig {
  const model = agentConfig.model ?? definition.model;
  const effort = agentConfig.effort ?? definition.effort;

  return {
    name: agentName,
    title: definition.title,
    description: definition.description,
    ...(model !== undefined && { model }),
    ...(agentConfig.codexModel !== undefined && { codexModel: agentConfig.codexModel }),
    ...(effort !== undefined && { effort }),
    tools: definition.tools,
    // Spread conditionally: the template branches on presence, and `undefined` renders a key.
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
  };
}
