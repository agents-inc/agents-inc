import os from "os";
import path from "path";
import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
// loadSkillsFromDir lives in loading/ (a leaf) so both this module and
// plugins/plugin-discovery can share it without an operations↔plugins cycle.
import { loadSkillsFromDir } from "../../loading/index.js";
import { verbose } from "../../../utils/logger.js";
import { GLOBAL_INSTALL_ROOT, LOCAL_SKILLS_PATH } from "../../../consts.js";
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
 * Discovers local (non-plugin) skills from `<rootDir>/.claude/skills/`. Used for
 * both the project root and the global install root.
 */
export async function discoverLocalProjectSkills(rootDir: string): Promise<SkillDefinitionMap> {
  const localSkillsDir = path.join(rootDir, LOCAL_SKILLS_PATH);
  return loadSkillsFromDir(localSkillsDir, {
    pathPrefix: LOCAL_SKILLS_PATH,
    requireMetadata: true,
  });
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
  const globalLocalSkills = isGlobalProject
    ? {}
    : await discoverLocalProjectSkills(GLOBAL_INSTALL_ROOT);
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
