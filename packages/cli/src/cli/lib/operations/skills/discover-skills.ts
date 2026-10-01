import { discoverAllPluginSkills } from "../../plugins/index.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
// loadSkillsFromDir lives in loading/ (a leaf) so both this module and
// plugins/plugin-discovery can share it without an operations↔plugins cycle.
import { loadSkillsFromDir, type LoadedSkills } from "../../loading/index.js";
import { verbose } from "../../../utils/logger.js";
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
 * Discovers the skills copied in rather than installed as plugins, at one scope of one project.
 *
 * **It composed `<rootDir>/.claude/skills` until 2026-09-22, for every provider**, which made this
 * the last Claude literal on the eject READ path: a Codex installation copies its skills to
 * `$CODEX_HOME/skills` and `<repo>/.agents/skills` — the WRITE path routes through the layout
 * already — and this read went on looking in a directory that host never writes to. Nothing failed:
 * the scan answered "no skills", which is the same answer an empty installation gives.
 *
 * The scope is a required argument rather than a defaulted one, for the reason C2 deleted
 * `DEFAULT_PROVIDER`: a default is invisible at the call site, and the two call sites below mean
 * different things by it. The provider is READ off the scope root the same way
 * `resolveInstallPaths` reads it, from one probe, so the directory and the prefix cannot name two
 * different installations.
 */
export async function discoverLocalProjectSkills(
  projectDir: string,
  scope: SkillScope,
): Promise<LoadedSkills> {
  const provider = providerInUse(installBaseDir(projectDir, scope));

  return loadSkillsFromDir(skillsDir(provider, scope, projectDir), {
    pathPrefix: skillsPathPrefix(provider, scope, projectDir),
    requireMetadata: true,
  });
}

/** Where the global scope's copied-in skills are, for the diagnostic line that names them. */
function globalSkillsRoot(): string {
  const home = globalInstallRoot();
  return skillsDir(providerInUse(home), "global", home);
}

/** The same, for whichever scope the project pass asked. */
function projectSkillsRoot(projectDir: string, scope: SkillScope): string {
  return skillsDir(providerInUse(installBaseDir(projectDir, scope)), scope, projectDir);
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
 * Discovers all installed skills for a project directory using a 4-way merge: the global scope's
 * plugins and copied-in skills, then the project's own of each, so the project wins on conflict.
 *
 * **Every one of the four is resolved per PROVIDER rather than spelled as a Claude path.** The
 * plugin halves go through `hostAt(...).listPlugins` and the copied-in halves through
 * {@link discoverLocalProjectSkills}; on Claude that is `~/.claude/{plugins,skills}` and
 * `<project>/.claude/{plugins,skills}` exactly as it always was, and on Codex it is the Codex
 * state root and the repository's own `.agents/skills`.
 *
 * Pure function — no user-facing logging. Callers add their own log messages.
 * Uses verbose() for diagnostic output only.
 */
export async function discoverInstalledSkills(projectDir: string): Promise<DiscoveredSkills> {
  const isGlobalProject = isHomeDirectory(projectDir);

  // 1. Global plugins
  const globalPluginSkills = isGlobalProject
    ? {}
    : await discoverAllPluginSkills(globalInstallRoot());
  const globalPluginSkillCount = typedKeys<SkillId>(globalPluginSkills).length;
  if (globalPluginSkillCount > 0) {
    verbose(`  Found ${globalPluginSkillCount} skills from global plugins`);
  }

  // 2. Global local skills
  const globalLocal = isGlobalProject
    ? NO_LOCAL_SKILLS
    : await discoverLocalProjectSkills(projectDir, "global");
  const globalLocalSkillCount = typedKeys<SkillId>(globalLocal.skills).length;
  if (globalLocalSkillCount > 0) {
    verbose(`  Found ${globalLocalSkillCount} global local skills from ${globalSkillsRoot()}`);
  }

  // 3. Project plugins
  const pluginSkills = await discoverAllPluginSkills(projectDir);
  const pluginSkillCount = typedKeys<SkillId>(pluginSkills).length;
  verbose(`  Found ${pluginSkillCount} skills from installed plugins`);

  // 4. Project local skills.
  //
  // At the HOME root the two scopes are one installation, so the project pass asks the GLOBAL
  // scope — which is the same directory on Claude and is `$CODEX_HOME/skills` rather than
  // `<home>/.agents/skills` on Codex. Asking both and merging would double the local count on
  // every Claude run for no gain.
  const localScope: SkillScope = isGlobalProject ? "global" : "project";
  const local = await discoverLocalProjectSkills(projectDir, localScope);
  const localSkillCount = typedKeys<SkillId>(local.skills).length;
  verbose(
    `  Found ${localSkillCount} local skills from ${projectSkillsRoot(projectDir, localScope)}`,
  );

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
