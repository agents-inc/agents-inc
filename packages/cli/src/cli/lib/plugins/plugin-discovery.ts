import type { SkillDefinitionMap } from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { verbose } from "../../utils/logger";
import { typedEntries } from "../../utils/typed-object";
import { loadPluginSkills } from "../loading";
import { getVerifiedPluginInstallPaths } from "./plugin-settings";

/**
 * Discovers all plugin-installed skills from enabled plugins.
 *
 * Reads `.claude/settings.json` to find enabled plugins, then looks up their
 * install paths in the global plugin registry (`~/.claude/plugins/installed_plugins.json`).
 * Loads skills from the plugin cache directories.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Merged map of all discovered plugin skills (later plugins override earlier)
 */
export async function discoverAllPluginSkills(projectDir: string): Promise<SkillDefinitionMap> {
  const allSkills: SkillDefinitionMap = {};

  try {
    const pluginPaths = await getVerifiedPluginInstallPaths(projectDir);

    if (pluginPaths.length === 0) {
      verbose(`No enabled plugins found in settings.json`);
      return allSkills;
    }

    const perPluginSkills = await Promise.all(
      pluginPaths.map(async ({ pluginKey, installPath }) => {
        verbose(`Discovering skills from plugin: '${pluginKey}'`);
        try {
          return await loadPluginSkills(installPath);
        } catch (error) {
          verbose(`Failed to load skills from '${pluginKey}': ${getErrorMessage(error)}`);
          return {};
        }
      }),
    );
    // Later plugins override earlier (merge follows pluginPaths order); skip absent entries
    for (const pluginSkills of perPluginSkills) {
      for (const [id, skill] of typedEntries(pluginSkills)) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
        if (skill) {
          allSkills[id] = skill;
        }
      }
    }
  } catch (error) {
    verbose(`Plugin discovery failed: ${getErrorMessage(error)}`);
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
