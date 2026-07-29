import path from "path";
import {
  buildAndMergeConfig,
  writeScopedConfigs,
  resolveInstallPaths,
  isHomeDirectory,
} from "../../installation/index.js";
import { loadMergedAgents, type SourceLoadResult } from "../../loading/index.js";
import type { AuthoritativeScope } from "../../configuration/index.js";
import { ensureBlankGlobalConfig } from "../../configuration/config-writer.js";
import { ensureDir } from "../../../utils/fs.js";
import type { ProjectConfig, AgentDefinition, AgentName } from "../../../types/index.js";
import type { WizardResultV2 } from "../../../components/wizard/wizard.js";

export type ConfigWriteOptions = {
  wizardResult: WizardResultV2;
  sourceResult: SourceLoadResult;
  projectDir: string;
  sourceFlag?: string;
  /** Pre-loaded agent definitions. If omitted, loads from CLI + source. */
  agents?: Record<AgentName, AgentDefinition>;
  /**
   * Authority of `cc edit`'s newConfig over absent entries (D-233 Scenario C):
   * `"all"` (global edit) drops any deselected entry, `"owned"` (project edit) drops deselected
   * project-owned entries only, `undefined` (init) keeps additive union-preserve.
   */
  authoritativeScope?: AuthoritativeScope;
};

export type ConfigWriteResult = {
  config: ProjectConfig;
  configPath: string;
  globalConfigPath?: string;
  wasMerged: boolean;
  existingConfigPath?: string;
  filesWritten: number;
  /**
   * Registered project directories whose config was rewritten by propagation of
   * this write's global changes. Their compiled agents are now stale — the
   * caller recompiles them with `recompileRegisteredProjectAgents`.
   */
  propagatedProjects: string[];
};

/**
 * Builds, merges, and writes project configuration files.
 *
 * Handles the full config pipeline:
 * 1. buildAndMergeConfig() — generates config from wizard result, merges with existing
 * 2. loadAllAgents() — loads agent definitions for config-types generation
 * 3. ensureBlankGlobalConfig() — ensures global config exists (when in project context)
 * 4. writeScopedConfigs() — writes config.ts and config-types.ts split by scope
 */
export async function writeProjectConfig(options: ConfigWriteOptions): Promise<ConfigWriteResult> {
  const { wizardResult, sourceResult, projectDir, sourceFlag } = options;
  const projectPaths = resolveInstallPaths(projectDir, "project");

  await ensureDir(path.dirname(projectPaths.configPath));

  let agents: Record<AgentName, AgentDefinition>;
  if (options.agents) {
    agents = options.agents;
  } else {
    agents = await loadMergedAgents(sourceResult.sourcePath);
  }

  const mergeResult = await buildAndMergeConfig(
    wizardResult,
    sourceResult,
    projectDir,
    sourceFlag,
    options.authoritativeScope,
  );
  const finalConfig = mergeResult.config;

  const isProjectContext = !isHomeDirectory(projectDir);

  if (isProjectContext) {
    await ensureBlankGlobalConfig();
  }

  const { propagatedProjects } = await writeScopedConfigs(
    finalConfig,
    sourceResult.matrix,
    agents,
    projectDir,
    projectPaths.configPath,
    isProjectContext,
  );

  return {
    config: finalConfig,
    configPath: projectPaths.configPath,
    wasMerged: mergeResult.merged,
    existingConfigPath: mergeResult.existingConfigPath,
    filesWritten: isProjectContext ? 4 : 2,
    propagatedProjects,
  };
}
