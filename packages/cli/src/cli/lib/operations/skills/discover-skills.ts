import os from "os";
import path from "path";
import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
// loadSkillsFromDir lives in loading/ (a leaf) so both this module and
// plugins/plugin-discovery can share it without an operations↔plugins cycle.
import { loadSkillsFromDir, type LoadedSkills } from "../../loading/index.js";
import { verbose } from "../../../utils/logger.js";
import { GLOBAL_INSTALL_ROOT, LOCAL_SKILLS_PATH } from "../../../consts.js";
import { typedEntries, typedKeys } from "../../../utils/typed-object.js";
import type { UnusableSkillMetadata } from "../../loading/index.js";
import type { SkillDefinition, SkillDefinitionMap, SkillId } from "../../../types/index.js";

export type DiscoveredSkills = {
  allSkills: SkillDefinitionMap;
  totalSkillCount: number;
  pluginSkillCount: number;
  localSkillCount: number;
  globalPluginSkillCount: number;
  globalLocalSkillCount: number;
  /**
   * Installed skills whose metadata.yaml exists but describes no skill, from either
   * scope. Nothing was loaded for them; `compile` refuses the run over any entry
   * here rather than compile agents around a skill its metadata does not describe.
   */
  unusableMetadata: UnusableSkillMetadata[];
};

/** The result of a local-skill scan that was not performed. */
const NO_LOCAL_SKILLS: LoadedSkills = { skills: {}, unusableMetadata: [] };

/**
 * Discovers local (non-plugin) skills from `<rootDir>/.claude/skills/`. Used for
 * both the project root and the global install root.
 */
export async function discoverLocalProjectSkills(rootDir: string): Promise<LoadedSkills> {
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
  const globalLocal = isGlobalProject
    ? NO_LOCAL_SKILLS
    : await discoverLocalProjectSkills(GLOBAL_INSTALL_ROOT);
  const globalLocalSkillCount = typedKeys<SkillId>(globalLocal.skills).length;
  if (globalLocalSkillCount > 0) {
    verbose(`  Found ${globalLocalSkillCount} global local skills from ~/.claude/skills/`);
  }

  // 3. Project plugins
  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const pluginSkillCount = typedKeys<SkillId>(pluginSkills).length;
  verbose(`  Found ${pluginSkillCount} skills from installed plugins`);

  // 4. Project local skills
  const local = await discoverLocalProjectSkills(projectDir);
  const localSkillCount = typedKeys<SkillId>(local.skills).length;
  verbose(`  Found ${localSkillCount} local skills from .claude/skills/`);

  // Merge: global first, project second — project wins on conflict
  const allSkills = mergeSkills(globalPluginSkills, globalLocal.skills, pluginSkills, local.skills);
  const totalSkillCount = typedKeys<SkillId>(allSkills).length;

  return {
    allSkills,
    totalSkillCount,
    pluginSkillCount: globalPluginSkillCount + pluginSkillCount,
    localSkillCount: globalLocalSkillCount + localSkillCount,
    globalPluginSkillCount,
    globalLocalSkillCount,
    unusableMetadata: [...globalLocal.unusableMetadata, ...local.unusableMetadata],
  };
}
