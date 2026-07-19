import fs from "fs";
import os from "os";
import path from "path";
import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
import { directoryExists, glob, readFile, fileExists } from "../../../utils/fs.js";
import { parseFrontmatter } from "../../loading/index.js";
import { verbose, warn } from "../../../utils/logger.js";
import { GLOBAL_INSTALL_ROOT, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../../consts.js";
import { typedEntries, typedKeys } from "../../../utils/typed-object.js";
import type { SkillDefinition, SkillDefinitionMap, SkillId } from "../../../types/index.js";

export type DiscoveredSkills = {
  allSkills: SkillDefinitionMap;
  totalSkillCount: number;
  pluginSkillCount: number;
  localSkillCount: number;
  globalPluginSkillCount: number;
  globalLocalSkillCount: number;
};

/**
 * Loads SKILL.md files from a directory, parsing frontmatter for skill metadata.
 * Returns a map of skillId -> SkillDefinition.
 */
export async function loadSkillsFromDir(
  skillsDir: string,
  pathPrefix = "",
): Promise<SkillDefinitionMap> {
  const skills: SkillDefinitionMap = {};

  if (!(await directoryExists(skillsDir))) {
    return skills;
  }

  const skillFiles = await glob("**/SKILL.md", skillsDir);

  for (const skillFile of skillFiles) {
    const skillPath = path.join(skillsDir, skillFile);
    const skillDir = path.dirname(skillPath);
    const relativePath = path.relative(skillsDir, skillDir);
    const skillDirName = path.basename(skillDir);

    const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
    if (!(await fileExists(metadataPath))) {
      const displayPath = pathPrefix ? `${pathPrefix}/${relativePath}/` : `${relativePath}/`;
      warn(
        `Skill '${skillDirName}' in '${displayPath}' is missing ${STANDARD_FILES.METADATA_YAML} — skipped. Add ${STANDARD_FILES.METADATA_YAML} to register it with the CLI.`,
      );
      continue;
    }

    try {
      const content = await readFile(skillPath);
      const frontmatter = parseFrontmatter(content, skillPath);

      if (!frontmatter?.name) {
        warn(`Skipping skill in '${skillDirName}': missing or invalid frontmatter name`);
        continue;
      }

      const canonicalId = frontmatter.name;

      const skill: SkillDefinition = {
        id: canonicalId,
        path: pathPrefix ? `${pathPrefix}/${relativePath}/` : `${relativePath}/`,
        description: frontmatter?.description || "",
      };

      skills[canonicalId] = skill;
      verbose(`  Loaded skill: ${canonicalId}`);
    } catch (error) {
      verbose(`  Failed to load skill: ${skillFile} - ${error}`);
    }
  }

  return skills;
}

/**
 * Discovers local project skills from the .claude/skills/ directory.
 */
export async function discoverLocalProjectSkills(projectDir: string): Promise<SkillDefinitionMap> {
  const localSkillsDir = path.join(projectDir, LOCAL_SKILLS_PATH);
  return loadSkillsFromDir(localSkillsDir, LOCAL_SKILLS_PATH);
}

/** Merges skill maps — later sources take precedence over earlier ones. */
export function mergeSkills(...skillSources: SkillDefinitionMap[]): SkillDefinitionMap {
  const merged: SkillDefinitionMap = {};

  for (const source of skillSources) {
    for (const [id, skill] of typedEntries<SkillId, SkillDefinition | undefined>(source)) {
      if (skill) {
        merged[id] = skill;
      }
    }
  }

  return merged;
}

/**
 * Discovers all installed skills for a project directory using 4-way merge:
 * 1. Global plugins (from ~/.claude/plugins/)
 * 2. Global local (from ~/.claude/skills/)
 * 3. Project plugins (from <projectDir>/.claude/plugins/)
 * 4. Project local (from <projectDir>/.claude/skills/)
 *
 * Pure function — no user-facing logging. Callers add their own log messages.
 * Uses verbose() for diagnostic output only.
 */
export async function discoverInstalledSkills(projectDir: string): Promise<DiscoveredSkills> {
  const isGlobalProject = isHomeDirectory(projectDir);

  // 1. Global plugins
  const globalPluginSkills = isGlobalProject ? {} : await discoverAllPluginSkills(os.homedir());
  const globalPluginSkillCount = typedKeys<SkillId>(globalPluginSkills).length;
  if (globalPluginSkillCount > 0) {
    verbose(`  Found ${globalPluginSkillCount} skills from global plugins`);
  }

  // 2. Global local skills
  const globalLocalSkillsDir = path.join(GLOBAL_INSTALL_ROOT, LOCAL_SKILLS_PATH);
  const globalLocalSkills = isGlobalProject
    ? {}
    : await loadSkillsFromDir(globalLocalSkillsDir, LOCAL_SKILLS_PATH);
  const globalLocalSkillCount = typedKeys<SkillId>(globalLocalSkills).length;
  if (globalLocalSkillCount > 0) {
    verbose(`  Found ${globalLocalSkillCount} global local skills from ~/.claude/skills/`);
  }

  // 3. Project plugins
  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const pluginSkillCount = typedKeys<SkillId>(pluginSkills).length;
  verbose(`  Found ${pluginSkillCount} skills from installed plugins`);

  // 4. Project local skills
  const localSkills = await discoverLocalProjectSkills(projectDir);
  const localSkillCount = typedKeys<SkillId>(localSkills).length;
  verbose(`  Found ${localSkillCount} local skills from .claude/skills/`);

  // Merge: global first, project second — project wins on conflict
  const allSkills = mergeSkills(globalPluginSkills, globalLocalSkills, pluginSkills, localSkills);
  const totalSkillCount = typedKeys<SkillId>(allSkills).length;

  return {
    allSkills,
    totalSkillCount,
    pluginSkillCount: globalPluginSkillCount + pluginSkillCount,
    localSkillCount: globalLocalSkillCount + localSkillCount,
    globalPluginSkillCount,
    globalLocalSkillCount,
  };
}
