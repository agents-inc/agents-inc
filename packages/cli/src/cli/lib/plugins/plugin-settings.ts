import path from "path";
import { z } from "zod";
import { fileExists, readFileSafe } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { typedEntries } from "../../utils/typed-object";
import { CLAUDE_DIR, MAX_CONFIG_FILE_SIZE, STANDARD_FILES } from "../../consts";
import { formatZodErrors } from "../schema-validator";
import { INSTALLED_PLUGINS_FILE } from "../installation/install-layout";

/** `plugin-name@marketplace`. */
type PluginKey = string;

export type ResolvedPlugin = {
  pluginKey: PluginKey;
  installPath: string;
};

const pluginSettingsSchema = z
  .object({
    // Absent when no plugin is enabled.
    enabledPlugins: z.record(z.string(), z.unknown()).exactOptional(),
  })
  .passthrough();

const installationFields = {
  installPath: z.string(),
  version: z.string(),
  installedAt: z.string(),
};

/** Discriminated so a project-scoped record without `projectPath` is rejected, not skipped. */
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

export function getInstalledPluginsRegistryPath(pluginsDir: string): string {
  return path.join(pluginsDir, INSTALLED_PLUGINS_FILE);
}

/** Throws on an unreadable or invalid registry rather than answering empty. */
async function readRegisteredInstallations(
  pluginsDir: string,
): Promise<Record<PluginKey, RegisteredInstallation[]>> {
  const registryPath = getInstalledPluginsRegistryPath(pluginsDir);
  const content = await readFileSafe(registryPath, MAX_CONFIG_FILE_SIZE);
  const raw: unknown = JSON.parse(content);
  const result = installedPluginsSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(
      `Invalid ${INSTALLED_PLUGINS_FILE}: ${formatZodErrors(result.error).join("; ")}`,
    );
  }

  return result.data.plugins;
}

/** Every recorded install across all scopes, unlike {@link listPluginInstallsForProject}. */
export async function listRegisteredPluginInstalls(pluginsDir: string): Promise<ResolvedPlugin[]> {
  const installations = await readRegisteredInstallations(pluginsDir);

  return typedEntries(installations).flatMap(([pluginKey, forKey]) => {
    const uniquePaths = [...new Set(forKey.map((i) => i.installPath))];
    return uniquePaths.map((installPath) => ({ pluginKey, installPath }));
  });
}

/** One install per plugin as seen from `projectDir`; another project's record is never returned. */
export async function listPluginInstallsForProject(
  pluginsDir: string,
  projectDir: string,
): Promise<ResolvedPlugin[]> {
  const installations = await readRegisteredInstallations(pluginsDir);

  return typedEntries(installations).flatMap(([pluginKey, forKey]) => {
    const picked = pickInstallation(forKey, projectDir);
    if (!picked) {
      verbose(`No installation of '${pluginKey}' belongs to '${projectDir}'`);
      return [];
    }
    return [{ pluginKey, installPath: picked.installPath }];
  });
}

export async function getEnabledPluginKeys(projectDir: string): Promise<PluginKey[]> {
  const settingsPath = path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON);

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
