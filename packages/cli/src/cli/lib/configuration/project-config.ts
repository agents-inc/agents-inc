import os from "os";
import path from "path";
import type { z } from "zod";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import type { Provider } from "../../consts";
import type { ProjectConfig, ValidationResult } from "../../types";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { projectConfigLoaderSchema } from "../schemas";
import { formatZodErrors } from "../schema-validator";
import { getProjectConfigPath } from "../installation/install-base-dir";
import {
  declaresNoContent,
  inheritedGlobalProvider,
  providerInUse,
} from "../installation/install-layout";
import { initProviderToNameAt, providerToNameAt } from "../installation/provider-to-name";
import { isHomeDirectory } from "../installation/is-home-directory";
import type { ScopeKind } from "../installation/source-scopes";
import { loadConfig, NO_VALID_DEFAULT_EXPORT } from "./config-loader";

export type LoadedProjectConfig = {
  config: ProjectConfig;
  configPath: string;
  /** Carried on the read because only the folder records it. */
  provider: Provider;
};

/**
 * A config that exists but cannot be loaded; never collapse it into the `null` of a missing file.
 */
export class ConfigLoadError extends Error {
  readonly scope: ScopeKind;
  /** Named with `--provider` in a remedy handed out for this installation; beside another only. */
  readonly providerToName: Provider | undefined;
  /** Named in the remedy's `init --from` half, which a bare run would answer with another one. */
  readonly initProviderToName: Provider | undefined;

  constructor(
    readonly configPath: string,
    readonly reason: string,
    /** The directory whose installation this config is: a project, or the home directory. */
    readonly scopeRoot: string,
    provider: Provider,
  ) {
    super(`Config at '${configPath}' could not be loaded: ${reason}`);
    this.name = "ConfigLoadError";
    this.scope = isHomeDirectory(scopeRoot) ? "global" : "project";
    this.providerToName = providerToNameAt(scopeRoot, provider);
    this.initProviderToName = initProviderToNameAt(scopeRoot, provider);
  }
}

/**
 * {@link declaresNoContent} of the config at `projectDir`, read without a load's warnings, since
 * the roster asks it on every read. Throws `ConfigLoadError` as a load does.
 */
export async function configDeclaresNothing(
  projectDir: string,
  provider: Provider,
): Promise<boolean> {
  const configPath = getProjectConfigPath(projectDir, provider);
  const parsed = await parseConfigFile(configPath, refusalAt(configPath, projectDir, provider));
  return declaresNoContent({ skills: parsed.skills ?? [], agents: parsed.agents ?? [] });
}

/** `null` only when the file is absent; throws `ConfigLoadError` when it exists but cannot load. */
export async function loadProjectConfigFromDir(
  projectDir: string,
  provider: Provider,
): Promise<LoadedProjectConfig | null> {
  return loadProjectConfigAt(getProjectConfigPath(projectDir, provider), projectDir, provider);
}

/** As `loadProjectConfigFromDir`, at a path the caller names rather than the resolver's pick. */
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

  // The file exists: from here any failure is a ConfigLoadError, never `null`.
  const parsed = await parseConfigFile(configPath, refusalAt(configPath, projectDir, provider));
  const config = asProjectConfig(parsed, projectDir);
  warnOfDefaultedFields(parsed, configPath);

  verbose(`Loaded ${scope} config from ${configPath}`);
  return {
    config,
    configPath,
    provider,
  };
}

type ParsedProjectConfig = z.infer<typeof projectConfigLoaderSchema>;

function refusalAt(
  configPath: string,
  projectDir: string,
  provider: Provider,
): (reason: string) => ConfigLoadError {
  return (reason) => new ConfigLoadError(configPath, reason, projectDir, provider);
}

/** The file's default export, held to the lenient loader schema. */
async function parseConfigFile(
  configPath: string,
  refuse: (reason: string) => ConfigLoadError,
): Promise<ParsedProjectConfig> {
  let raw: unknown;
  try {
    raw = await loadConfig<ProjectConfig>(configPath);
  } catch (error) {
    throw refuse(getErrorMessage(error));
  }

  if (!raw || typeof raw !== "object") throw refuse(NO_VALID_DEFAULT_EXPORT);

  const result = projectConfigLoaderSchema.safeParse(raw);
  if (!result.success) throw refuse(formatZodErrors(result.error).join("; "));
  return result.data;
}

/** Normalizes the stack before claiming ProjectConfig, so the cast below is the only one. */
function asProjectConfig(parsed: ParsedProjectConfig, projectDir: string): ProjectConfig {
  const normalizedStack = parsed.stack ? normalizeStackRecord(parsed.stack) : undefined;

  // Boundary cast: the loader schema is lenient about the string unions; validateProjectConfig
  // enforces the strict shape after load.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  return {
    ...parsed,
    name: parsed.name ?? path.basename(projectDir),
    skills: parsed.skills ?? [],
    agents: parsed.agents ?? [],
    ...(normalizedStack && { stack: normalizedStack }),
  } as ProjectConfig;
}

function warnOfDefaultedFields(parsed: ParsedProjectConfig, configPath: string): void {
  if (parsed.name === undefined) {
    warn(
      `Project config at '${configPath}' is missing required 'name' field — defaulting to directory name`,
    );
  }
  if (parsed.skills === undefined) {
    warn(`Project config at '${configPath}' is missing 'skills' array — defaulting to empty`);
  }
}

/** The config of whichever installation `dir` holds, read off the folder. */
export async function loadInstalledConfig(dir: string): Promise<LoadedProjectConfig | null> {
  return loadProjectConfigFromDir(dir, providerInUse(dir));
}

/** A config a run reads: the directory it sits in, and the installation's provider there. */
export type ConfigInPlay = { dir: string; provider: Provider };

/** The project's own config plus the global one it inherits; one at the home root. */
export function configsInPlay(projectDir: string): ConfigInPlay[] {
  const own: ConfigInPlay = { dir: projectDir, provider: providerInUse(projectDir) };
  if (isHomeDirectory(projectDir)) return [own];

  return [own, { dir: os.homedir(), provider: inheritedGlobalProvider(projectDir) }];
}

/** Shared by `ensureConfigReadable` and `doctor`, so both agree on which configs are in play. */
export async function findConfigLoadFailures(projectDir: string): Promise<ConfigLoadError[]> {
  const outcomes = await Promise.all(configsInPlay(projectDir).map(configLoadFailure));
  return outcomes.filter((failure): failure is ConfigLoadError => failure !== undefined);
}

async function configLoadFailure({
  dir,
  provider,
}: ConfigInPlay): Promise<ConfigLoadError | undefined> {
  try {
    await loadProjectConfigFromDir(dir, provider);
    return undefined;
  } catch (error) {
    if (error instanceof ConfigLoadError) return error;
    throw error;
  }
}

/**
 * The project's config, falling back to the global one of the same provider. `provider` names the
 * installation where `projectDir` holds two; the default is the one in use.
 */
export async function loadProjectConfig(
  projectDir: string,
  provider: Provider = providerInUse(projectDir),
): Promise<LoadedProjectConfig | null> {
  const projectResult = await loadProjectConfigFromDir(projectDir, provider);
  if (projectResult) return projectResult;
  if (isHomeDirectory(projectDir)) return null;

  return loadProjectConfigFromDir(os.homedir(), provider);
}

/**
 * As {@link loadProjectConfig}, for a run that works on an installation: a project config
 * declaring nothing is not one, so the global config stands in for it as for a missing file. HOME
 * is read off its own folder, as `detectInstallation` reads it: a project holding no installation
 * has no provider to hand on, and a leftover folder there would pick one.
 */
export async function loadConfigInPlay(projectDir: string): Promise<LoadedProjectConfig | null> {
  const own = await loadInstalledConfig(projectDir);
  if (isHomeDirectory(projectDir)) return own;
  if (own !== null && !declaresNoContent(own.config)) return own;

  return loadInstalledConfig(os.homedir());
}

/** On top of the lenient schema, a usable config also needs `name` and `agents`. */
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
