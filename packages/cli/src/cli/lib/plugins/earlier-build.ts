import path from "path";
import { DEFAULT_VERSION, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import type { PluginManifest } from "../../types";
import { fileExists, isDirectoryEmpty, remove } from "../../utils/fs";
import {
  computeShippedHash,
  readEarlierBuild,
  versionAfterRebuild,
  writeContentHash,
} from "../versioning";
import { getPluginManifestPath } from "./plugin-finder";
import { writePluginManifest } from "./plugin-manifest";

type PluginRebuild = {
  manifestAt: (version: string) => PluginManifest;
  computeContentHash: () => string | Promise<string>;
  writeContents: () => Promise<void>;
};

/** A folder an earlier build made holds its plugin manifest. */
async function isEarlierBuild(pluginDir: string): Promise<boolean> {
  return fileExists(getPluginManifestPath(pluginDir));
}

/** A build clears its plugin's folder, so a folder no build made must be empty to build into. */
export async function holdsContentNoBuildMade(pluginDir: string): Promise<boolean> {
  if (await isEarlierBuild(pluginDir)) return false;
  return !(await isDirectoryEmpty(pluginDir));
}

export async function refuseContentNoBuildMade(
  pluginDir: string,
  subject: string,
  file: string,
): Promise<void> {
  if (!(await holdsContentNoBuildMade(pluginDir))) return;

  throw new Error(
    `${subject} would be built into ${pluginDir}, which holds no ${path.join(PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)} and is not empty, so no earlier build made it and a rebuild would delete what it holds. Move its contents out, or build into another output directory. ${file}`,
  );
}

export async function clearEarlierBuild(pluginDir: string): Promise<void> {
  if (await isEarlierBuild(pluginDir)) await remove(pluginDir);
}

/** Answers the manifest it wrote, whose version moves only where what the plugin ships changed. */
export async function rebuildPlugin(
  pluginDir: string,
  { manifestAt, computeContentHash, writeContents }: PluginRebuild,
): Promise<PluginManifest> {
  // Read before the clear: what the earlier build shipped decides whether the version moves.
  const earlierBuild = await readEarlierBuild(pluginDir, getPluginManifestPath);
  await clearEarlierBuild(pluginDir);

  // At the earlier build's version, so the version alone cannot set the two builds apart; and
  // first, so a build that stops halfway leaves a folder the next build may clear.
  await writePluginManifest(pluginDir, manifestAt(earlierBuild?.version ?? DEFAULT_VERSION));

  // Nothing reads it back. Every plugin built so far ships it, so dropping it would bump them all.
  await writeContentHash(pluginDir, await computeContentHash(), getPluginManifestPath);

  await writeContents();

  const manifest = manifestAt(
    versionAfterRebuild(earlierBuild, await computeShippedHash(pluginDir)),
  );
  await writePluginManifest(pluginDir, manifest);
  return manifest;
}
