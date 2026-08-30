import path from "path";

import type { AgentDefinition, AgentName, MergedSkillsMatrix } from "../../types";
import { CLAUDE_SRC_DIR, globalInstallRoot, STANDARD_FILES } from "../../consts";
// The gate's private token module, imported here by exception (eslint records
// it): this is one of the two enforcement guards, and `gate-token.ts` is a
// dependency-free leaf, so the import cannot cycle back through the gate.
import { GlobalPairWriteViolation } from "../config-gate/gate-token.js";
import { isHomeDirectory } from "../installation/is-home-directory";
import { fileExists, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedKeys } from "../../utils/typed-object";
import {
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
  type ConfigTypesExtras,
} from "@workspace/compile/config-types-source";

import { loadProjectConfigFromDir } from "./project-config";
import { activeAgentNames, activeProjectAgentNames } from "./scope-predicates";

/**
 * The half of the types writer that reads the machine: whether a global types file exists to
 * extend, the relative specifier to it, and the write itself. Split out from
 * `config-types-writer.ts` when the renderers moved into `@workspace/compile` — those three were
 * the whole reason that module reached `fileExists`, `writeFile`, `loadProjectConfigFromDir` and
 * `globalInstallRoot`, and a browser has none of them. `config-types-writer.ts` re-exports every
 * name below, so no call site moved.
 */

/**
 * Returns the absolute path to the global config-types.ts if it exists, or null.
 * Used to determine whether a project config-types.ts should import from global.
 */
export async function getGlobalConfigTypesPath(): Promise<string | null> {
  const globalConfigTypesPath = path.join(
    globalInstallRoot(),
    CLAUDE_SRC_DIR,
    STANDARD_FILES.CONFIG_TYPES_TS,
  );
  if (await fileExists(globalConfigTypesPath)) {
    return globalConfigTypesPath;
  }
  return null;
}

/**
 * Computes a relative import path from a project's .claude-src/ to the global .claude-src/.
 * Returns a POSIX-style relative path suitable for TypeScript import statements.
 *
 * Deliberately NOT part of the shared package: it is `path.relative` against the running
 * machine's `$HOME`, so a browser has nothing to compute it from and the preview draws a
 * placeholder for that one line instead of inventing a path.
 */
function computeGlobalTypesImportPath(projectDir: string): string {
  const projectClaudeSrc = path.join(projectDir, CLAUDE_SRC_DIR);
  const globalClaudeSrc = path.join(globalInstallRoot(), CLAUDE_SRC_DIR);
  const relativePath = path.relative(projectClaudeSrc, globalClaudeSrc);
  // Convert to POSIX separators for TypeScript imports
  return relativePath.split(path.sep).join("/");
}

export type ConfigTypesBackgroundData = {
  matrix: MergedSkillsMatrix;
  agentNames: AgentName[];
  customAgentNames: AgentName[];
};

/**
 * The one constructor for {@link ConfigTypesBackgroundData}, beside the type it builds.
 *
 * Only `customAgentNames` is derived, and that derivation is the whole reason this is a function
 * rather than an object literal at each call site: it was written out three times — here, in
 * `config-gate/pair-writer.ts` and in `config-gate/propagate.ts` — and three producers of one
 * value are three things that can disagree about which sub-agents an emitted `AgentName` union
 * files under its `// Custom` heading. Closing two of the three would have been worse than
 * closing none: the two that agree make the third read as rigorous while it drifts.
 */
export function buildConfigTypesBackgroundData(
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): ConfigTypesBackgroundData {
  const agentNames = typedKeys<AgentName>(agents);
  return {
    matrix,
    agentNames,
    customAgentNames: agentNames.filter((name) => agents[name]?.custom === true),
  };
}

/**
 * Regenerates config-types.ts with the latest matrix data, merging in any extra entities
 * that were just created (e.g., a new skill or agent). Errors propagate to callers.
 *
 * @param projectDir The project root directory
 * @param backgroundData Promise of the data {@link buildConfigTypesBackgroundData} assembles
 * @param extras Optional extra skill IDs or agent names to include (for just-created entities)
 */
export async function regenerateConfigTypes(
  projectDir: string,
  backgroundData: Promise<ConfigTypesBackgroundData>,
  extras?: ConfigTypesExtras,
): Promise<void> {
  // The home directory's config-types.ts is the global pair's types half, which
  // only config-gate may write. Refusing here rather than leaving it to the
  // write primitive's tripwire names the offending entry point, and — unlike the
  // tripwire — survives a unit test that mocks `utils/fs`.
  if (isHomeDirectory(projectDir)) {
    throw new GlobalPairWriteViolation(
      path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS),
    );
  }

  const data = await backgroundData;

  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  // When a global installation exists and we're regenerating for a project,
  // generate a project config-types.ts that imports from the global one
  const isProjectScope = !isHomeDirectory(projectDir);
  const globalConfigTypes = isProjectScope ? await getGlobalConfigTypesPath() : null;
  const loadedConfig = await loadProjectConfigFromDir(projectDir);

  let source: string;
  if (globalConfigTypes) {
    const agents = loadedConfig?.config.agents;
    const selectedAgentNames = agents ? activeAgentNames(agents) : undefined;
    const projectScopedAgentNames = agents ? activeProjectAgentNames(agents) : undefined;
    source = generateProjectConfigTypesSource({
      globalTypesImportPath: computeGlobalTypesImportPath(projectDir),
      projectSkillIds: extras?.extraSkillIds ?? [],
      projectAgentNames: extras?.extraAgentNames ?? [],
      projectDomains: extras?.extraDomains ?? [],
      projectCategories: extras?.extraCategories ?? [],
      ...(selectedAgentNames?.length ? { selectedAgentNames } : {}),
      ...(projectScopedAgentNames?.length ? { projectScopedAgentNames } : {}),
    });
    verbose("Using project config-types.ts that imports from global");
  } else {
    // Narrowed to the config on disk, exactly as the wizard write path narrows the
    // standalone form. The full matrix is the fallback only when there is no config
    // to narrow to — a union covering every skill the source offers would declare
    // literals the sibling config.ts never installs, and `satisfies` would stop
    // catching a config that names one of them.
    source = generateConfigTypesSource(
      data.matrix,
      data.agentNames,
      data.customAgentNames,
      extras,
      loadedConfig?.config,
    );
  }

  const configTypesPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TYPES_TS);
  await writeFile(configTypesPath, source);
  verbose(`Regenerated ${STANDARD_FILES.CONFIG_TYPES_TS}`);
}
