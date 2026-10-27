import type { Provider } from "../../consts.js";
import { PROVIDERS } from "../../consts.js";
import { fileExists } from "../../utils/fs.js";
import { ConfigLoadError, configDeclaresNothing } from "../configuration/project-config.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { declaresNothingAsLastRead, recordWhetherItDeclaresNothing } from "./install-layout.js";
import { scopeRootsInPlay, type ScopeKind, type ScopeRoot } from "./source-scopes.js";

export type DetectedInstallation = {
  provider: Provider;
  scope: ScopeKind;
  configPath: string;
};

type ConfigOnDisk = DetectedInstallation & { root: string };

type ConfigRead = ConfigOnDisk & { declaresNothingInAProject: boolean };

/**
 * Global before project, roster order within a scope. A folder holding `config.ts` counts, except
 * a project's whose config declares nothing (owner, 2026-10-24); a scope holding both providers
 * yields two entries.
 */
export async function detectInstallations(cwd: string): Promise<DetectedInstallation[]> {
  const configs = await configsRead(cwd);
  return configs.filter((config) => !config.declaresNothingInAProject).map(asInstallation);
}

/** A project's configs that declare nothing: a file is there, and no installation. */
export async function configsDeclaringNothing(cwd: string): Promise<DetectedInstallation[]> {
  const configs = await configsRead(cwd);
  return configs.filter((config) => config.declaresNothingInAProject).map(asInstallation);
}

export async function holdsAConfigDeclaringNothing(cwd: string): Promise<boolean> {
  return (await configsDeclaringNothing(cwd)).length > 0;
}

async function configsRead(cwd: string): Promise<ConfigRead[]> {
  const everywhereOneCouldBe = scopeRootsInPlay(cwd).flatMap(everyProviderUnder);
  const found = await Promise.all(everywhereOneCouldBe.map(configIfPresent));
  const onDisk = found.filter((config): config is ConfigOnDisk => config !== null);

  return Promise.all(onDisk.map(withWhetherItDeclaresNothing));
}

function everyProviderUnder({ kind, root }: ScopeRoot): ConfigOnDisk[] {
  return PROVIDERS.map((provider) => ({
    provider,
    scope: kind,
    root,
    configPath: getProjectConfigPath(root, provider),
  }));
}

async function configIfPresent(candidate: ConfigOnDisk): Promise<ConfigOnDisk | null> {
  return (await fileExists(candidate.configPath)) ? candidate : null;
}

async function withWhetherItDeclaresNothing(config: ConfigOnDisk): Promise<ConfigRead> {
  return { ...config, declaresNothingInAProject: await declaresNothingInAProject(config) };
}

/**
 * HOME's config counts however empty: the global folder is the user's placeholder. Degrades: a
 * config that cannot be loaded still counts, as `holdsItsOwnInstallation` holds; the command's
 * own read reports it. Recorded for `providerInUse`, which cannot load a config itself.
 */
async function declaresNothingInAProject(config: ConfigOnDisk): Promise<boolean> {
  if (config.scope === "global") return false;

  const asRead = declaresNothingAsLastRead(config.configPath);
  if (asRead !== undefined) return asRead;

  try {
    const declaresNothing = await configDeclaresNothing(config.root, config.provider);
    recordWhetherItDeclaresNothing(config.configPath, declaresNothing);
    return declaresNothing;
  } catch (error) {
    if (error instanceof ConfigLoadError) return false;
    throw error;
  }
}

function asInstallation({ provider, scope, configPath }: ConfigRead): DetectedInstallation {
  return { provider, scope, configPath };
}
