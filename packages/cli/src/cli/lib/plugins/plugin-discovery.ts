import type { SkillDefinitionMap } from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { fileExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { plural } from "../../utils/string";
import { typedEntries } from "../../utils/typed-object";
import type { Provider } from "../../consts";
import { hostFor } from "../hosts/host-for.js";
import type { HostPlugin } from "../hosts/plugin-host.js";
import { providerInUse } from "../installation/install-layout.js";
import { loadPluginSkills } from "../loading";
import { getPluginManifestPath } from "./plugin-finder";
import type { ResolvedPlugin } from "./plugin-settings";

/**
 * Enabled plugins whose manifest is still on disk. Degrades to `[]` on an unreadable registry, so
 * `doctor` reports it as a finding rather than an aborted check. `provider` names the installation
 * where `projectDir` holds two; the default is the one in use.
 */
export async function getVerifiedPluginInstallPaths(
  projectDir: string,
  provider: Provider = providerInUse(projectDir),
): Promise<ResolvedPlugin[]> {
  return (await getPluginsBySwitch(projectDir, provider)).enabled;
}

/** A switched-off plugin is named whatever its disk holds: it is left out either way. */
export type PluginsBySwitch = { enabled: ResolvedPlugin[]; switchedOff: ResolvedPlugin[] };

/** As {@link getVerifiedPluginInstallPaths}, beside the plugins Codex records as switched off. */
export async function getPluginsBySwitch(
  projectDir: string,
  provider: Provider = providerInUse(projectDir),
): Promise<PluginsBySwitch> {
  const installed = await listInstalledPlugins(projectDir, provider);
  if (installed === null) return { enabled: [], switchedOff: [] };

  return {
    enabled: await verifiedOnDisk(installed.filter((plugin) => plugin.enabled).map(toResolved)),
    switchedOff: switchedOffPlugins(installed, provider),
  };
}

/** Claude's listing cannot tell a plugin set to false from one never switched on for the project. */
function switchedOffPlugins(
  installed: readonly HostPlugin[],
  provider: Provider,
): ResolvedPlugin[] {
  if (provider !== "codex") return [];
  return installed.filter((plugin) => !plugin.enabled).map(toResolved);
}

/** Null where the host cannot list its plugins, so no "verified" count follows the failure. */
async function listInstalledPlugins(
  projectDir: string,
  provider: Provider,
): Promise<HostPlugin[] | null> {
  try {
    return await hostFor(provider).listPlugins(projectDir);
  } catch (error) {
    verbose(`Failed to list installed plugins: ${getErrorMessage(error)}`);
    return null;
  }
}

function toResolved({ pluginKey, installPath }: HostPlugin): ResolvedPlugin {
  return { pluginKey, installPath };
}

async function verifiedOnDisk(plugins: ResolvedPlugin[]): Promise<ResolvedPlugin[]> {
  const onDisk = await Promise.all(plugins.map(hasManifestOnDisk));
  const verified = plugins.filter((_, index) => onDisk[index] === true);

  verbose(`Verified ${plural(verified.length, "plugin install path")}`);
  return verified;
}

async function hasManifestOnDisk({ pluginKey, installPath }: ResolvedPlugin): Promise<boolean> {
  const pluginJsonPath = getPluginManifestPath(installPath);
  const manifestExists = await fileExists(pluginJsonPath);
  if (!manifestExists) {
    verbose(`Plugin '${pluginKey}' manifest does not exist at: '${pluginJsonPath}'`);
  }
  return manifestExists;
}

/** `provider` names the installation where `projectDir` holds two; the default is the one in use. */
export async function discoverAllPluginSkills(
  projectDir: string,
  provider: Provider = providerInUse(projectDir),
): Promise<SkillDefinitionMap> {
  const pluginPaths = await getVerifiedPluginInstallPaths(projectDir, provider);

  if (pluginPaths.length === 0) {
    verbose(`No enabled plugins found for '${projectDir}'`);
    return {};
  }

  const perPluginSkills = await Promise.all(pluginPaths.map(loadSkillsOfPlugin));
  return mergeInPluginOrder(perPluginSkills);
}

async function loadSkillsOfPlugin({
  pluginKey,
  installPath,
}: ResolvedPlugin): Promise<SkillDefinitionMap> {
  verbose(`Discovering skills from plugin: '${pluginKey}'`);
  try {
    return await loadPluginSkills(installPath);
  } catch (error) {
    verbose(`Failed to load skills from '${pluginKey}': ${getErrorMessage(error)}`);
    return {};
  }
}

/** A later plugin overrides an earlier one on the same id. */
function mergeInPluginOrder(perPluginSkills: readonly SkillDefinitionMap[]): SkillDefinitionMap {
  const allSkills: SkillDefinitionMap = {};
  for (const pluginSkills of perPluginSkills) {
    for (const [id, skill] of typedEntries(pluginSkills)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops the `| undefined` a Partial<Record> slot can hold
      if (skill) allSkills[id] = skill;
    }
  }
  return allSkills;
}

export async function listPluginNames(projectDir: string): Promise<string[]> {
  const pluginPaths = await getVerifiedPluginInstallPaths(projectDir);
  return pluginPaths.map(({ pluginKey }) => pluginKey);
}
