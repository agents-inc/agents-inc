/** What a host's own verbs write and can leave holding nothing, for a take-back or an uninstall. */

import path from "path";
import { unique } from "remeda";
import { z } from "zod";

import { PLUGINS_SUBDIR, STANDARD_FILES, type Provider } from "../../consts.js";
import { isBlankFile, jsonFileMatches, remove } from "../../utils/fs.js";
import {
  CODEX_CONFIG_FILE,
  INSTALLED_PLUGINS_FILE,
  skillsDir,
  userConfigRoot,
} from "../installation/install-layout.js";
import { isHomeDirectory } from "../installation/is-home-directory.js";

const KNOWN_MARKETPLACES_FILE = "known_marketplaces.json";
const CLAUDE_MARKETPLACE_CHECKOUTS = "marketplaces";
const CODEX_PLUGIN_CACHE = "cache";
const CODEX_MARKETPLACE_STAGING = path.join(".tmp", "marketplaces");
const CODEX_ARG0_ALIASES = path.join("tmp", "arg0");

/** As Claude leaves each once its own `uninstall` and `marketplace remove` have emptied it. */
const NOTHING_BUT_EMPTY_OBJECTS = z.record(z.string(), z.strictObject({}));

const A_REGISTRY_OF_NO_PLUGINS = z.strictObject({
  version: z.number(),
  plugins: z.strictObject({}),
});

const HOLDING_NOTHING = z.union([NOTHING_BUT_EMPTY_OBJECTS, A_REGISTRY_OF_NO_PLUGINS]);

export function filesATakeBackMayEmpty(provider: Provider, projectDir: string): string[] {
  switch (provider) {
    case "claude":
      return claudeFilesATakeBackMayEmpty(projectDir);
    case "codex":
      return [path.join(codexHome(projectDir), CODEX_CONFIG_FILE)];
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** One settings file, not two, where the project is home. */
function claudeFilesATakeBackMayEmpty(projectDir: string): string[] {
  const home = userConfigRoot("claude", "global", projectDir);
  return unique([
    path.join(userConfigRoot("claude", "project", projectDir), STANDARD_FILES.SETTINGS_JSON),
    path.join(home, STANDARD_FILES.SETTINGS_JSON),
    path.join(home, PLUGINS_SUBDIR, KNOWN_MARKETPLACES_FILE),
    path.join(home, PLUGINS_SUBDIR, INSTALLED_PLUGINS_FILE),
  ]);
}

/** Claude's plugin cache keeps a marker of each plugin uninstalled, so it is never one of these. */
export function foldersATakeBackMayEmpty(provider: Provider, projectDir: string): string[] {
  switch (provider) {
    case "claude":
      return [
        path.join(
          userConfigRoot("claude", "global", projectDir),
          PLUGINS_SUBDIR,
          CLAUDE_MARKETPLACE_CHECKOUTS,
        ),
      ];
    case "codex":
      return [CODEX_MARKETPLACE_STAGING, CODEX_ARG0_ALIASES].map((folder) =>
        path.join(codexHome(projectDir), folder),
      );
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Named by the marketplace, so known only once the run has settled which one it installs from. */
export function foldersAPluginInstallMayEmpty(
  provider: Provider,
  projectDir: string,
  marketplace: string,
): string[] {
  switch (provider) {
    case "claude":
      return [];
    case "codex":
      return [path.join(codexHome(projectDir), PLUGINS_SUBDIR, CODEX_PLUGIN_CACHE, marketplace)];
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** At home Codex's are its installation's own, so an uninstall there leaves them. */
export function projectFoldersAnUninstallMayEmpty(
  provider: Provider,
  projectDir: string,
): string[] {
  switch (provider) {
    case "claude":
      return [userConfigRoot("claude", "project", projectDir)];
    case "codex":
      if (isHomeDirectory(projectDir)) return [];
      return [
        userConfigRoot("codex", "project", projectDir),
        path.dirname(skillsDir("codex", "project", projectDir)),
      ];
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function codexHome(projectDir: string): string {
  return userConfigRoot("codex", "global", projectDir);
}

/** A file holding anything, or that cannot be read, stays. */
export async function removeIfHoldingNothing(file: string): Promise<void> {
  if ((await isBlankFile(file)) || (await jsonFileMatches(file, HOLDING_NOTHING))) {
    await remove(file);
  }
}
