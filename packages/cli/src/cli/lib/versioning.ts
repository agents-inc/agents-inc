import { createHash } from "crypto";
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
  const contents: string[] = [];

  for (const fileName of SKILL_CONTENT_FILES) {
    const filePath = path.join(skillPath, fileName);
    if (await fileExists(filePath)) {
      const content = await readFile(filePath);
      contents.push(`${fileName}:${content}`);
    }
  }

  for (const dirName of SKILL_CONTENT_DIRS) {
    const dirPath = path.join(skillPath, dirName);
    if (await fileExists(dirPath)) {
      const files = await glob("**/*", dirPath);
      for (const file of files.sort()) {
        const filePath = path.join(dirPath, file);
        const content = await readFile(filePath);
        contents.push(`${dirName}/${file}:${content}`);
      }
    }
  }

  const combined = contents.join("\n---\n");
  return computeStringHash(combined);
}

/**
 * Plugin versioning utilities shared by skill, agent, and stack plugin compilers.
 * Reads existing plugin.json + .content-hash, bumps semver major on content change.
 */

const CONTENT_HASH_FILE = ".content-hash";

export function parseMajorVersion(version: string): number {
  const [, major] = version.match(/^(\d+)\./) ?? [];
  return major === undefined ? 1 : parseInt(major, 10);
}

export function bumpMajorVersion(version: string): string {
  const major = parseMajorVersion(version);
  return `${major + 1}.0.0`;
}

async function readExistingPluginManifest(
  pluginDir: string,
  getManifestPath: (dir: string) => string,
): Promise<{ version: string; contentHash: string | undefined } | null> {
  const manifestPath = getManifestPath(pluginDir);

  if (!(await fileExists(manifestPath))) {
    return null;
  }

  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    const manifest = pluginManifestSchema.parse(JSON.parse(content));

    const hashFilePath = manifestPath.replace(STANDARD_FILES.PLUGIN_JSON, CONTENT_HASH_FILE);
    const contentHash = (await fileExists(hashFilePath))
      ? (await readFile(hashFilePath)).trim()
      : undefined;

    return {
      version: manifest.version ?? DEFAULT_VERSION,
      contentHash,
    };
  } catch (error) {
    warn(`Failed to read plugin manifest at '${manifestPath}': ${getErrorMessage(error)}`);
    return null;
  }
}

export async function determinePluginVersion(
  newHash: string,
  pluginDir: string,
  getManifestPath: (dir: string) => string,
): Promise<{ version: string; contentHash: string }> {
  const existing = await readExistingPluginManifest(pluginDir, getManifestPath);

  if (!existing) {
    return {
      version: DEFAULT_VERSION,
      contentHash: newHash,
    };
  }

  if (existing.contentHash !== newHash) {
    return {
      version: bumpMajorVersion(existing.version),
      contentHash: newHash,
    };
  }

  return {
    version: existing.version,
    contentHash: newHash,
  };
}

export async function writeContentHash(
  pluginDir: string,
  contentHash: string,
  getManifestPath: (dir: string) => string,
): Promise<void> {
  const hashFilePath = getManifestPath(pluginDir).replace(
    STANDARD_FILES.PLUGIN_JSON,
    CONTENT_HASH_FILE,
  );
  await writeFile(hashFilePath, contentHash);
}
