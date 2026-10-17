import { buildAgentScopeMap } from "../../installation/local-installer.js";
import {
  compileAgentsAllScopes,
  copyLocalSkills,
  discoverInstalledSkills,
  loadAgentDefs,
  writeProjectConfig,
  type CompilationResult,
  type ConfigWriteResult,
  type SkillCopyResult,
} from "../../operations/index.js";

import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { SourceLoadResult } from "../../loading/index.js";

export type InstallThroughOperationsOptions = {
  selection: InstallSelection;
  sourceResult: SourceLoadResult;
  projectDir: string;
  /** `init`'s `--marketplace` flag. */
  sourceFlag?: string;
};

export type InstallThroughOperationsResult = {
  copied: SkillCopyResult;
  config: ConfigWriteResult;
  compilation: CompilationResult;
};

/**
 * The install `init --from` performs, in `commands/init.tsx`'s order: copy, write config, compile.
 * Test-only on purpose, so it cannot become a second production entry point.
 */
export async function installThroughOperations(
  options: InstallThroughOperationsOptions,
): Promise<InstallThroughOperationsResult> {
  const { selection, sourceResult, projectDir, sourceFlag } = options;

  const copied = await copyLocalSkills(selection.skills, projectDir, sourceResult);
  const config = await writeProjectConfig({
    selection,
    sourceResult,
    projectDir,
    ...(sourceFlag !== undefined && { sourceFlag }),
  });

  const agentDefs = await loadAgentDefs();
  const { allSkills } = await discoverInstalledSkills(projectDir);
  const compilation = await compileAgentsAllScopes({
    projectDir,
    sourcePath: agentDefs.sourcePath,
    skills: allSkills,
    agentScopeMap: buildAgentScopeMap(config.config),
  });

  return { copied, config, compilation };
}
