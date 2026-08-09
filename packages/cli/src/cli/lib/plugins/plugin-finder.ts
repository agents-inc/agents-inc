import os from "os";
import path from "path";

import { zip } from "remeda";

import { getErrorMessage } from "../../utils/errors";
import { fileExists, readFileSafe, readFile, glob } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import {
  CLAUDE_DIR,
  DEFAULT_PLUGIN_NAME,
  MAX_PLUGIN_FILE_SIZE,
  PLUGINS_SUBDIR,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  STANDARD_FILES,
} from "../../consts";
import type { PluginManifest, SkillId } from "../../types";
import { matrix } from "../matrix/matrix-provider";
import { pluginManifestSchema } from "../schemas";
import { parseFrontmatter } from "../loading/loader";

const MAX_SKILL_NAME_LENGTH = 100;

export function getUserPluginsDir(): string {
  return path.join(os.homedir(), CLAUDE_DIR, PLUGINS_SUBDIR);
}

export function getCollectivePluginDir(projectDir?: string): string {
  const dir = projectDir ?? process.cwd();
  return path.join(dir, CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME);
}

export function getProjectPluginsDir(projectDir?: string): string {
  const dir = projectDir ?? process.cwd();
  return path.join(dir, CLAUDE_DIR, PLUGINS_SUBDIR);
}

export function getPluginSkillsDir(pluginDir: string): string {
  return path.join(pluginDir, "skills");
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

export async function getPluginSkillIds(pluginSkillsDir: string): Promise<SkillId[]> {
  const skillFiles = await glob(`**/${STANDARD_FILES.SKILL_MD}`, pluginSkillsDir);
  const skillIds: SkillId[] = [];

  const fileContents = await Promise.all(
    skillFiles.map((skillFile) => readFile(path.join(pluginSkillsDir, skillFile))),
  );

  for (const [skillFile, content] of zip(skillFiles, fileContents)) {
    const fullPath = path.join(pluginSkillsDir, skillFile);
    const frontmatter = parseFrontmatter(content, fullPath);

    if (!frontmatter?.name) {
      warn(`Skipping plugin skill '${skillFile}': missing or invalid frontmatter name`);
      continue;
    }

    const skillName = frontmatter.name;

    if (skillName.length > MAX_SKILL_NAME_LENGTH) {
      warn(
        `Skipping plugin skill '${skillFile}': name exceeds ${MAX_SKILL_NAME_LENGTH} characters`,
      );
      continue;
    }

    if (matrix.skills[skillName]) {
      skillIds.push(skillName);
    } else {
      warn(`Skipping plugin skill '${skillFile}': '${skillName}' not found in skills matrix`);
    }
  }

  return skillIds;
}
