import { partition } from "remeda";
import { writeCompiledAgentsByScope, type AgentWriteOutcome } from "./write-compiled-agents";
import path from "path";

import { getErrorMessage } from "../../utils/errors";
import type {
  AgentDefinition,
  AgentName,
  CompileAgentConfig,
  CompileConfig,
  ProjectConfig,
  SkillDefinitionMap,
} from "../../types";

import { buildCompileAgents } from "../installation/local-installer";
import { glob, ensureDir } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { createLiquidEngine } from "../compiler";
import { loadProjectConfig } from "../configuration";
import { loadAllAgents, loadProjectAgents } from "../loading";
import { getPluginAgentsDir } from "../plugins";
import { discoverAllPluginSkills } from "../plugins/plugin-discovery";
import { resolveAgents } from "../resolver";

export type RecompileAgentsOptions = {
  pluginDir: string;
  sourcePath: string;
  agents?: AgentName[];
  skills?: SkillDefinitionMap;
  projectDir?: string;
  outputDir?: string;
  /** When provided, routes agents by scope: global agents to ~/.claude/agents/, project agents to outputDir */
  agentScopeMap?: Map<AgentName, "project" | "global">;
};

export type RecompileAgentsResult = {
  compiled: AgentName[];
  failed: AgentName[];
  warnings: string[];
};

async function getExistingAgentNames(pluginDir: string): Promise<AgentName[]> {
  const agentsDir = getPluginAgentsDir(pluginDir);
  const files = await glob("*.md", agentsDir);
  // Boundary cast: directory names from filesystem are agent names by convention
  return files.map((f) => path.basename(f, ".md") as AgentName);
}

type ResolveAgentNamesParams = {
  specifiedAgents?: AgentName[];
  projectConfig: ProjectConfig | null;
  allAgents: Record<AgentName, AgentDefinition>;
  outputDir?: string;
  pluginDir: string;
};

async function resolveAgentNames(params: ResolveAgentNamesParams): Promise<AgentName[]> {
  const { specifiedAgents, projectConfig, allAgents, outputDir, pluginDir } = params;

  if (specifiedAgents) {
    return specifiedAgents;
  }

  if (projectConfig?.agents?.length) {
    const agentNames = projectConfig.agents.map((a) => a.name);
    verbose(`Using agents from config: ${agentNames.join(", ")}`);
    return agentNames;
  }

  if (outputDir) {
    const names = typedKeys<AgentName>(allAgents);
    verbose(`Using all available agents from source: ${names.join(", ")}`);
    return names;
  }

  return getExistingAgentNames(pluginDir);
}

/** Splits write outcomes into the recompile result; logs each success at verbose level. */
function buildRecompileResult(
  outcomes: AgentWriteOutcome[],
  priorWarnings: string[],
): RecompileAgentsResult {
  const [succeeded, failedOutcomes] = partition(
    outcomes,
    (outcome): outcome is Extract<AgentWriteOutcome, { ok: true }> => outcome.ok,
  );
  succeeded.forEach((outcome) =>
    verbose(`  Recompiled: ${outcome.name} (${outcome.scope} -> ${outcome.targetDir})`),
  );
  return {
    compiled: succeeded.map((outcome) => outcome.name),
    failed: failedOutcomes.map((outcome) => outcome.name),
    warnings: [
      ...priorWarnings,
      ...failedOutcomes.map(
        (outcome) => `Failed to compile ${outcome.name}: ${getErrorMessage(outcome.error)}`,
      ),
    ],
  };
}

export function filterExcludedEntries(config: ProjectConfig): ProjectConfig {
  const activeIds = new Set(config.skills.filter((s) => !s.excluded).map((s) => s.id));
  const excludedIds = new Set(
    config.skills.filter((s) => s.excluded && !activeIds.has(s.id)).map((s) => s.id),
  );
  const activeSkills = config.skills.filter((s) => !s.excluded);
  const activeAgents = config.agents.filter((a) => !a.excluded);

  // Also remove excluded skill refs from stack assignments
  const filteredStack = config.stack
    ? Object.fromEntries(
        typedEntries(config.stack).map(([agentName, agentStack]) => [
          agentName,
          Object.fromEntries(
            typedEntries(agentStack).map(([category, assignments]) => [
              category,
              assignments.filter((a) => !excludedIds.has(a.id)),
            ]),
          ),
        ]),
      )
    : undefined;

  return { ...config, skills: activeSkills, agents: activeAgents, stack: filteredStack };
}

export async function recompileAgents(
  options: RecompileAgentsOptions,
): Promise<RecompileAgentsResult> {
  const { pluginDir, sourcePath, skills: providedSkills, projectDir, outputDir } = options;

  const configDir = projectDir ?? pluginDir;
  const loadedConfig = await loadProjectConfig(configDir);
  const projectConfig = loadedConfig?.config ?? null;

  // Filter excluded entries once at the entry point — callees receive clean data
  const filteredConfig = projectConfig ? filterExcludedEntries(projectConfig) : null;

  const builtinAgents = await loadAllAgents(sourcePath);
  const projectAgents = projectDir ? await loadProjectAgents(projectDir) : {};

  // Priority: project agents > built-in agents
  const allAgents: Record<AgentName, AgentDefinition> = {
    ...builtinAgents,
    ...projectAgents,
  };

  const agentNames = await resolveAgentNames({
    specifiedAgents: options.agents,
    projectConfig: filteredConfig,
    allAgents,
    outputDir,
    pluginDir,
  });

  if (agentNames.length === 0) {
    return { compiled: [], failed: [], warnings: ["No agents found to recompile"] };
  }

  verbose(`Recompiling ${agentNames.length} agents in ${outputDir ?? pluginDir}`);

  // When skills are not provided, discover from all plugin directories.
  const pluginSkills: SkillDefinitionMap =
    providedSkills ?? (await discoverAllPluginSkills(projectDir ?? pluginDir));

  const allConfigAgents = filteredConfig ? buildCompileAgents(filteredConfig, allAgents) : {};

  // Restrict to only the agents we're compiling (agentNames).
  // buildCompileAgents returns entries for ALL agents in the config, but when
  // scopeFilter is active, we only want the agents matching that scope.
  // Without this filter, a project pass would compile global agents without
  // their stack (since the project config omits global agent stack entries)
  // and overwrite correctly compiled global agent files.
  const [knownAgents, missingAgents] = partition(agentNames, (name) =>
    Boolean(allConfigAgents[name] || allAgents[name]),
  );
  const missingWarnings = missingAgents.map(
    (name) => `Agent "${name}" not found in source definitions`,
  );
  const configAgents: Record<string, CompileAgentConfig> = Object.fromEntries(
    knownAgents.map((name) => [name, allConfigAgents[name] ?? {}]),
  );

  const compileConfig: CompileConfig = {
    name: filteredConfig?.name || path.basename(pluginDir),
    description: filteredConfig?.description || "Recompiled plugin",
    agents: configAgents,
  };

  const engine = await createLiquidEngine(projectDir);
  const resolvedAgents = await resolveAgents(allAgents, pluginSkills, compileConfig, sourcePath);

  const agentsDir = outputDir ?? getPluginAgentsDir(pluginDir);
  await ensureDir(agentsDir);

  const outcomes = await writeCompiledAgentsByScope({
    resolvedAgents,
    sourcePath,
    engine,
    projectAgentsDir: agentsDir,
    agentScopeMap: options.agentScopeMap,
  });
  return buildRecompileResult(outcomes, missingWarnings);
}
