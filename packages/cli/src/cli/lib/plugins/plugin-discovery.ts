/**
 * The plugin READ path: what is installed and switched on for one project, and the skills in it.
 *
 * **It goes through {@link hostAt}, which is the half C3 left out.** The seam declared
 * `PluginHost.listPlugins` and then wired nobody to it, so the module that actually answers "what
 * plugins does this project have" went on reading Claude's `installed_plugins.json` and Claude's
 * `settings.json` by hand. A seam with a hole in it is worse than no seam: every caller below —
 * the multi-source loader, the agent recompiler, `edit`, `uninstall` and `doctor` — reads as
 * host-agnostic while being wired to one host.
 *
 * The verbs above it are unchanged and so are their signatures; what moved is where the two files
 * are read, which is now the host's own business.
 */

import type { SkillDefinitionMap } from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { fileExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries } from "../../utils/typed-object";
import { hostAt } from "../hosts/host-for.js";
import { loadPluginSkills } from "../loading";
import { getPluginManifestPath } from "./plugin-finder";
import type { ResolvedPlugin } from "./plugin-settings";

/**
 * The enabled plugins of the installation under `projectDir` that are really on disk.
 *
 * Three questions, and the host answers the first two: what it has installed, and which of those
 * this project has switched on. The third — whether the recorded directory still holds a plugin
 * manifest — stays here, because a cache directory that has been deleted underneath a registry is
 * a fact about the filesystem rather than about the host.
 *
 * **It answers `[]` rather than throwing, and that is deliberate, not an oversight.** `doctor`
 * reads it to say which configured skills are missing, and a registry it cannot parse must
 * surface as that row's own finding rather than as an aborted check; the discovery verbs below
 * degrade the same way. The host throws for a registry that is present and unreadable, so the
 * swallow lives here, at the one place that has decided to degrade.
 */
export async function getVerifiedPluginInstallPaths(projectDir: string): Promise<ResolvedPlugin[]> {
  let enabled: ResolvedPlugin[];
  try {
    const installed = await hostAt(projectDir).listPlugins(projectDir);
    enabled = installed
      .filter((plugin) => plugin.enabled)
      .map(({ pluginKey, installPath }) => ({ pluginKey, installPath }));
  } catch (error) {
    verbose(`Failed to list installed plugins: ${getErrorMessage(error)}`);
    return [];
  }

  const onDisk = await Promise.all(enabled.map(hasManifestOnDisk));
  const verified = enabled.filter((_, index) => onDisk[index] === true);

  verbose(`Verified ${verified.length} plugin install paths`);
  return verified;
}

/** Whether the plugin's recorded directory still holds its manifest, with the miss logged. */
async function hasManifestOnDisk({ pluginKey, installPath }: ResolvedPlugin): Promise<boolean> {
  const pluginJsonPath = getPluginManifestPath(installPath);
  const manifestExists = await fileExists(pluginJsonPath);
  if (!manifestExists) {
    verbose(`Plugin '${pluginKey}' manifest does not exist at: '${pluginJsonPath}'`);
  }
  return manifestExists;
}

/**
 * Discovers all plugin-installed skills from enabled plugins.
 *
 * Asks the host under `projectDir` what it has installed and switched on, then loads skills from
 * each plugin's cache directory.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Merged map of all discovered plugin skills (later plugins override earlier)
 */
export async function discoverAllPluginSkills(projectDir: string): Promise<SkillDefinitionMap> {
  try {
    const pluginPaths = await getVerifiedPluginInstallPaths(projectDir);

    if (pluginPaths.length === 0) {
      verbose(`No enabled plugins found for '${projectDir}'`);
      return {};
    }

    const perPluginSkills = await Promise.all(pluginPaths.map(loadSkillsOfPlugin));
    return mergeInPluginOrder(perPluginSkills);
  } catch (error) {
    verbose(`Plugin discovery failed: ${getErrorMessage(error)}`);
    return {};
  }
}

/** One plugin's skills, or none — with the reason logged — when its cache cannot be read. */
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

/**
 * Every plugin's skills in one map. A later plugin overrides an earlier one on the same id — the
 * merge follows `pluginPaths` order — and an absent entry is skipped.
 */
function mergeInPluginOrder(perPluginSkills: readonly SkillDefinitionMap[]): SkillDefinitionMap {
  const allSkills: SkillDefinitionMap = {};
  for (const pluginSkills of perPluginSkills) {
    for (const [id, skill] of typedEntries(pluginSkills)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      if (skill) allSkills[id] = skill;
    }
  }
  return allSkills;
}

/**
 * Lists the keys of all enabled plugins.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of plugin keys (e.g., ["web-framework-react@acme-marketplace"])
 */
export async function listPluginNames(projectDir: string): Promise<string[]> {
  try {
    const pluginPaths = await getVerifiedPluginInstallPaths(projectDir);
    return pluginPaths.map(({ pluginKey }) => pluginKey);
  } catch (error) {
    verbose(`Failed to list plugin names: ${getErrorMessage(error)}`);
    return [];
  }
}
