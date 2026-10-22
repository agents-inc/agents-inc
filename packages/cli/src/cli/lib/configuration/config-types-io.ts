import path from "path";

import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../../types";
import type { Provider } from "../../consts";
import { globalInstallRoot, STANDARD_FILES } from "../../consts";
// Imported by exception (eslint records it): `gate-token.ts` is a dependency-free leaf.
import { GlobalPairWriteViolation } from "../config-gate/gate-token.js";
import { providerInUse, sourceFolderInUse } from "../installation/install-layout";
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

/** The provider is the asking project's: a project inherits only from its own provider's global. */
async function getGlobalConfigTypesPath(provider: Provider): Promise<string | null> {
  const globalConfigTypesPath = path.join(
    sourceFolderInUse(globalInstallRoot(), provider).dir,
    STANDARD_FILES.CONFIG_TYPES_TS,
  );
  if (await fileExists(globalConfigTypesPath)) {
    return globalConfigTypesPath;
  }
  return null;
}

/** POSIX specifier to the provider's global types; machine-specific, so not shared. */
function computeGlobalTypesImportPath(projectDir: string, provider: Provider): string {
  const projectSourceDir = sourceFolderInUse(projectDir, provider).dir;
  const globalSourceDir = sourceFolderInUse(globalInstallRoot(), provider).dir;
  const relativePath = path.relative(projectSourceDir, globalSourceDir);
  return relativePath.split(path.sep).join("/");
}

export type ConfigTypesBackgroundData = {
  matrix: MergedSkillsMatrix;
  agentNames: AgentName[];
  customAgentNames: AgentName[];
};

/** The one constructor, so every emitted `AgentName` union agrees on which agents are custom. */
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

/** Adds `extras` (just-created skills or agents) to the regenerated unions. Errors propagate. */
export async function regenerateConfigTypes(
  projectDir: string,
  backgroundData: Promise<ConfigTypesBackgroundData>,
  extras?: ConfigTypesExtras,
): Promise<void> {
  // One provider for every path built below: they must all name one installation.
  const provider = providerInUse(projectDir);
  const configTypesPath = path.join(
    sourceFolderInUse(projectDir, provider).dir,
    STANDARD_FILES.CONFIG_TYPES_TS,
  );

  // The gate token every caller holds lifts the `utils/fs` refusal, so this is the one they meet.
  if (isHomeDirectory(projectDir)) throw new GlobalPairWriteViolation(configTypesPath);

  const [data, globalConfigTypes, loadedConfig] = await Promise.all([
    backgroundData,
    getGlobalConfigTypesPath(provider),
    loadProjectConfigFromDir(projectDir, provider),
  ]);

  // Otherwise standalone, narrowed to the config: full unions would stop `satisfies` biting.
  const source = globalConfigTypes
    ? renderTypesExtendingGlobal(projectDir, provider, loadedConfig?.config.agents, extras)
    : generateConfigTypesSource(
        data.matrix,
        data.agentNames,
        data.customAgentNames,
        extras,
        loadedConfig?.config,
      );

  await writeFile(configTypesPath, source);
  verbose(`Regenerated ${STANDARD_FILES.CONFIG_TYPES_TS}`);
}

function renderTypesExtendingGlobal(
  projectDir: string,
  provider: Provider,
  agents: ProjectConfig["agents"] | undefined,
  extras: ConfigTypesExtras | undefined,
): string {
  const selectedAgentNames = agents ? activeAgentNames(agents) : undefined;
  const projectScopedAgentNames = agents ? activeProjectAgentNames(agents) : undefined;
  const source = generateProjectConfigTypesSource({
    globalTypesImportPath: computeGlobalTypesImportPath(projectDir, provider),
    projectSkillIds: extras?.extraSkillIds ?? [],
    projectAgentNames: extras?.extraAgentNames ?? [],
    projectDomains: extras?.extraDomains ?? [],
    projectCategories: extras?.extraCategories ?? [],
    ...(selectedAgentNames?.length ? { selectedAgentNames } : {}),
    ...(projectScopedAgentNames?.length ? { projectScopedAgentNames } : {}),
  });
  verbose("Using project config-types.ts that imports from global");
  return source;
}
