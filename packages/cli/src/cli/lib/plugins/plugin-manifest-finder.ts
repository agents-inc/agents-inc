import path from "path";

import { fileExists } from "../../utils/fs";
import { getPluginManifestPath } from "./plugin-finder";

// Walks up from startDir looking for the plugin manifest file.
export async function findPluginManifest(startDir: string): Promise<string | null> {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const manifestPath = getPluginManifestPath(currentDir);
    if (await fileExists(manifestPath)) {
      return manifestPath;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}
