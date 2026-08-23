import os from "os";
import path from "path";

import { getErrorMessage } from "../../utils/errors";
import { fileExists, readFileSafe } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import {
  CLAUDE_DIR,
  MAX_PLUGIN_FILE_SIZE,
  PLUGINS_SUBDIR,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
} from "../../consts";
import type { PluginManifest } from "../../types";
import { pluginManifestSchema } from "../schemas";

export function getUserPluginsDir(): string {
  return path.join(os.homedir(), CLAUDE_DIR, PLUGINS_SUBDIR);
}

export function getProjectPluginsDir(projectDir?: string): string {
  const dir = projectDir ?? process.cwd();
  return path.join(dir, CLAUDE_DIR, PLUGINS_SUBDIR);
}

export function getPluginAgentsDir(pluginDir: string): string {
  return path.join(pluginDir, "agents");
}

export function getPluginManifestPath(pluginDir: string): string {
  return path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
}

export async function readPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
  const manifestPath = getPluginManifestPath(pluginDir);

  if (!(await fileExists(manifestPath))) {
    verbose(`  No manifest at ${manifestPath}`);
    return null;
  }

  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    const manifest = pluginManifestSchema.parse(JSON.parse(content));

    if (!manifest.name || typeof manifest.name !== "string") {
      verbose(`  Invalid manifest at ${manifestPath}: missing name`);
      return null;
    }

    return manifest;
  } catch (error) {
    verbose(`  Failed to parse manifest at ${manifestPath}: ${getErrorMessage(error)}`);
    return null;
  }
}
