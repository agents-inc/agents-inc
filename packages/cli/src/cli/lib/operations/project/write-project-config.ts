import path from "path";
import {
  buildAndMergeConfig,
  resolveInstallPaths,
  isHomeDirectory,
} from "../../installation/index.js";
import type { SourceLoadResult } from "../../loading/index.js";
import type { AuthoritativeScope } from "../../configuration/index.js";
import { ensureBlankPair, writeConfigByScope, type GateReport } from "../../config-gate/index.js";
import { providerInUse } from "../../installation/install-layout.js";
import { loadAgentDefs, type AgentDefs } from "./load-agent-defs.js";
import { ensureDir } from "../../../utils/fs.js";
import type { ProjectConfig } from "../../../types/index.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";

export type ConfigWriteOptions = {
  selection: InstallSelection;
  sourceResult: SourceLoadResult;
  projectDir: string;
  sourceFlag?: string;
  /** What {@link loadAgentDefs} answered, for a caller that already asked; loaded when omitted. */
  agentDefs?: AgentDefs;
  /** `"all"` drops any deselected entry, `"owned"` only project-owned ones, absent keeps all. */
  authoritativeScope?: AuthoritativeScope;
};

export type ConfigWriteResult = {
  config: ProjectConfig;
  configPath: string;
  wasMerged: boolean;
  existingConfigPath?: string;
  propagation: GateReport;
};

export async function writeProjectConfig(options: ConfigWriteOptions): Promise<ConfigWriteResult> {
  const { selection, sourceResult, projectDir, sourceFlag } = options;
  const projectPaths = resolveInstallPaths(projectDir, "project");

  await ensureDir(path.dirname(projectPaths.configPath));

  const { agents } = options.agentDefs ?? (await loadAgentDefs());

  const mergeResult = await buildAndMergeConfig(
    selection,
    sourceResult,
    projectDir,
    sourceFlag,
    options.authoritativeScope,
  );
  const finalConfig = mergeResult.config;

  const isProjectContext = !isHomeDirectory(projectDir);

  if (isProjectContext) {
    // A project inherits only from its own provider's global.
    await ensureBlankPair(providerInUse(projectDir));
  }

  const propagation = await writeConfigByScope({
    finalConfig,
    matrix: sourceResult.matrix,
    agents,
    projectDir,
    projectConfigPath: projectPaths.configPath,
    projectInstallationExists: isProjectContext,
    // Must match the merger's, or the global config and the project rows disagree.
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
    propagation,
  };
}
