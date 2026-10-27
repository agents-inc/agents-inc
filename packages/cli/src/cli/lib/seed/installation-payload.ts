import os from "os";
import path from "path";

import {
  configToSeedPayload,
  isInstalled,
  skillsItsMarketplaceLeavesBehind,
} from "./config-to-seed.js";
import { readCarriedSkills } from "./external-skills.js";
import { EJECT_SOURCE } from "../../consts.js";
import { withoutExcludedAssignments } from "../agents/agent-recompiler.js";
import { loadConfigInPlay, loadProjectConfigFromDir } from "../configuration/project-config.js";
import { activeAgentScopeMap, activeSkillScopeMap } from "../configuration/scope-predicates.js";
import { getProjectConfigPath, resolveInstallPaths } from "../installation/install-base-dir.js";
import { readForkedFromMetadata } from "../skills/skill-metadata.js";
import { getErrorMessage } from "../../utils/errors.js";
import { directoryExists } from "../../utils/fs.js";
import { ERROR_MESSAGES } from "../../utils/messages.js";
import { typedEntries } from "../../utils/typed-object.js";

import type { ContentReading, OwnedSkillDir } from "./external-skills.js";
import type { LoadedProjectConfig } from "../configuration/project-config.js";
import type { AgentScopeConfig, ProjectConfig, SkillConfig, SkillId } from "../../types/index.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * Counts come off the payload, not the config, so what is announced matches what is posted.
 * `leftBehind`: carried skills the payload's one marketplace does not serve. `inProject`: read from
 * a project's config rather than HOME's.
 */
export type InstallationPayload =
  | {
      ok: true;
      payload: SeedPayload;
      skills: number;
      agents: number;
      leftBehind: SkillId[];
      inProject: boolean;
    }
  | { ok: false; error: string };

/** `inheritedFrom` is absent when the config read is the global one already. */
type InstalledConfig =
  | {
      ok: true;
      config: ProjectConfig;
      inheritedFrom: ProjectConfig | undefined;
      inProject: boolean;
    }
  | { ok: false; error: string };

type MappedPayload = { ok: true; payload: SeedPayload } | { ok: false; error: string };

type RoundTrip = { config: ProjectConfig; content: ContentReading };

type SkillJudgement = { skill: SkillConfig; owned: boolean; carried: OwnedSkillDir | null };

/** `share`'s, and what `edit --ui` marks; fails as a message, never a throw. */
export async function seedPayloadForInstallation(projectDir: string): Promise<InstallationPayload> {
  const installed = await readInstalledConfig(projectDir);
  if (!installed.ok) return installed;

  const roundTrip = await readRoundTrip(installed.config, projectDir);
  const mapped = mapOrRefuse(roundTrip, installed.inheritedFrom);
  if (!mapped.ok) return mapped;

  const { payload } = mapped;
  const skills = Object.keys(payload.skills).length;
  const agents = Object.keys(payload.agents).length;

  // A sub-agent is installable without skills, so only neither-skills-nor-agents is empty.
  if (skills === 0 && agents === 0) return { ok: false, error: ERROR_MESSAGES.NO_INSTALLATION };

  const leftBehind = skillsItsMarketplaceLeavesBehind(roundTrip.config, payload);
  return { ok: true, payload, skills, agents, leftBehind, inProject: installed.inProject };
}

/**
 * Made in a project, the link says so: the editor holds its global entries, which a run there
 * cannot change. A share's recipient has a global install of their own, so `share` never marks.
 */
export async function editorPayloadForInstallation(
  projectDir: string,
): Promise<InstallationPayload> {
  const prepared = await seedPayloadForInstallation(projectDir);
  if (!prepared.ok || !prepared.inProject) return prepared;

  return { ...prepared, payload: { ...prepared.payload, fromProject: true } };
}

/** An unloadable config, HOME's included, is reported as its own error, not "not installed". */
async function readInstalledConfig(projectDir: string): Promise<InstalledConfig> {
  try {
    const loaded = await loadConfigInPlay(projectDir);
    if (!loaded) return { ok: false, error: ERROR_MESSAGES.NO_INSTALLATION };
    const inheritedFrom = await readInheritedConfig(loaded);
    return {
      ok: true,
      config: withInheritedCuration(loaded.config, inheritedFrom),
      inheritedFrom,
      inProject: !isGlobalConfig(loaded),
    };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function readInheritedConfig(
  loaded: LoadedProjectConfig,
): Promise<ProjectConfig | undefined> {
  if (isGlobalConfig(loaded)) return undefined;

  // Aborts: a throw reaches readInstalledConfig and refuses the share.
  const home = await loadProjectConfigFromDir(os.homedir(), loaded.provider);
  return home?.config;
}

function isGlobalConfig(loaded: LoadedProjectConfig): boolean {
  return loaded.configPath === getProjectConfigPath(os.homedir(), loaded.provider);
}

/**
 * A project file keeps stack rows for its own sub-agents only, so inherited sub-agents take their
 * rows from the global config (which wins, since it compiles them).
 */
function withInheritedCuration(
  config: ProjectConfig,
  inheritedFrom: ProjectConfig | undefined,
): ProjectConfig {
  if (inheritedFrom?.stack === undefined) return config;

  return { ...config, stack: { ...config.stack, ...inheritedRows(config, inheritedFrom.stack) } };
}

/** Narrowed to inherited sub-agents and skills, so no global row lands on a project-scoped entry. */
function inheritedRows(
  config: ProjectConfig,
  globalStack: NonNullable<ProjectConfig["stack"]>,
): NonNullable<ProjectConfig["stack"]> {
  const agents = inheritedAgents(config.agents);
  const rows = Object.fromEntries(typedEntries(globalStack).filter(([agent]) => agents.has(agent)));
  return withoutExcludedAssignments(rows, skillsNotInherited(config.skills));
}

function inheritedAgents(agents: AgentScopeConfig[]): Set<string> {
  const scopes = activeAgentScopeMap(agents);
  return new Set(agents.map((agent) => agent.name).filter((name) => scopes.get(name) === "global"));
}

function skillsNotInherited(skills: SkillConfig[]): Set<SkillId> {
  const scopes = activeSkillScopeMap(skills);
  return new Set(skills.map((skill) => skill.id).filter((id) => scopes.get(id) !== "global"));
}

/**
 * Drops skills the CLI did not write (no `forkedFrom`): a user-authored skill is outside the round
 * trip, neither carried nor refused.
 */
async function readRoundTrip(config: ProjectConfig, projectDir: string): Promise<RoundTrip> {
  const owned = (await judgeSkills(config, projectDir)).filter((entry) => entry.owned);

  return {
    config: { ...config, skills: owned.map((entry) => entry.skill) },
    content: await readCarriedSkills(owned.flatMap((entry) => entry.carried ?? [])),
  };
}

function judgeSkills(config: ProjectConfig, projectDir: string): Promise<SkillJudgement[]> {
  return Promise.all(config.skills.map((skill) => judgeSkill(skill, projectDir)));
}

/** User-authored skills, which `edit --from` must not read a payload's silence as deleting. */
export async function skillsAuthoredHere(
  config: ProjectConfig,
  projectDir: string,
): Promise<Set<SkillId>> {
  const judged = await judgeSkills(config, projectDir);
  return new Set(judged.filter((entry) => !entry.owned).map((entry) => entry.skill.id));
}

function travelsAsAnId(skill: SkillConfig): SkillJudgement {
  return { skill, owned: true, carried: null };
}

/** Only an existing directory with no provenance is the user's own work. */
async function judgeSkill(skill: SkillConfig, projectDir: string): Promise<SkillJudgement> {
  if (skill.origin !== EJECT_SOURCE) return travelsAsAnId(skill);
  if (!isInstalled(skill)) return travelsAsAnId(skill);

  const skillsDir = resolveInstallPaths(projectDir, skill.scope).skillsDir;
  const skillDir = path.join(skillsDir, skill.id);
  if (!(await directoryExists(skillDir))) return travelsAsAnId(skill);

  const provenance = await readForkedFromMetadata(skillDir);
  if (provenance === null) return { skill, owned: false, carried: null };

  return { skill, owned: true, carried: { id: skill.id, skillDir, provenance } };
}

function mapOrRefuse(
  { config, content }: RoundTrip,
  inheritedFrom: ProjectConfig | undefined,
): MappedPayload {
  try {
    return { ok: true, payload: configToSeedPayload(config, content, inheritedFrom) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
