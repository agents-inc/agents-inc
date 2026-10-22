import { fileExists, isDirectoryEmpty, remove } from "../../utils/fs";
import { getPluginManifestPath } from "./plugin-finder";

/** A folder an earlier build made holds its plugin manifest. */
async function isEarlierBuild(pluginDir: string): Promise<boolean> {
  return fileExists(getPluginManifestPath(pluginDir));
}

/** A build clears its plugin's folder, so a folder no build made must be empty to build into. */
export async function holdsContentNoBuildMade(pluginDir: string): Promise<boolean> {
  if (await isEarlierBuild(pluginDir)) return false;
  return !(await isDirectoryEmpty(pluginDir));
}

export async function clearEarlierBuild(pluginDir: string): Promise<void> {
  if (await isEarlierBuild(pluginDir)) await remove(pluginDir);
}
