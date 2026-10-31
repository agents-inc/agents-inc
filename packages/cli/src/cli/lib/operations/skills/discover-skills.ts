import path from "path";

import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
import { loadSkillsFromDir, type LoadedSkills } from "../../loading/index.js";
import { sayingEachWarningOnce, verbose } from "../../../utils/logger.js";
import { globalInstallRoot } from "../../../consts.js";
import {
  inheritedGlobalProvider,
  providerAtScope,
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
async function discoverLocalProjectSkills(
  projectDir: string,
  scope: SkillScope,
): Promise<LoadedSkills> {
  const provider = providerAtScope(projectDir, scope);
  const pathPrefix = skillsPathPrefix(provider, scope, projectDir);
  const scan = () =>
    loadSkillsFromDir(skillsDir(provider, scope, projectDir), {
      pathPrefix,
      requireMetadata: true,
      folderLabel: folderLabelAt(pathPrefix, scope),
    });

  return scope === "global" ? sayingEachWarningOnce(scan) : scan();
}

/** From `~/`: saying it once per run matches on text, so it must never equal a project's line. */
function folderLabelAt(pathPrefix: string, scope: SkillScope): string {
  const underHome = scope === "global" && !path.isAbsolute(pathPrefix);
  return underHome ? `~/${pathPrefix}/` : `${pathPrefix}/`;
}

function skillsRootAt(projectDir: string, scope: SkillScope): string {
  return skillsDir(providerAtScope(projectDir, scope), scope, projectDir);
}

/** Later sources win. */
function mergeSkills(...skillSources: SkillDefinitionMap[]): SkillDefinitionMap {
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

  const globalPlugins = isGlobalProject ? {} : await discoverGlobalPluginSkills(projectDir);
  const globalLocal = isGlobalProject
    ? NO_LOCAL_SKILLS
    : await discoverGlobalLocalSkills(projectDir);
  const projectPlugins = await discoverProjectPluginSkills(projectDir);
  // At the home root both scopes are one installation, so ask the global scope only.
  const localScope: SkillScope = isGlobalProject ? "global" : "project";
  const projectLocal = await discoverLocalSkillsAt(projectDir, localScope);

  return assembleDiscoveredSkills({ globalPlugins, globalLocal, projectPlugins, projectLocal });
}

async function discoverGlobalPluginSkills(projectDir: string): Promise<SkillDefinitionMap> {
  const skills = await discoverAllPluginSkills(
    globalInstallRoot(),
    inheritedGlobalProvider(projectDir),
  );
  const count = skillCount(skills);
  if (count > 0) verbose(`  Found ${count} skills from global plugins`);
  return skills;
}

async function discoverGlobalLocalSkills(projectDir: string): Promise<LoadedSkills> {
  const loaded = await discoverLocalProjectSkills(projectDir, "global");
  const count = skillCount(loaded.skills);
  if (count > 0) {
    verbose(`  Found ${count} global local skills from ${skillsRootAt(projectDir, "global")}`);
  }
  return loaded;
}

async function discoverProjectPluginSkills(projectDir: string): Promise<SkillDefinitionMap> {
  const skills = await discoverAllPluginSkills(projectDir);
  verbose(`  Found ${skillCount(skills)} skills from installed plugins`);
  return skills;
}

async function discoverLocalSkillsAt(projectDir: string, scope: SkillScope): Promise<LoadedSkills> {
  const loaded = await discoverLocalProjectSkills(projectDir, scope);
  verbose(
    `  Found ${skillCount(loaded.skills)} local skills from ${skillsRootAt(projectDir, scope)}`,
  );
  return loaded;
}

type SkillsByOrigin = {
  globalPlugins: SkillDefinitionMap;
  globalLocal: LoadedSkills;
  projectPlugins: SkillDefinitionMap;
  projectLocal: LoadedSkills;
};

function assembleDiscoveredSkills(found: SkillsByOrigin): DiscoveredSkills {
  const { globalPlugins, globalLocal, projectPlugins, projectLocal } = found;
  const allSkills = mergeSkills(
    globalPlugins,
    globalLocal.skills,
    projectPlugins,
    projectLocal.skills,
  );
  // A plugin installed at both scopes is listed by both, but is one skill.
  const distinctPluginSkills = mergeSkills(globalPlugins, projectPlugins);

  return {
    allSkills,
    totalSkillCount: skillCount(allSkills),
    pluginSkillCount: skillCount(distinctPluginSkills),
    globalPluginSkillCount: skillCount(globalPlugins),
    globalLocalSkillCount: skillCount(globalLocal.skills),
    unusableMetadata: [...globalLocal.unusableMetadata, ...projectLocal.unusableMetadata],
  };
}

function skillCount(skills: SkillDefinitionMap): number {
  return typedKeys<SkillId>(skills).length;
}
