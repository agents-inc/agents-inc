import os from "os";

import { isHomeDirectory } from "../installation/is-home-directory";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts";
import type { MergedSkillsMatrix, SkillId, SkillSource, SkillSourceType } from "../../types";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { isDefaultSource, type ResolvedConfig } from "../configuration";
import { discoverAllPluginSkills } from "../plugins";

/**
 * Appends a source to the skill's availableSources, initializing the array on
 * first tag. In-place mutation is this module's documented tagging contract.
 */
function addAvailableSource(
  skill: { availableSources?: SkillSource[] },
  source: SkillSource,
): void {
  skill.availableSources = skill.availableSources ?? [];
  skill.availableSources.push(source);
}

/**
 * Annotates every skill in the matrix with its install-mode availability metadata.
 *
 * Runs a four-phase tagging pipeline that mutates `primaryMatrix.skills` in place:
 * 1. **Primary** -- tags all skills with the one marketplace (public or private)
 * 2. **Local** -- tags skills with `local: true` as installed via local source
 * 3. **Plugin** -- detects plugin-installed skills via `settings.json` and global cache
 * 4. **Active source** -- sets `activeSource` to the installed variant, or first available
 *
 * After this function completes, each skill in the matrix has `availableSources` -- at most
 * the local copy and the one marketplace, which are the two install modes the Sources step
 * offers -- and `activeSource` (the one currently in use) populated.
 *
 * @param primaryMatrix - The merged skills matrix to annotate. Mutated in place --
 *                        `availableSources` and `activeSource` are set on each skill.
 * @param sourceConfig - Resolved source configuration, used to determine whether the
 *                       marketplace is a private one or the default public source
 * @param projectDir - Absolute path to the project root, used to locate plugin directories
 * @param marketplace - Optional marketplace name resolved from the source's marketplace.json.
 *                      Takes precedence over `sourceConfig.marketplace` when provided.
 *
 * @remarks
 * **Side effects:** Mutates `primaryMatrix` in place.
 */
export async function loadSkillsFromAllSources(
  primaryMatrix: MergedSkillsMatrix,
  sourceConfig: ResolvedConfig,
  projectDir: string,
  marketplace?: string,
): Promise<void> {
  const resolvedMarketplace = marketplace ?? sourceConfig.marketplace;
  const primarySourceName = resolvedMarketplace ?? DEFAULT_PUBLIC_SOURCE_NAME;
  const primarySourceType: SkillSourceType = isDefaultSource(sourceConfig.source)
    ? "public"
    : "private";

  tagPrimarySourceSkills(primaryMatrix, primarySourceName, primarySourceType);
  tagLocalSkills(primaryMatrix);
  await tagPluginSkills(primaryMatrix, projectDir, primarySourceName, primarySourceType);
  setActiveSources(primaryMatrix);
}

function tagPrimarySourceSkills(
  matrix: MergedSkillsMatrix,
  sourceName: string,
  sourceType: SkillSourceType,
): void {
  for (const [, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (!skill) continue;

    const source: SkillSource = {
      name: sourceName,
      type: sourceType,
      installed: false,
      primary: true,
    };

    addAvailableSource(skill, source);
  }
}

function tagLocalSkills(matrix: MergedSkillsMatrix): void {
  let count = 0;
  for (const [, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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

    skill.availableSources = skill.availableSources ?? [];

    const existingSource = skill.availableSources.find((s) => s.name === primarySourceName);
    if (existingSource && !existingSource.installMode) {
      existingSource.installed = true;
      existingSource.installMode = "plugin";
    } else if (!skill.availableSources.some((s) => s.installMode === "plugin")) {
      skill.availableSources.push({
        name: primarySourceName,
        type: primarySourceType,
        installed: true,
        installMode: "plugin",
        primary: true,
      });
    }
  }

  verbose(`Tagged ${allPluginSkillIds.length} plugin-installed skills`);
}

/**
 * Collects skill IDs from all enabled plugins via settings.json and global cache.
 * Uses {@link discoverAllPluginSkills} to find skills from the plugin registry.
 */
async function collectPluginSkillIds(projectDir: string): Promise<SkillId[]> {
  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const skillIds = typedKeys<SkillId>(pluginSkills);

  // D-160: Also discover global plugins when editing from a project directory.
  // Follows the same global+project merge pattern as local skills in source-loader.ts.
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

/** Prefers installed source so the wizard shows current state; falls back to first available */
function setActiveSources(matrix: MergedSkillsMatrix): void {
  for (const [, skill] of typedEntries(matrix.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (!skill) continue;
    if (!skill.availableSources || skill.availableSources.length === 0) continue;

    // Prefer installed source, then fall back to first available
    const [firstSource] = skill.availableSources;
    if (!firstSource) continue;
    skill.activeSource = skill.availableSources.find((s) => s.installed) ?? firstSource;
  }
}
