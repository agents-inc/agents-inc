import path from "path";
import {
  buildAndMergeConfig,
  resolveInstallPaths,
  isHomeDirectory,
} from "../../installation/index.js";
import type { SourceLoadResult } from "../../loading/index.js";
import type { AuthoritativeScope } from "../../configuration/index.js";
import {
  ensureBlankPair,
  writeScopedFromWizard,
  type GateReport,
} from "../../config-gate/index.js";
import { loadAgentDefs, type AgentDefs } from "./load-agent-defs.js";
import { ensureDir } from "../../../utils/fs.js";
import type { ProjectConfig } from "../../../types/index.js";
import type { WizardResultV2 } from "../../../components/wizard/wizard.js";

export type ConfigWriteOptions = {
  wizardResult: WizardResultV2;
  sourceResult: SourceLoadResult;
  projectDir: string;
  sourceFlag?: string;
  /**
   * What {@link loadAgentDefs} answered, for a caller that has already asked it. Omitted, this
   * function asks for itself.
   *
   * It takes the WHOLE value rather than the roster inside it, so the only thing a caller can
   * hand over is what that one function produced. This used to be a bare
   * `Partial<Record<AgentName, AgentDefinition>>` — any map at all — which made "a roster
   * different from the one the CLI would load" a representable argument, and this function emits
   * the `AgentName` / `SelectedAgentName` unions from whatever it is given. Deleting the option
   * instead would cost `edit` a second uncached walk-and-parse of `src/agents/` per run, since
   * it needs `sourcePath` off the same value for its compile pass — one fact loaded twice, where
   * the second load is the one that can disagree.
   */
  agentDefs?: AgentDefs;
  /**
   * Authority of `cc edit`'s newConfig over absent entries:
   * `"all"` (global edit) drops any deselected entry, `"owned"` (project edit) drops deselected
   * project-owned entries only, `undefined` (init) keeps additive union-preserve.
   */
  authoritativeScope?: AuthoritativeScope;
};

export type ConfigWriteResult = {
  config: ProjectConfig;
  configPath: string;
  wasMerged: boolean;
  existingConfigPath?: string;
  filesWritten: number;
  /**
   * What the gated write did: what moved in the global config, which registered
   * projects it fanned out to, and the recompile it drove in them. The caller
   * renders it; the work is already done.
   */
  propagation: GateReport;
};

/**
 * Builds, merges, and writes project configuration files.
 *
 * Handles the full config pipeline:
 * 1. buildAndMergeConfig() — generates config from wizard result, merges with existing
 * 2. loadAgentDefs() — the CLI's own sub-agent definitions, for config-types generation
 * 3. ensureBlankPair() — ensures the global config pair exists (when in project context)
 * 4. writeScopedFromWizard() — writes config.ts and config-types.ts split by scope,
 *    fans global changes out to registered projects and recompiles their agents
 */
export async function writeProjectConfig(options: ConfigWriteOptions): Promise<ConfigWriteResult> {
  const { wizardResult, sourceResult, projectDir, sourceFlag } = options;
  const projectPaths = resolveInstallPaths(projectDir, "project");

  await ensureDir(path.dirname(projectPaths.configPath));

  // The marketplace is deliberately NOT consulted for this roster. It names the sub-agents the
  // emitted unions declare, and a marketplace-defined name in `AgentName` is one no compile pass
  // can honour: agent partials resolve through `getLocalAgentDefinitions`, which answers the
  // CLI's own root, and the generated `AGENT_NAMES` is built from that same directory. Reading
  // `sourceResult.sourcePath` here is what made `init` and `edit` emit two different files from
  // one config (owner ruling 2026-08-21).
  const { agents } = options.agentDefs ?? (await loadAgentDefs());

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
    await ensureBlankPair();
  }

  const propagation = await writeScopedFromWizard({
    finalConfig,
    matrix: sourceResult.matrix,
    agents,
    projectDir,
    projectConfigPath: projectPaths.configPath,
    projectInstallationExists: isProjectContext,
    // The same word the merger above took. It decides the config ROW there and the GLOBAL
    // config a project write commits here, and the two files disagree the moment it does not
    // reach both: a row preserved for a skill whose directory the removal diff deleted.
    ...(options.authoritativeScope !== undefined && {
      authoritativeScope: options.authoritativeScope,
    }),
  });

  return {
    config: finalConfig,
    configPath: projectPaths.configPath,
    wasMerged: mergeResult.merged,
    ...(mergeResult.existingConfigPath !== undefined && {
      existingConfigPath: mergeResult.existingConfigPath,
    }),
    filesWritten: isProjectContext ? 4 : 2,
    propagation,
  };
}
