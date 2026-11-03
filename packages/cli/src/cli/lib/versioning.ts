import { createHash } from "crypto";
import { readFile as readFileBytes } from "fs/promises";
import path from "path";
import { getErrorMessage } from "../utils/errors";
import { readFile, readFileSafe, writeFile, glob, fileExists } from "../utils/fs";
import { warn } from "../utils/logger";
import {
  DEFAULT_VERSION,
  MAX_PLUGIN_FILE_SIZE,
  STANDARD_FILES,
  HASH_PREFIX_LENGTH,
} from "../consts";
import { pluginManifestSchema } from "./schemas";
import { SKILL_CONTENT_FILES, SKILL_CONTENT_DIRS } from "./metadata-keys";

const ISO_DATE_LENGTH = 10;

export function getCurrentDate(): string {
  return new Date().toISOString().slice(0, ISO_DATE_LENGTH);
}

export function computeStringHash(content: string): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex").slice(0, HASH_PREFIX_LENGTH);
}

export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return computeStringHash(content);
}

export async function computeSkillFolderHash(skillPath: string): Promise<string> {
  const entries = await Promise.all([
    ...SKILL_CONTENT_FILES.map((fileName) => contentFileEntries(skillPath, fileName)),
    ...SKILL_CONTENT_DIRS.map((dirName) => contentDirEntries(skillPath, dirName)),
  ]);
  return computeStringHash(entries.flat().join("\n---\n"));
}

async function contentFileEntries(skillPath: string, fileName: string): Promise<string[]> {
  const filePath = path.join(skillPath, fileName);
  if (!(await fileExists(filePath))) return [];
  return [`${fileName}:${await readFile(filePath)}`];
}

async function contentDirEntries(skillPath: string, dirName: string): Promise<string[]> {
  const dirPath = path.join(skillPath, dirName);
  if (!(await fileExists(dirPath))) return [];

  const files = (await glob("**/*", dirPath)).toSorted();
  return Promise.all(
    files.map(async (file) => `${dirName}/${file}:${await readFile(path.join(dirPath, file))}`),
  );
}

const CONTENT_HASH_FILE = ".content-hash";

function contentHashFileBeside(manifestPath: string): string {
  return manifestPath.replace(STANDARD_FILES.PLUGIN_JSON, CONTENT_HASH_FILE);
}

function parseMajorVersion(version: string): number {
  const [, major] = version.match(/^(\d+)\./) ?? [];
  return major === undefined ? 1 : parseInt(major, 10);
}

function bumpMajorVersion(version: string): string {
  const major = parseMajorVersion(version);
  return `${major + 1}.0.0`;
}

async function readManifestVersion(manifestPath: string): Promise<string> {
  const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
  return pluginManifestSchema.parse(JSON.parse(content)).version ?? DEFAULT_VERSION;
}

async function computeBytesHash(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFileBytes(filePath))
    .digest("hex");
}

/** NUL-delimited, since no path can hold a NUL. */
async function describeShippedFile(pluginDir: string, file: string): Promise<string> {
  return `${file}\0${await computeBytesHash(path.join(pluginDir, file))}\0`;
}

/** Every file in a plugin's folder, by path and bytes: what a host copies when it installs it. */
export async function computeShippedHash(pluginDir: string): Promise<string> {
  const files = await glob("**/*", pluginDir, { dot: true });
  const described = await Promise.all(files.map((file) => describeShippedFile(pluginDir, file)));
  return createHash("sha256").update(described.join("")).digest("hex");
}

type EarlierBuild = { version: string; shippedHash: string };

/**
 * Read before a rebuild clears the folder. Null where no build made it, and, warning, where its
 * manifest cannot be read.
 */
export async function readEarlierBuild(
  pluginDir: string,
  getManifestPath: (dir: string) => string,
): Promise<EarlierBuild | null> {
  const manifestPath = getManifestPath(pluginDir);
  if (!(await fileExists(manifestPath))) return null;

  const version = await readManifestVersion(manifestPath).catch((error: unknown) => {
    warn(`Failed to read plugin manifest at '${manifestPath}': ${getErrorMessage(error)}`);
    return null;
  });
  if (version === null) return null;

  return { version, shippedHash: await computeShippedHash(pluginDir) };
}

/**
 * `shippedHash` is the rebuild's, made at the earlier build's version, so that the two differ only
 * where what the plugin ships does.
 */
export function versionAfterRebuild(earlier: EarlierBuild | null, shippedHash: string): string {
  if (!earlier) return DEFAULT_VERSION;
  return earlier.shippedHash === shippedHash ? earlier.version : bumpMajorVersion(earlier.version);
}

export async function writeContentHash(
  pluginDir: string,
  contentHash: string,
  getManifestPath: (dir: string) => string,
): Promise<void> {
  await writeFile(contentHashFileBeside(getManifestPath(pluginDir)), contentHash);
}
