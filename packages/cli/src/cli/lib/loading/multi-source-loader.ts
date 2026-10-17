import os from "os";

import { isHomeDirectory } from "../installation/is-home-directory";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts";
import type {
  MergedSkillsMatrix,
  ResolvedSkill,
  SkillId,
  SkillSource,
  SkillSourceType,
} from "../../types";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { isDefaultSource, type ResolvedConfig } from "../configuration";
import { discoverAllPluginSkills } from "../plugins";

/** Asked of the tagged sources, not `custom`; a skill the pass never reached answers `false`. */
export function isLocalOnlySkill(skill: ResolvedSkill | undefined): boolean {
  return (
    skill?.availableSources !== undefined &&
    !skill.availableSources.some((source) => source.type !== "local")
  );
}

function addAvailableSource(
  skill: { availableSources?: SkillSource[] },
  source: SkillSource,
): void {
  skill.availableSources = skill.availableSources ?? [];
  skill.availableSources.push(source);
}

/**
 * Tags every skill with `availableSources` (the local copy and at most one marketplace) and
 * `activeSource`, mutating `primaryMatrix` in place. `unbackedSkillIds` are ids the marketplace
 * does not carry, left out of the marketplace tag.
 */
export async function loadSkillsFromAllSources(
  primaryMatrix: MergedSkillsMatrix,
  sourceConfig: ResolvedConfig,
  projectDir: string,
  marketplace?: string,
  unbackedSkillIds: ReadonlySet<SkillId> = new Set(),
): Promise<void> {
  const { name: primarySourceName, type: primarySourceType } = marketplaceSource(
    sourceConfig,
    marketplace,
  );

  tagPrimarySourceSkills(primaryMatrix, sourceConfig, marketplace, unbackedSkillIds);
  tagLocalSkills(primaryMatrix);
  await tagPluginSkills(primaryMatrix, projectDir, primarySourceName, primarySourceType);
  setActiveSources(primaryMatrix);
}

/** A fresh object per call: the tagging pass mutates the entry it is handed. */
export function marketplaceSource(sourceConfig: ResolvedConfig, marketplace?: string): SkillSource {
  return {
    name: marketplace ?? sourceConfig.marketplace ?? DEFAULT_PUBLIC_SOURCE_NAME,
    type: isDefaultSource(sourceConfig.source) ? "public" : "private",
    installed: false,
    primary: true,
  };
}

function tagPrimarySourceSkills(
  matrix: MergedSkillsMatrix,
  sourceConfig: ResolvedConfig,
  marketplace: string | undefined,
  unbackedSkillIds: ReadonlySet<SkillId>,
): void {
  for (const [id, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    if (!skill) continue;
    if (unbackedSkillIds.has(id)) continue;

    addAvailableSource(skill, marketplaceSource(sourceConfig, marketplace));
  }
}

function tagLocalSkills(matrix: MergedSkillsMatrix): void {
  let count = 0;
  for (const [, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    if (!skill) continue;
    if (!skill.local) continue;

    const source: SkillSource = {
      name: EJECT_SOURCE,
      type: "local",
      installed: true,
      installMode: "eject",
    };

    addAvailableSource(skill, source);
    count++;
  }

  verbose(`Tagged ${count} local skills with local source`);
}

async function tagPluginSkills(
  matrix: MergedSkillsMatrix,
  projectDir: string,
  primarySourceName: string,
  primarySourceType: SkillSourceType,
): Promise<void> {
  const allPluginSkillIds = await collectPluginSkillIds(projectDir);

  if (allPluginSkillIds.length === 0) {
    return;
  }

  for (const skillId of allPluginSkillIds) {
    const skill = matrix.skills[skillId];
    if (!skill) continue;

    markInstalledAsPlugin(skill, primarySourceName, primarySourceType);
  }

  verbose(`Tagged ${allPluginSkillIds.length} plugin-installed skills`);
}

/** Uses the skill's own marketplace entry, so a seated global skill keeps its own label. */
function markInstalledAsPlugin(
  skill: ResolvedSkill,
  primarySourceName: string,
  primarySourceType: SkillSourceType,
): void {
  skill.availableSources = skill.availableSources ?? [];

  const existingSource = skill.availableSources.find((s) => s.primary === true);
  if (existingSource && !existingSource.installMode) {
    existingSource.installed = true;
    existingSource.installMode = "plugin";
    return;
  }
  if (skill.availableSources.some((s) => s.installMode === "plugin")) return;

  addAvailableSource(skill, {
    name: primarySourceName,
    type: primarySourceType,
    installed: true,
    installMode: "plugin",
    primary: true,
  });
}

async function collectPluginSkillIds(projectDir: string): Promise<SkillId[]> {
  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const skillIds = typedKeys<SkillId>(pluginSkills);

  // From a project, also the home directory's plugins.
  const homeDir = os.homedir();
  if (!isHomeDirectory(projectDir)) {
    const globalPluginSkills = await discoverAllPluginSkills(homeDir);
    const globalSkillIds = typedKeys<SkillId>(globalPluginSkills);
    if (globalSkillIds.length > 0) {
      verbose(`Found ${globalSkillIds.length} global plugin skill(s)`);
      const merged = new Set([...skillIds, ...globalSkillIds]);
      return [...merged];
    }
  }

  if (skillIds.length === 0) {
    verbose("No plugin skills discovered from settings.json");
  }

  return skillIds;
}

/** Prefers installed source; falls back to first available */
function setActiveSources(matrix: MergedSkillsMatrix): void {
  for (const [, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    if (!skill) continue;
    if (!skill.availableSources || skill.availableSources.length === 0) continue;

    const [firstSource] = skill.availableSources;
    if (!firstSource) continue;
    skill.activeSource = skill.availableSources.find((s) => s.installed) ?? firstSource;
  }
}
