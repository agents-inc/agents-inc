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
  /** `--marketplace` override, exactly as `init` forwards its flag. */
  sourceFlag?: string;
};

/** One result per operation, so a spec asserts on the step it is about. */
export type InstallThroughOperationsResult = {
  copied: SkillCopyResult;
  config: ConfigWriteResult;
  compilation: CompilationResult;
};

/**
 * The install `agents-inc init --from` performs once the selection is decoded, driven directly.
 *
 * Three operations, in the order and with the arguments `commands/init.tsx` uses: copy the
 * selected skills, write the scoped config pair, then compile every scope's sub-agents. A spec
 * that needs an installed project builds it through here, so a step the command gains or loses
 * reaches every spec that depends on one.
 *
 * There is deliberately no production function with this shape. One used to sit in
 * `lib/installation/local-installer.ts` with no caller anywhere in `src/cli/`, which let a whole
 * spec suite describe an install no user could run. A driver that lives only in the test tree
 * cannot become a second entry point.
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
