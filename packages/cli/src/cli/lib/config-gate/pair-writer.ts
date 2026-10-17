import os from "os";
import path from "path";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../../types";
import type { Provider } from "../../consts";
import { STANDARD_FILES } from "../../consts";
import { sourceFolderInUse } from "../installation/install-layout";
import { ensureDir, fileExists, readFile, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import {
  generateBlankGlobalConfigSource,
  generateConfigSource,
} from "../configuration/config-writer";
import {
  buildConfigTypesBackgroundData,
  generateBlankGlobalConfigTypesSource,
  generateConfigTypesSource,
  type ConfigTypesExtras,
} from "../configuration/config-types-writer";
import { matrix as activeMatrix } from "../matrix/matrix-provider";
import { assertGateToken } from "./gate-token.js";

/**
 * Nothing here mints the write privilege: every writer requires it (asserted in `writeIfChanged`)
 * and only the gate's entry points in `index.ts` open it.
 */

export type GlobalPairPaths = {
  configPath: string;
  typesPath: string;
};

/** `os.homedir()` at call time, so the paths agree with test home mocks. */
export function globalPairPaths(provider: Provider): GlobalPairPaths {
  const dir = sourceFolderInUse(os.homedir(), provider).dir;
  return {
    configPath: path.join(dir, STANDARD_FILES.CONFIG_TS),
    typesPath: path.join(dir, STANDARD_FILES.CONFIG_TYPES_TS),
  };
}

/** The types sibling of a config path — the two always share a directory. */
export function typesPathFor(configPath: string): string {
  return path.join(path.dirname(configPath), STANDARD_FILES.CONFIG_TYPES_TS);
}

/** Skips identical bytes to spare watchers mtime churn; true when written. */
async function writeIfChanged(filePath: string, source: string): Promise<boolean> {
  assertGateToken(filePath);
  if ((await fileExists(filePath)) && (await readFile(filePath)) === source) return false;
  await writeFile(filePath, source);
  return true;
}

/** Unions narrowed to `config`'s entries, widened by `extras` for a just-created skill or agent. */
function renderStandaloneTypes(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  extras?: ConfigTypesExtras,
): string {
  const data = buildConfigTypesBackgroundData(matrix, agents);
  return generateConfigTypesSource(
    data.matrix,
    data.agentNames,
    data.customAgentNames,
    extras,
    config,
  );
}

/** Reads the singleton catalogue: its caller writes this half before any catalogue is loaded. */
export async function writeGlobalConfigHalf(
  config: ProjectConfig,
  configPath: string,
): Promise<boolean> {
  return writeIfChanged(configPath, generateConfigSource(config, activeMatrix));
}

export async function writeGlobalTypesHalf(
  config: ProjectConfig,
  configPath: string,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  extras?: ConfigTypesExtras,
): Promise<boolean> {
  return writeIfChanged(
    typesPathFor(configPath),
    renderStandaloneTypes(config, matrix, agents, extras),
  );
}

/** Both halves from one config and one catalogue, so they cannot disagree. */
export async function writeGlobalPair(
  config: ProjectConfig,
  configPath: string,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Promise<boolean> {
  const configWritten = await writeIfChanged(configPath, generateConfigSource(config, matrix));
  const typesWritten = await writeIfChanged(
    typesPathFor(configPath),
    renderStandaloneTypes(config, matrix, agents),
  );
  return configWritten || typesWritten;
}

/** Creates a blank pair (empty arrays, `never` unions) when none exists; true when created. */
export async function ensureBlankPair(provider: Provider): Promise<boolean> {
  const { configPath, typesPath } = globalPairPaths(provider);

  if (await fileExists(configPath)) {
    verbose("Global config already exists, skipping blank creation");
    return false;
  }

  await ensureDir(path.dirname(configPath));

  await writeIfChanged(configPath, generateBlankGlobalConfigSource());
  await writeIfChanged(typesPath, generateBlankGlobalConfigTypesSource());

  verbose(`Created blank global config at ${path.dirname(configPath)}`);
  return true;
}
