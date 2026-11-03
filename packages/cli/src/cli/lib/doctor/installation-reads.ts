/**
 * `doctor`'s reads of one installation, each asked of a named provider rather than the one
 * `providerInUse` picks, so one run can report on both installations a scope holds. One
 * re-expresses `unofferablePlacementsFound`, which reads the project's provider off the disk, and
 * answers as it does when the hosts are read off the disk.
 */

import os from "os";

import { ConfigLoadError, loadProjectConfigFromDir } from "../configuration/project-config.js";
import { scopeRootsInPlay } from "../installation/source-scopes.js";
import {
  configsDeclaringNothing,
  detectInstallations,
  type DetectedInstallation,
} from "../installation/detect-installations.js";
import { isHomeDirectory } from "../installation/is-home-directory.js";
import {
  declaresNoContent,
  inheritedGlobalProvider,
  providerInUse,
} from "../installation/install-layout.js";
import { placementsAskedIn, refusalsAmong } from "../hosts/configured-placements.js";
import { getPluginsBySwitch } from "../plugins/plugin-discovery.js";
import { parseMarketplacePluginRef } from "../plugins/plugin-ref.js";
import type { ResolvedPlugin } from "../plugins/plugin-settings.js";
import type { Provider } from "../../consts.js";
import type { ProjectConfig, SkillScope } from "../../types/index.js";

/**
 * The provider each scope's paths are read with: off the disk, as a run naming no provider reads
 * them, or one installation's for both, as a run naming `--provider` does. Never set as the run's
 * provider, so one doctor run can ask of each installation in turn.
 */
export type Hosts = Record<SkillScope, Provider>;

/** One installation's rows: the directory they are about and the hosts its paths resolve with. */
export type CheckedInstallation = { projectDir: string; hosts: Hosts };

/**
 * A project holding no installation is checked as the global one it inherits, whose provider it
 * takes: its own folder would answer a new one's.
 */
export async function hostsOnDisk(projectDir: string): Promise<Hosts> {
  const found = await detectInstallations(projectDir);
  if (inheritsTheGlobalInstallation(found)) return hostsOf(providerInUse(os.homedir()));

  return { project: providerInUse(projectDir), global: inheritedGlobalProvider(projectDir) };
}

function inheritsTheGlobalInstallation(found: readonly DetectedInstallation[]): boolean {
  return found.length > 0 && found.every((installation) => installation.scope === "global");
}

export function hostsOf(provider: Provider): Hosts {
  return { project: provider, global: provider };
}

/** The project's installations, or the global ones where the project holds none. */
export async function providersInPlay(projectDir: string): Promise<Provider[]> {
  const found = await detectInstallations(projectDir);
  const inTheProject = found.filter((installation) => installation.scope === "project");
  const inPlay = inTheProject.length > 0 ? inTheProject : found;
  return inPlay.map((installation) => installation.provider);
}

/**
 * Unreadable only where a scope holds two installations: the content layer reads the configs in
 * use, so a broken one of those has already stood the operational layer down. An inherited config
 * carries the folder of the one the project holds declaring nothing, `null` where it holds none.
 * `global-unreadable` carries the project's own config, which the rows not reading the global one
 * still read.
 */
export type ConfigState =
  | { kind: "absent" }
  | { kind: "unreadable"; failure: ConfigLoadError }
  | { kind: "global-unreadable"; config: ProjectConfig; failure: ConfigLoadError }
  | { kind: "declares-nothing"; config: ProjectConfig }
  | { kind: "loaded"; config: ProjectConfig; inherited: false }
  | {
      kind: "loaded";
      config: ProjectConfig;
      inherited: true;
      declaringNothingIn: Provider | null;
    };

/** The project's own config, else the global one it inherits, each read with its scope's host. */
export async function resolveConfigState({
  projectDir,
  hosts,
}: CheckedInstallation): Promise<ConfigState> {
  try {
    return await readConfigState(projectDir, hosts);
  } catch (error) {
    if (error instanceof ConfigLoadError) return { kind: "unreadable", failure: error };
    throw error;
  }
}

async function readConfigState(projectDir: string, hosts: Hosts): Promise<ConfigState> {
  const own = await loadProjectConfigFromDir(projectDir, hosts.project);
  if (own && !declaresNoContent(own.config)) return ownConfigState(own.config, projectDir, hosts);

  const inherited = isHomeDirectory(projectDir)
    ? null
    : await loadProjectConfigFromDir(os.homedir(), hosts.global);
  if (inherited && !declaresNoContent(inherited.config)) {
    return {
      kind: "loaded",
      config: inherited.config,
      inherited: true,
      declaringNothingIn: await providerDeclaringNothingIn(projectDir),
    };
  }

  return own ? { kind: "declares-nothing", config: own.config } : { kind: "absent" };
}

/** The placements read the global config beside the project's own, so it must load too. */
async function ownConfigState(
  config: ProjectConfig,
  projectDir: string,
  hosts: Hosts,
): Promise<ConfigState> {
  const failure = isHomeDirectory(projectDir) ? null : await globalConfigLoadFailure(hosts);
  return failure === null
    ? { kind: "loaded", config, inherited: false }
    : { kind: "global-unreadable", config, failure };
}

async function globalConfigLoadFailure(hosts: Hosts): Promise<ConfigLoadError | null> {
  try {
    await loadProjectConfigFromDir(os.homedir(), hosts.global);
    return null;
  } catch (error) {
    if (error instanceof ConfigLoadError) return error;
    throw error;
  }
}

/** Any provider's: the project's leftover config need not be the inherited installation's. */
async function providerDeclaringNothingIn(projectDir: string): Promise<Provider | null> {
  const [leftover] = await configsDeclaringNothing(projectDir);
  return leftover === undefined ? null : leftover.provider;
}

/** A plugin's skill ids by its switch; none at all from a registry the host cannot read. */
export type InstalledPluginSkillIds = {
  /** Only those whose manifest is still on disk. */
  enabled: ReadonlySet<string>;
  switchedOff: ReadonlySet<string>;
};

export async function installedPluginSkillIds(
  baseDir: string,
  provider: Provider,
): Promise<InstalledPluginSkillIds> {
  const { enabled, switchedOff } = await getPluginsBySwitch(baseDir, provider);
  return { enabled: skillIdsOf(enabled), switchedOff: skillIdsOf(switchedOff) };
}

function skillIdsOf(plugins: readonly ResolvedPlugin[]): ReadonlySet<string> {
  return new Set(plugins.map((plugin) => parseMarketplacePluginRef(plugin.pluginKey)));
}

/** What one installation's configs ask its hosts to place: whether any skill, and each refusal. */
export type PlacementsOffered = { configuresASkill: boolean; findings: string[] };

/**
 * `unofferablePlacementsFound` asked of each scope's named host: both scopes, each refused by its
 * own host, since the two can be on different providers. Project first, as that one walks them.
 */
export async function placementsOffered({
  projectDir,
  hosts,
}: CheckedInstallation): Promise<PlacementsOffered> {
  const projectFirst = [...scopeRootsInPlay(projectDir)].reverse();
  const asked = await Promise.all(
    projectFirst.map(({ kind, root }) => placementsAskedIn({ dir: root, provider: hosts[kind] })),
  );
  return {
    configuresASkill: asked.some(({ skills }) => skills.length > 0),
    findings: refusalsAmong(asked),
  };
}
