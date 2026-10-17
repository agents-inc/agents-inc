import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
import { loadSkillsFromDir, type LoadedSkills } from "../../loading/index.js";
import { sayingEachWarningOnce, verbose } from "../../../utils/logger.js";
import { globalInstallRoot } from "../../../consts.js";
import {
  installBaseDir,
  providerInUse,
  skillsDir,
  skillsPathPrefix,
} from "../../installation/install-layout.js";
import { typedEntries, typedKeys } from "../../../utils/typed-object.js";
import type { UnusableSkillMetadata } from "../../loading/index.js";
import type {
  SkillDefinition,
  SkillDefinitionMap,
  SkillId,
  SkillScope,
} from "../../../types/index.js";

export type DiscoveredSkills = {
  allSkills: SkillDefinitionMap;
  totalSkillCount: number;
  pluginSkillCount: number;
  localSkillCount: number;
  globalPluginSkillCount: number;
  globalLocalSkillCount: number;
  /** Skills whose metadata.yaml describes no skill; `compile` refuses over any entry. */
  unusableMetadata: UnusableSkillMetadata[];
};

const NO_LOCAL_SKILLS: LoadedSkills = { skills: {}, unusableMetadata: [] };

/**
 * Discovers copied-in (not plugin) skills at one scope. A global scan's warnings are said once per
 * run, since the fan-out asks for that one directory once per registered project.
 */
export async function discoverLocalProjectSkills(
  projectDir: string,
  scope: SkillScope,
): Promise<LoadedSkills> {
  const provider = providerInUse(installBaseDir(projectDir, scope));
  const scan = () =>
    loadSkillsFromDir(skillsDir(provider, scope, projectDir), {
      pathPrefix: skillsPathPrefix(provider, scope, projectDir),
      requireMetadata: true,
    });

  return scope === "global" ? sayingEachWarningOnce(scan) : scan();
}

function globalSkillsRoot(): string {
  const home = globalInstallRoot();
  return skillsDir(providerInUse(home), "global", home);
}

function projectSkillsRoot(projectDir: string, scope: SkillScope): string {
  return skillsDir(providerInUse(installBaseDir(projectDir, scope)), scope, projectDir);
}

/** Later sources win. */
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

/** Merges global plugins, global copied-in, project plugins, project copied-in; project wins. */
export async function discoverInstalledSkills(projectDir: string): Promise<DiscoveredSkills> {
  const isGlobalProject = isHomeDirectory(projectDir);

  const globalPluginSkills = isGlobalProject
    ? {}
    : await discoverAllPluginSkills(globalInstallRoot());
  const globalPluginSkillCount = typedKeys<SkillId>(globalPluginSkills).length;
  if (globalPluginSkillCount > 0) {
    verbose(`  Found ${globalPluginSkillCount} skills from global plugins`);
  }

  const globalLocal = isGlobalProject
    ? NO_LOCAL_SKILLS
    : await discoverLocalProjectSkills(projectDir, "global");
  const globalLocalSkillCount = typedKeys<SkillId>(globalLocal.skills).length;
  if (globalLocalSkillCount > 0) {
    verbose(`  Found ${globalLocalSkillCount} global local skills from ${globalSkillsRoot()}`);
  }

  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const pluginSkillCount = typedKeys<SkillId>(pluginSkills).length;
  verbose(`  Found ${pluginSkillCount} skills from installed plugins`);

  // At the home root both scopes are one installation, so ask the global scope only.
  const localScope: SkillScope = isGlobalProject ? "global" : "project";
  const local = await discoverLocalProjectSkills(projectDir, localScope);
  const localSkillCount = typedKeys<SkillId>(local.skills).length;
  verbose(
    `  Found ${localSkillCount} local skills from ${projectSkillsRoot(projectDir, localScope)}`,
  );

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
