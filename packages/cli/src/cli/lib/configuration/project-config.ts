import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import type { Provider } from "../../consts";
import type { ProjectConfig, ValidationResult } from "../../types";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { projectConfigLoaderSchema } from "../schemas";
import { formatZodErrors } from "../schema-validator";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { providerInUse } from "../installation/install-layout";
import { isHomeDirectory } from "../installation/is-home-directory";
import type { ScopeKind } from "../installation/source-scopes";
import { loadConfig, NO_VALID_DEFAULT_EXPORT } from "./config-loader";

export type LoadedProjectConfig = {
  config: ProjectConfig;
  configPath: string;
  /**
   * Which installation this config was read out of.
   *
   * It says which installation the caller is holding, never which folder name it was found
   * under: a pre-rename `.claude-src/` answers `claude` exactly as `.agents-inc/claude/` does.
   * Carried on the read because nothing inside the file records it — the folder is the only
   * record — so a caller that has to write back, compile, or name a host directory would
   * otherwise have to re-derive the provider and could derive a different one.
   */
  provider: Provider;
};

/**
 * Thrown when a project config file exists on disk but cannot be loaded into a
 * usable config — a syntax/evaluation error, no default export, or a shape the
 * loader schema rejects. This is deliberately distinct from a MISSING file
 * (which is a legitimate `null`): a corrupt config is an error that callers must
 * surface, never swallow into `null`. Collapsing both into `null` let a broken
 * install pass as absent (e.g. `compile` treating it as config-less and
 * resurrecting every built-in agent).
 *
 * It carries whose installation the file is, because a refusal read from a project can be about
 * either config the project uses, and the way out — `uninstall`, then `init` — is run from the
 * folder holding the broken one: the home directory for the global config.
 */
export class ConfigLoadError extends Error {
  readonly scope: ScopeKind;

  constructor(
    readonly configPath: string,
    readonly reason: string,
    /** The directory whose installation this config is: a project, or the home directory. */
    readonly scopeRoot: string,
  ) {
    super(`Config at '${configPath}' could not be loaded: ${reason}`);
    this.name = "ConfigLoadError";
    this.scope = isHomeDirectory(scopeRoot) ? "global" : "project";
  }
}

/**
 * Load project config from a specific directory only (no global fallback).
 *
 * Returns `null` only when the config file does not exist. When the file exists
 * but cannot be parsed into a usable config, throws {@link ConfigLoadError} —
 * the caller decides how to report it.
 *
 * The two lines it announces name the scope of the file it read, the way
 * `loadSourceConfig`'s already do: the config at the home root is the GLOBAL one,
 * and a run there that calls it a project config names a file that is not there.
 */
export async function loadProjectConfigFromDir(
  projectDir: string,
  provider: Provider,
): Promise<LoadedProjectConfig | null> {
  return loadProjectConfigAt(getProjectConfigPath(projectDir, provider), projectDir, provider);
}

/**
 * {@link loadProjectConfigFromDir} for a config at a path the caller names rather than the one the
 * resolver picks — the second of a scope's two source folders, which the resolver never reads.
 * Same contract: `null` only when the file is absent, {@link ConfigLoadError} when it is there and
 * cannot be loaded.
 */
export async function loadProjectConfigAt(
  configPath: string,
  projectDir: string,
  provider: Provider,
): Promise<LoadedProjectConfig | null> {
  const scope = isHomeDirectory(projectDir) ? "global" : "project";
  const scopeLabel = scope === "project" ? "Project" : "Global";

  if (!(await fileExists(configPath))) {
    verbose(`${scopeLabel} config not found at ${configPath}`);
    return null;
  }

  // The file exists. From here, any failure to produce a usable config means the
  // file is corrupt — surface it as ConfigLoadError rather than returning `null`,
  // which is indistinguishable from "missing".
  let raw: unknown;
  try {
    // Load raw object and validate with Zod (lenient schema accepts custom values via z.string() casts)
    raw = await loadConfig<ProjectConfig>(configPath);
  } catch (error) {
    throw new ConfigLoadError(configPath, getErrorMessage(error), projectDir);
  }

  if (!raw || typeof raw !== "object") {
    throw new ConfigLoadError(configPath, NO_VALID_DEFAULT_EXPORT, projectDir);
  }

  const result = projectConfigLoaderSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigLoadError(configPath, formatZodErrors(result.error).join("; "), projectDir);
  }

  // Normalize the loose stack values (bare strings, objects, arrays) BEFORE claiming
  // ProjectConfig, so the boundary cast below is the only one on this path.
  const parsed = result.data;
  const normalizedStack = parsed.stack ? normalizeStackRecord(parsed.stack) : undefined;
  if (parsed.name === undefined) {
    warn(
      `Project config at '${configPath}' is missing required 'name' field — defaulting to directory name`,
    );
  }
  if (parsed.skills === undefined) {
    warn(`Project config at '${configPath}' is missing 'skills' array — defaulting to empty`);
  }

  // The defaults are applied here rather than mutated in afterwards, so the cast is the
  // last thing that happens and ProjectConfig's required fields are genuinely present.
  // `agents` is defaulted for the same reason `skills` is: the loader schema admits its
  // absence, ProjectConfig declares it required, and every caller was paying for the gap
  // with a `?? []` the type said was dead.
  //
  // Boundary cast: the loader schema is lenient about the string unions (category, slug,
  // domain), so the literal still does not satisfy ProjectConfig even with the defaults in
  // place; validateProjectConfig enforces the strict shape after load.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  const config = {
    ...parsed,
    name: parsed.name ?? path.basename(projectDir),
    skills: parsed.skills ?? [],
    agents: parsed.agents ?? [],
    ...(normalizedStack && { stack: normalizedStack }),
  } as ProjectConfig;

  verbose(`Loaded ${scope} config from ${configPath}`);
  return {
    config,
    configPath,
    provider,
  };
}

/**
 * The config of whichever installation `dir` holds, read off the folder.
 *
 * The sibling of `getInstalledConfigPath`, and the form every caller that holds a directory and
 * no provider wants: the alternative is that same resolution written out at each of them, which
 * is one concept with several definitions and no name.
 */
export async function loadInstalledConfig(dir: string): Promise<LoadedProjectConfig | null> {
  return loadProjectConfigFromDir(dir, providerInUse(dir));
}

/**
 * The directories whose config a run reads: the project's own, plus the global one it
 * inlines. At the home root the two collapse into one.
 */
export function configDirsInPlay(projectDir: string): string[] {
  return isHomeDirectory(projectDir) ? [projectDir] : [projectDir, os.homedir()];
}

/**
 * Every config a run would read that exists and cannot be loaded, in the order the run reads
 * them. A directory whose config is absent (legitimate) or loads contributes nothing; any other
 * failure is a real fault and propagates.
 *
 * Exported rather than kept private to its first caller because two surfaces have to agree on
 * exactly which configs are in play: `BaseCommand.ensureConfigReadable`, which refuses to run over
 * one it cannot read, and `doctor`, which reports the same fault. Two answers to that question is
 * how the CLI ended up refusing a file in one command and calling it missing in another.
 */
export async function findConfigLoadFailures(projectDir: string): Promise<ConfigLoadError[]> {
  const outcomes = await Promise.all(configDirsInPlay(projectDir).map(configLoadFailure));
  return outcomes.filter((failure): failure is ConfigLoadError => failure !== undefined);
}

async function configLoadFailure(dir: string): Promise<ConfigLoadError | undefined> {
  try {
    await loadInstalledConfig(dir);
    return undefined;
  } catch (error) {
    if (error instanceof ConfigLoadError) return error;
    throw error;
  }
}

/**
 * Load the config of the installation this run is about: the project's own, falling back to the
 * global one.
 *
 * **The fallback stays inside one provider, and the provider is read off the project rather than
 * passed in.** Each provider family inherits only within itself — the owner's ruling, and what
 * `.agents-inc/claude/` beside `.agents-inc/codex/` means — so a Codex project under a Claude
 * global inherits nothing, exactly as it would if the global were absent.
 *
 * The provider is resolved here rather than at each of the dozen callers because every one of
 * them holds a project directory and nothing else: twelve copies of the same resolution is twelve
 * places for it to drift, and the answer comes back on {@link LoadedProjectConfig.provider} for
 * the callers that need it. A caller that knows which installation it wants asks
 * {@link loadProjectConfigFromDir} by name instead.
 */
export async function loadProjectConfig(projectDir: string): Promise<LoadedProjectConfig | null> {
  const provider = providerInUse(projectDir);
  const projectResult = await loadProjectConfigFromDir(projectDir, provider);
  if (projectResult) return projectResult;

  // Global fallback: try home directory
  const homeDir = os.homedir();
  if (!isHomeDirectory(projectDir)) {
    return loadProjectConfigFromDir(homeDir, provider);
  }

  return null;
}

/**
 * Validates a loaded config value. Shape validity is defined by
 * `projectConfigLoaderSchema` (the single definition); on top of the schema's
 * lenient shape, a usable project config additionally requires `name` and
 * `agents` to be present.
 */
export function validateProjectConfig(config: unknown): ValidationResult {
  const result = projectConfigLoaderSchema.safeParse(config);
  if (!result.success) {
    return { valid: false, errors: formatZodErrors(result.error), warnings: [] };
  }

  const errors = [
    ...(result.data.name ? [] : ["name is required and must be a string"]),
    ...(result.data.agents ? [] : ["agents is required and must be an array"]),
  ];
  return { valid: errors.length === 0, errors, warnings: [] };
}
