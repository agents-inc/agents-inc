import path from "path";
import { z } from "zod";
import { fileExists, readFileSafe } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { typedEntries } from "../../utils/typed-object";
import { CLAUDE_DIR, MAX_CONFIG_FILE_SIZE, STANDARD_FILES } from "../../consts";
import { formatZodErrors } from "../schema-validator";
import { INSTALLED_PLUGINS_FILE } from "../installation/install-layout";

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

/** Absolute path of the claude CLI install registry inside a plugins directory. */
export function getInstalledPluginsRegistryPath(pluginsDir: string): string {
  return path.join(pluginsDir, INSTALLED_PLUGINS_FILE);
}

/**
 * The registry, parsed, keyed by plugin. The one read the two listings below share.
 *
 * Throws when the registry is unreadable or fails schema validation — callers
 * treat the registry as the source of truth for installed plugins, so a broken
 * registry must surface as an error rather than an empty result.
 */
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

/**
 * Lists every install recorded in a plugins directory's `installed_plugins.json`
 * (v2 registry — claude CLI >=2.1.220 installs under `cache/<marketplace>/<plugin>/<version>/`),
 * flattened to unique (pluginKey, installPath) pairs across all scopes.
 *
 * The listing for a reader whose subject is the REGISTRY — `content-validator.ts` validates what
 * is recorded there, and a record it skipped would be a record it never reported on. A reader
 * whose subject is a project takes {@link listPluginInstallsForProject} instead.
 */
export async function listRegisteredPluginInstalls(pluginsDir: string): Promise<ResolvedPlugin[]> {
  const installations = await readRegisteredInstallations(pluginsDir);

  return typedEntries(installations).flatMap(([pluginKey, forKey]) => {
    const uniquePaths = [...new Set(forKey.map((i) => i.installPath))];
    return uniquePaths.map((installPath) => ({ pluginKey, installPath }));
  });
}

/**
 * The same registry read as ONE install per plugin, as seen from `projectDir`.
 *
 * A plugin key the registry carries more than once has to be resolved to a single directory
 * before anything loads a skill out of it, and which one that is depends on who is asking:
 * this project's own record where there is one, the user-scoped record otherwise, and nothing at
 * all for a key recorded only under a different project's path. Returning every record instead
 * would hand a reader another project's install path for a key this project merely has switched
 * on.
 *
 * Throws for a present-but-unreadable registry, like its sibling and for its sibling's reason.
 */
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
