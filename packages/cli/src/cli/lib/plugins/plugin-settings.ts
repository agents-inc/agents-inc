import path from "path";
import { z } from "zod";
import { fileExists, readFileSafe } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { typedEntries } from "../../utils/typed-object";
import { CLAUDE_DIR, MAX_CONFIG_FILE_SIZE, STANDARD_FILES } from "../../consts";
import { formatZodErrors } from "../schema-validator";
import { getPluginManifestPath, getUserPluginsDir } from "./plugin-finder";

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
    // The one genuine optional here: a settings.json with no plugin enabled omits the
    // key entirely, and `getEnabledPluginKeys` says so in its own diagnostic rather than
    // defaulting it away. `lastUpdated` and `gitCommitSha` used to sit beside the fields
    // below on the same footing and were decoration — declared, never read, and stripped
    // by `z.object` either way.
    enabledPlugins: z.record(z.string(), z.unknown()).exactOptional(),
  })
  .passthrough();

/** The fields every installation record carries, whatever scope it was registered at. */
const installationFields = {
  installPath: z.string(),
  version: z.string(),
  installedAt: z.string(),
};

/**
 * Discriminated on `scope` rather than carrying an optional `projectPath`, because which
 * project a record belongs to is a question only a project-scoped record has: a
 * user-scoped one has no answer, and a project-scoped one without a path is a malformed
 * record that `pickInstallation` would silently decline to match.
 */
const pluginInstallationSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("project"), projectPath: z.string(), ...installationFields }),
  z.object({ scope: z.literal("user"), ...installationFields }),
  z.object({ scope: z.literal("local"), ...installationFields }),
]);

const installedPluginsSchema = z
  .object({
    version: z.number(),
    plugins: z.record(z.string(), z.array(pluginInstallationSchema)),
  })
  .passthrough();

const SETTINGS_FILE = STANDARD_FILES.SETTINGS_JSON;
const INSTALLED_PLUGINS_FILE = "installed_plugins.json";

/** Absolute path of the claude CLI install registry inside a plugins directory. */
export function getInstalledPluginsRegistryPath(pluginsDir: string): string {
  return path.join(pluginsDir, INSTALLED_PLUGINS_FILE);
}

/**
 * Lists every install recorded in a plugins directory's `installed_plugins.json`
 * (v2 registry — claude CLI >=2.1.220 installs under `cache/<marketplace>/<plugin>/<version>/`),
 * flattened to unique (pluginKey, installPath) pairs across all scopes.
 *
 * Throws when the registry is unreadable or fails schema validation — callers
 * treat the registry as the source of truth for installed plugins, so a broken
 * registry must surface as an error rather than an empty result.
 */
export async function listRegisteredPluginInstalls(pluginsDir: string): Promise<ResolvedPlugin[]> {
  const registryPath = getInstalledPluginsRegistryPath(pluginsDir);
  const content = await readFileSafe(registryPath, MAX_CONFIG_FILE_SIZE);
  const raw: unknown = JSON.parse(content);
  const result = installedPluginsSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(
      `Invalid ${INSTALLED_PLUGINS_FILE}: ${formatZodErrors(result.error).join("; ")}`,
    );
  }

  return typedEntries(result.data.plugins).flatMap(([pluginKey, installations]) => {
    const uniquePaths = [...new Set(installations.map((i) => i.installPath))];
    return uniquePaths.map((installPath) => ({ pluginKey, installPath }));
  });
}

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

type RegisteredInstallation = z.infer<typeof pluginInstallationSchema>;

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

  const registryPath = getInstalledPluginsRegistryPath(getUserPluginsDir());

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
