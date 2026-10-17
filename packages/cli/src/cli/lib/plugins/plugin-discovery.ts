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
 * Enabled plugins whose manifest is still on disk. Degrades to `[]` on an unreadable registry, so
 * `doctor` reports it as a finding rather than an aborted check.
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

async function hasManifestOnDisk({ pluginKey, installPath }: ResolvedPlugin): Promise<boolean> {
  const pluginJsonPath = getPluginManifestPath(installPath);
  const manifestExists = await fileExists(pluginJsonPath);
  if (!manifestExists) {
    verbose(`Plugin '${pluginKey}' manifest does not exist at: '${pluginJsonPath}'`);
  }
  return manifestExists;
}

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
  try {
    const pluginPaths = await getVerifiedPluginInstallPaths(projectDir);
    return pluginPaths.map(({ pluginKey }) => pluginKey);
  } catch (error) {
    verbose(`Failed to list plugin names: ${getErrorMessage(error)}`);
    return [];
  }
}
