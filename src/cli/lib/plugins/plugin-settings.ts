import path from "path";
import os from "os";
import { z } from "zod";
import { fileExists, readFileSafe } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { typedEntries } from "../../utils/typed-object";
import { CLAUDE_DIR, PLUGINS_SUBDIR, MAX_CONFIG_FILE_SIZE, STANDARD_FILES } from "../../consts";
import { getPluginManifestPath } from "./plugin-finder";

/**
 * Plugin key format: "plugin-name@marketplace"
 * e.g., "web-framework-react@acme-marketplace"
 *
 * Kept as string — user-extensible identifiers (plugin names and marketplace names).
 */
export type PluginKey = string;

/**
 * Resolved plugin with its install path
 */
export type ResolvedPlugin = {
  pluginKey: PluginKey;
  installPath: string;
};

// Zod schemas for JSON parse boundaries

const pluginSettingsSchema = z
  .object({
    enabledPlugins: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const pluginInstallationSchema = z.object({
  scope: z.enum(["user", "project", "local"]),
  projectPath: z.string().optional(),
  installPath: z.string(),
  version: z.string(),
  installedAt: z.string(),
  lastUpdated: z.string().optional(),
  gitCommitSha: z.string().optional(),
});

const installedPluginsSchema = z
  .object({
    version: z.number(),
    plugins: z.record(z.string(), z.array(pluginInstallationSchema)),
  })
  .passthrough();

const SETTINGS_FILE = STANDARD_FILES.SETTINGS_JSON;
const INSTALLED_PLUGINS_FILE = "installed_plugins.json";

/**
 * Read enabled plugin keys from project's .claude/settings.json
 */
export async function getEnabledPluginKeys(projectDir: string): Promise<PluginKey[]> {
  const settingsPath = path.join(projectDir, CLAUDE_DIR, SETTINGS_FILE);

  if (!(await fileExists(settingsPath))) {
    verbose(`No settings.json found at '${settingsPath}'`);
    return [];
  }

  try {
    const content = await readFileSafe(settingsPath, MAX_CONFIG_FILE_SIZE);
    const raw: unknown = JSON.parse(content);
    const result = pluginSettingsSchema.safeParse(raw);

    if (!result.success) {
      verbose(`Invalid settings.json structure: ${getErrorMessage(result.error)}`);
      return [];
    }

    const settings = result.data;

    if (!settings.enabledPlugins) {
      verbose(`No enabledPlugins found in '${settingsPath}'`);
      return [];
    }

    const enabledKeys = typedEntries(settings.enabledPlugins)
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key);

    verbose(`Found ${enabledKeys.length} enabled plugins in settings.json`);
    return enabledKeys;
  } catch (error) {
    verbose(`Failed to read settings.json: ${getErrorMessage(error)}`);
    return [];
  }
}

type RegisteredInstallation = Pick<
  z.infer<typeof pluginInstallationSchema>,
  "scope" | "projectPath" | "installPath"
>;

/** This project's own project-scoped installation wins; otherwise the user-scoped one. */
function pickInstallation(
  installations: RegisteredInstallation[],
  projectDir: string,
): RegisteredInstallation | undefined {
  return (
    installations.find((i) => i.scope === "project" && i.projectPath === projectDir) ??
    installations.find((i) => i.scope === "user")
  );
}

/**
 * Resolve install paths for the given plugin keys from global registry
 */
export async function resolvePluginInstallPaths(
  pluginKeys: PluginKey[],
  projectDir: string,
): Promise<ResolvedPlugin[]> {
  if (pluginKeys.length === 0) {
    return [];
  }

  const registryPath = path.join(os.homedir(), CLAUDE_DIR, PLUGINS_SUBDIR, INSTALLED_PLUGINS_FILE);

  if (!(await fileExists(registryPath))) {
    verbose(`Plugin registry not found at '${registryPath}'`);
    return [];
  }

  try {
    const content = await readFileSafe(registryPath, MAX_CONFIG_FILE_SIZE);
    const raw: unknown = JSON.parse(content);
    const result = installedPluginsSchema.safeParse(raw);

    if (!result.success) {
      verbose(`Invalid plugin registry structure: ${getErrorMessage(result.error)}`);
      return [];
    }

    const registry = result.data;

    return pluginKeys.flatMap((pluginKey) => {
      const installations = registry.plugins[pluginKey];
      if (!installations || installations.length === 0) {
        verbose(`Plugin '${pluginKey}' not found in registry`);
        return [];
      }

      const picked = pickInstallation(installations, projectDir);
      if (!picked) {
        verbose(`No matching installation found for '${pluginKey}'`);
        return [];
      }

      const scopeSuffix = picked.scope === "user" ? " (user scope)" : "";
      verbose(`Resolved '${pluginKey}' to '${picked.installPath}'${scopeSuffix}`);
      return [{ pluginKey, installPath: picked.installPath }];
    });
  } catch (error) {
    verbose(`Failed to read plugin registry: ${getErrorMessage(error)}`);
    return [];
  }
}

/**
 * Get verified plugin install paths for the project
 * Combines settings.json reading, registry lookup, and path verification
 */
export async function getVerifiedPluginInstallPaths(projectDir: string): Promise<ResolvedPlugin[]> {
  const enabledKeys = await getEnabledPluginKeys(projectDir);
  const resolvedPaths = await resolvePluginInstallPaths(enabledKeys, projectDir);

  // Filter out paths that don't exist on disk
  const checks = await Promise.all(
    resolvedPaths.map(async ({ pluginKey, installPath }) => {
      const pluginJsonPath = getPluginManifestPath(installPath);
      const manifestExists = await fileExists(pluginJsonPath);
      if (!manifestExists) {
        verbose(`Plugin '${pluginKey}' manifest does not exist at: '${pluginJsonPath}'`);
      }
      return { pluginKey, installPath, manifestExists };
    }),
  );
  const verified: ResolvedPlugin[] = checks
    .filter((c) => c.manifestExists)
    .map(({ pluginKey, installPath }) => ({ pluginKey, installPath }));

  verbose(`Verified ${verified.length} plugin install paths`);
  return verified;
}
