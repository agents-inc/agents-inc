import path from "path";

import { configToSeedPayload, isInstalled } from "./config-to-seed.js";
import { readCarriedSkills } from "./external-skills.js";
import { EJECT_SOURCE } from "../../consts.js";
import { loadProjectConfig } from "../configuration/project-config.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { readForkedFromMetadata } from "../skills/skill-metadata.js";
import { getErrorMessage } from "../../utils/errors.js";
import { directoryExists } from "../../utils/fs.js";
import { ERROR_MESSAGES } from "../../utils/messages.js";

import type { ContentReading, OwnedSkillDir } from "./external-skills.js";
import type { ProjectConfig, SkillConfig, SkillId } from "../../types/index.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * A payload ready to post, and what it will install — counted the way the sharer's own screens
 * count it, off the payload rather than off the config, so what a caller announces and what it
 * posts cannot disagree.
 */
export type InstallationPayload =
  { ok: true; payload: SeedPayload; skills: number; agents: number } | { ok: false; error: string };

/** The config to map, or the sentence explaining why there is none to map. */
type InstalledConfig = { ok: true; config: ProjectConfig } | { ok: false; error: string };

/** The mapped payload, or every line naming something the contract cannot carry. */
type MappedPayload = { ok: true; payload: SeedPayload } | { ok: false; error: string };

/** The installation as the round trip sees it: what it owns, and what it has to carry with it. */
type RoundTrip = { config: ProjectConfig; content: ContentReading };

/**
 * What the round trip makes of one installed entry: whether it travels at all, and whether its
 * bytes travel with it.
 */
type SkillJudgement = { skill: SkillConfig; owned: boolean; carried: OwnedSkillDir | null };

/**
 * Read, map, refuse — everything that can fail locally, failing before anybody spends a write.
 *
 * Shared by the two commands that mint an id for what is installed here: `share`, which reports
 * the id, and `edit --ui`, which opens it. They are one operation with two endings, and this is
 * the half that has to be identical — two spellings of "the installation in this directory"
 * would mint two different ids for one project, and only one of them would be true.
 *
 * Every failure is a message rather than a throw, because nothing has been written by the time
 * it runs: the caller's only job is to explain, and both callers explain the same way.
 */
export async function seedPayloadForInstallation(projectDir: string): Promise<InstallationPayload> {
  const installed = await readInstalledConfig(projectDir);
  if (!installed.ok) return installed;

  const mapped = mapOrRefuse(await readRoundTrip(installed.config, projectDir));
  if (!mapped.ok) return mapped;

  const { payload } = mapped;
  const skills = Object.keys(payload.skills).length;
  const agents = Object.keys(payload.agents).length;

  // The same guard `init --from` applies on arrival, applied here before the write instead of
  // there after it. A sub-agent is installable on its own — it has front-matter, a prompt and a
  // compiled file without owning a single skill — so only a configuration with neither skills
  // nor sub-agents is nothing to carry.
  if (skills === 0 && agents === 0) return { ok: false, error: ERROR_MESSAGES.NO_INSTALLATION };

  return { ok: true, payload, skills, agents };
}

/**
 * The installation this directory has: its own configuration, or the global one it inherits.
 *
 * That is the config every other command reads here, and it carries the entries of BOTH scopes
 * with each entry's own scope on it — which is exactly what the wire keys by. So a payload minted
 * from a project describes the whole of what is installed for it rather than half of it, and the
 * receiver puts each entry back where this one had it.
 *
 * A config file that exists but cannot be loaded is a fault, not an absence, so its own message
 * is reported rather than read as "not installed".
 */
async function readInstalledConfig(projectDir: string): Promise<InstalledConfig> {
  try {
    const loaded = await loadProjectConfig(projectDir);
    if (!loaded) return { ok: false, error: ERROR_MESSAGES.NO_INSTALLATION };
    return { ok: true, config: loaded.config };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

/**
 * The installation minus what the round trip does not own, plus the content it has to take along.
 *
 * `forkedFrom` decides ownership, and the round trip leaves what it does not own alone. The CLI
 * stamps that key into every skill directory it writes — an ejected catalogue skill, and a skill
 * a payload carried inline — while a skill the user wrote by hand into `.claude/skills/` carries
 * none. So absence of the key is not the whole answer and provenance is: what the CLI put there
 * says so on disk, and what a person put there says nothing because nothing forked it.
 *
 * A user-authored skill is therefore neither carried nor refused — it is simply outside the
 * round trip, and nothing about leaving it home is lossy because it was never in scope. Dropping
 * it here rather than in a command is what keeps `share` and `edit --ui`, which mint an id from
 * the same directory, from disagreeing about a single project.
 *
 * The stack rows naming a dropped skill go with it: `configToSeedPayload` keys assignments by
 * the skills it carries, so a row whose skill is gone is gone too.
 *
 * One walk answers both questions, because they are asked of the same file: whether the CLI put
 * this directory here, and — for the one kind of skill no catalogue can resolve — where its bytes
 * came from, so they can travel a second time.
 */
async function readRoundTrip(config: ProjectConfig, projectDir: string): Promise<RoundTrip> {
  const owned = (await judgeSkills(config, projectDir)).filter((entry) => entry.owned);

  return {
    config: { ...config, skills: owned.map((entry) => entry.skill) },
    content: await readCarriedSkills(owned.flatMap((entry) => entry.carried ?? [])),
  };
}

/** Every installed entry, judged. One walk of the disk, whichever half of the trip is asking. */
function judgeSkills(config: ProjectConfig, projectDir: string): Promise<SkillJudgement[]> {
  return Promise.all(config.skills.map((skill) => judgeSkill(skill, projectDir)));
}

/**
 * The installed skills the round trip does NOT own — the user's own work, sitting in
 * `.claude/skills/` with no `forkedFrom` to say the CLI put it there.
 *
 * The producer already drops these on the way out, so no payload minted here ever named one.
 * This is the same judgement read by the other half: `edit --from` applies a payload
 * destructively, and a payload that made no statement about a skill cannot be read as an
 * instruction to delete it. Both halves ask {@link judgeSkill}, so "outside the round trip" has
 * one definition and cannot come to mean two things on one machine.
 */
export async function skillsAuthoredHere(
  config: ProjectConfig,
  projectDir: string,
): Promise<Set<SkillId>> {
  const judged = await judgeSkills(config, projectDir);
  return new Set(judged.filter((entry) => !entry.owned).map((entry) => entry.skill.id));
}

/** The entry travels and no directory is read for it: a row naming an id is the whole of it. */
function travelsAsAnId(skill: SkillConfig): SkillJudgement {
  return { skill, owned: true, carried: null };
}

/**
 * How one installed entry answers to the round trip — asked of the disk, offline, exactly as
 * `uninstall` asks it before removing anything.
 *
 * Only a directory that EXISTS and carries no provenance is somebody's own work, and that is the
 * one thing this excludes; each guard below says why the case above it never gets that far.
 */
async function judgeSkill(skill: SkillConfig, projectDir: string): Promise<SkillJudgement> {
  // A marketplace skill has no local directory to hold provenance and needs none: the marketplace
  // is what installs it again.
  if (skill.origin !== EJECT_SOURCE) return travelsAsAnId(skill);
  // A tombstone is a statement about something that is NOT installed here, so there are no bytes
  // of it to carry — and a refusal raised over them would refuse a share for a skill it is not
  // sharing.
  if (!isInstalled(skill)) return travelsAsAnId(skill);

  const skillsDir = resolveInstallPaths(projectDir, skill.scope).skillsDir;
  const skillDir = path.join(skillsDir, skill.id);
  // A configuration recording an install that is not there is evidence of nothing rather than
  // evidence of authorship, so it travels as the configuration records it.
  if (!(await directoryExists(skillDir))) return travelsAsAnId(skill);

  const provenance = await readForkedFromMetadata(skillDir);
  if (provenance === null) return { skill, owned: false, carried: null };

  return { skill, owned: true, carried: { id: skill.id, skillDir, provenance } };
}

/**
 * The mapping, with its refusals turned into this module's own currency.
 *
 * `configToSeedPayload` throws, and what it throws is a list: every line names something this
 * installation has that a shared configuration cannot say. That is a message for the user, not a
 * fault to propagate — the alternative is worse than a failed command, because a payload quietly
 * missing what it could not say still mints an id, and that id installs a configuration nobody
 * chose.
 */
function mapOrRefuse({ config, content }: RoundTrip): MappedPayload {
  try {
    return { ok: true, payload: configToSeedPayload(config, content) };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
