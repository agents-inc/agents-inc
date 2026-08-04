import os from "os";
import path from "path";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../../types";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../consts";
import { ensureDir, fileExists, readFile, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedKeys } from "../../utils/typed-object";
import {
  generateBlankGlobalConfigSource,
  generateBlankGlobalConfigTypesSource,
  generateConfigSource,
} from "../configuration/config-writer";
import {
  generateConfigTypesSource,
  type ConfigTypesBackgroundData,
  type ConfigTypesExtras,
} from "../configuration/config-types-writer";
import { assertGateToken } from "./gate-token.js";

/**
 * Nothing in this module MINTS the write privilege — every function below
 * REQUIRES it, and `writeIfChanged` is where that requirement is asserted. The
 * token is opened by the gate's public entry points in `index.ts`, each of which
 * wraps its whole consequence flow.
 *
 * That split is the point (D-309): a callee that opens the privilege on its own
 * behalf hands it to whoever reached it, so a caller that got past module
 * privacy — a dynamic import, a re-export added for convenience — arrived
 * already authorized and the runtime tripwire in `utils/fs.ts` waved it through.
 * Requiring the token instead makes reaching the private writer useless on its
 * own: the privilege belongs to the entry points, not to the writers.
 */

/** Absolute paths of the two halves of the global config pair. */
export type GlobalPairPaths = {
  configPath: string;
  typesPath: string;
};

/**
 * Resolves the global pair's paths. `os.homedir()` at call time, not the
 * module-load-time `GLOBAL_INSTALL_ROOT`, so the paths agree with every other
 * runtime home-dir reader and with test home mocks.
 */
export function globalPairPaths(): GlobalPairPaths {
  const dir = path.join(os.homedir(), CLAUDE_SRC_DIR);
  return {
    configPath: path.join(dir, STANDARD_FILES.CONFIG_TS),
    typesPath: path.join(dir, STANDARD_FILES.CONFIG_TYPES_TS),
  };
}

/** The types sibling of a config path — the two always share a directory. */
export function typesPathFor(configPath: string): string {
  return path.join(path.dirname(configPath), STANDARD_FILES.CONFIG_TYPES_TS);
}

/**
 * Writes `source` to `filePath` unless the file already holds exactly those
 * bytes. Both halves are derived from the same config on every write, so pair
 * coherence holds by derivation and the comparison only suppresses the mtime
 * churn a projects-only or scalar-only change would otherwise inflict on every
 * consumer watching these files. Returns true when the file was written.
 */
async function writeIfChanged(filePath: string, source: string): Promise<boolean> {
  assertGateToken(filePath);
  if ((await fileExists(filePath)) && (await readFile(filePath)) === source) return false;
  await writeFile(filePath, source);
  return true;
}

/** The union inputs the types writer derives its literals from. */
function typesDataFor(
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
): ConfigTypesBackgroundData {
  const agentNames = typedKeys(agents);
  return {
    matrix,
    agentNames,
    customAgentNames: agentNames.filter((name) => agents[name]?.custom === true),
  };
}

/**
 * Standalone (non-importing) type unions narrowed to `config`'s own entries,
 * widened by `extras` — the literals a just-created skill or agent needs before
 * it reaches the config.
 */
function renderStandaloneTypes(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  extras?: ConfigTypesExtras,
): string {
  const data = typesDataFor(matrix, agents);
  return generateConfigTypesSource(
    data.matrix,
    data.agentNames,
    data.customAgentNames,
    extras,
    config,
  );
}

/**
 * Writes the config half of the pair at `configPath`. The global config never
 * takes the project writer's import/inline options — it is the file those
 * options resolve against.
 */
export async function writeGlobalConfigHalf(
  config: ProjectConfig,
  configPath: string,
): Promise<boolean> {
  return writeIfChanged(configPath, generateConfigSource(config));
}

/** Writes the types half of the pair beside `configPath`. */
export async function writeGlobalTypesHalf(
  config: ProjectConfig,
  configPath: string,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  extras?: ConfigTypesExtras,
): Promise<boolean> {
  return writeIfChanged(
    typesPathFor(configPath),
    renderStandaloneTypes(config, matrix, agents, extras),
  );
}

/**
 * Writes the types half beside `configPath` from union inputs a caller already
 * loaded in the background, rather than from a matrix plus agent definitions.
 *
 * `config` narrows the unions to what that config installs and is optional
 * because the caller reads it off disk, where it may be absent — a scaffolded
 * marketplace has no config until this run writes one. Absent, the unions cover
 * the whole matrix, which is what the raw writer has always fallen back to.
 */
export async function writeGlobalTypesHalfFromData(
  configPath: string,
  data: ConfigTypesBackgroundData,
  config: ProjectConfig | undefined,
  extras?: ConfigTypesExtras,
): Promise<boolean> {
  return writeIfChanged(
    typesPathFor(configPath),
    generateConfigTypesSource(data.matrix, data.agentNames, data.customAgentNames, extras, config),
  );
}

/** Writes both halves from one config, so they cannot disagree. */
export async function writeGlobalPair(
  config: ProjectConfig,
  configPath: string,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
): Promise<boolean> {
  const configWritten = await writeIfChanged(configPath, generateConfigSource(config));
  const typesWritten = await writeIfChanged(
    typesPathFor(configPath),
    renderStandaloneTypes(config, matrix, agents),
  );
  return configWritten || typesWritten;
}

/**
 * Creates a blank global pair at `~/.claude-src/` when none exists: `config.ts`
 * with empty arrays and `config-types.ts` with `never` unions. Returns true when
 * the files were created, false when they already existed.
 */
export async function ensureBlankPair(): Promise<boolean> {
  const { configPath, typesPath } = globalPairPaths();

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
