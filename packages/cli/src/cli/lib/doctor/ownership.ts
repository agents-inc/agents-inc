/**
 * What an installation holds that its configuration does not account for: `doctor`'s No Orphans
 * row. Agent files are judged against the configuration whatever wrote them; a skill folder only
 * when it carries `forkedFrom`, so a user's own folder is never an orphan.
 */

import path from "path";
import { groupBy } from "remeda";

import type { CheckedInstallation, ConfigState, Hosts } from "./installation-reads.js";
import { listAgentFilesOf } from "../agents/index.js";
import {
  agentFilesWithOurProvenanceIn,
  listSkillDirsWithOurProvenance,
  skillDirsWithOurProvenanceIn,
} from "../content-validator.js";
import {
  agentCodec,
  agentsDir,
  skillsDir,
  type AgentCodec,
} from "../installation/install-layout.js";
import { directoryExists } from "../../utils/fs.js";
import { typedValues } from "../../utils/typed-object.js";
import type { ProjectConfig, SkillScope } from "../../types/index.js";

export type Orphans = { skills: string[]; agents: string[] };

export type Ownership = {
  /** Display paths of what this CLI provably wrote into a folder no configuration declares. */
  unowned: Orphans;
  /** File and folder names, not paths, in a declared folder its configuration does not claim. */
  orphans: Orphans;
};

/**
 * One folder of one kind, once however many scopes share it, and the names a configuration claims
 * in it: `null` where none declares its scope, so only what this CLI provably wrote there is named.
 */
type JudgedFolder = { dir: string; claimed: ReadonlySet<string> | null };

type JudgedAgentFolder = JudgedFolder & { codec: AgentCodec };

/** `config` is `null` only where `state` is absent: a config the checks rejected is not judged. */
export async function judgeOwnership(
  state: ConfigState,
  config: ProjectConfig | null,
  installation: CheckedInstallation,
): Promise<Ownership> {
  const agentFolders = agentFoldersToJudge(state, config, installation);
  const skillFolders = skillFoldersToJudge(state, config, installation);

  const [unowned, orphans] = await Promise.all([
    unownedIn(agentFolders, skillFolders),
    orphansIn(agentFolders, skillFolders),
  ]);
  return { unowned, orphans };
}

function agentFoldersToJudge(
  state: ConfigState,
  config: ProjectConfig | null,
  { projectDir, hosts }: CheckedInstallation,
): JudgedAgentFolder[] {
  return oncePerFolder(
    scopesToJudge(state, hosts).map((scope) => ({
      dir: agentsDir(hosts[scope], scope, projectDir),
      codec: agentCodec(hosts[scope]),
      claimed: claimed(state, scope, config && agentNamesClaimedIn(config, scope)),
    })),
  );
}

function skillFoldersToJudge(
  state: ConfigState,
  config: ProjectConfig | null,
  { projectDir, hosts }: CheckedInstallation,
): JudgedFolder[] {
  return oncePerFolder(
    scopesToJudge(state, hosts).map((scope) => ({
      dir: skillsDir(hosts[scope], scope, projectDir),
      claimed: claimed(state, scope, config && skillIdsClaimedIn(config, scope)),
    })),
  );
}

/**
 * Project first. Beside its own config a project is judged in the global folders only when they
 * are its provider's: another provider's global ones belong to an installation this config does
 * not describe.
 */
function scopesToJudge(state: ConfigState, hosts: Hosts): SkillScope[] {
  const ownConfig = state.kind !== "absent" && !inherits(state);
  return ownConfig && hosts.global !== hosts.project ? ["project"] : ["project", "global"];
}

function inherits(state: ConfigState): boolean {
  return state.kind === "loaded" && state.inherited;
}

/** `null` for a scope no configuration declares: none at all, or a project inheriting one. */
function claimed(
  state: ConfigState,
  scope: SkillScope,
  names: string[] | null,
): ReadonlySet<string> | null {
  if (names === null || state.kind === "absent") return null;
  if (inherits(state) && scope === "project") return null;
  return new Set(names);
}

function agentNamesClaimedIn(config: ProjectConfig, scope: SkillScope): string[] {
  return config.agents.filter((agent) => claimsAt(agent, scope)).map((agent) => agent.name);
}

function skillIdsClaimedIn(config: ProjectConfig, scope: SkillScope): string[] {
  return config.skills.filter((skill) => claimsAt(skill, scope)).map((skill) => skill.id);
}

/** An excluded global entry still serves other projects; an excluded project one serves nothing. */
function claimsAt(entry: { scope: SkillScope; excluded?: boolean }, scope: SkillScope): boolean {
  return entry.scope === scope && (scope === "global" || !entry.excluded);
}

/** Two scopes can share a folder (Claude's at home): judged once, against both claims. */
function oncePerFolder<Folder extends JudgedFolder>(folders: Folder[]): Folder[] {
  return typedValues(groupBy(folders, (folder) => folder.dir)).map((sharing) =>
    sharing.reduce(joinClaims),
  );
}

function joinClaims<Folder extends JudgedFolder>(into: Folder, from: Folder): Folder {
  if (into.claimed === null) return from;
  if (from.claimed === null) return into;
  return { ...into, claimed: new Set([...into.claimed, ...from.claimed]) };
}

async function unownedIn(
  agentFolders: JudgedAgentFolder[],
  skillFolders: JudgedFolder[],
): Promise<Orphans> {
  const [skills, agents] = await Promise.all([
    Promise.all(
      skillFolders.filter(isUnclaimed).map(({ dir }) => skillDirsWithOurProvenanceIn(dir)),
    ),
    Promise.all(
      agentFolders
        .filter(isUnclaimed)
        .map(({ dir, codec }) => agentFilesWithOurProvenanceIn(dir, codec)),
    ),
  ]);
  return { skills: skills.flat(), agents: agents.flat() };
}

async function orphansIn(
  agentFolders: JudgedAgentFolder[],
  skillFolders: JudgedFolder[],
): Promise<Orphans> {
  const [skills, agents] = await Promise.all([
    Promise.all(skillFolders.map(unclaimedSkillDirs)),
    Promise.all(agentFolders.map(unclaimedAgentFiles)),
  ]);
  return { skills: skills.flat(), agents: agents.flat() };
}

function isUnclaimed(folder: JudgedFolder): boolean {
  return folder.claimed === null;
}

async function unclaimedSkillDirs({ dir, claimed }: JudgedFolder): Promise<string[]> {
  if (claimed === null) return [];
  const ours = await listSkillDirsWithOurProvenance(dir);
  return ours.filter((name) => !claimed.has(name));
}

async function unclaimedAgentFiles({ dir, codec, claimed }: JudgedAgentFolder): Promise<string[]> {
  if (claimed === null || !(await directoryExists(dir))) return [];
  const files = await listAgentFilesOf(dir, codec);
  return files.filter((file) => !claimed.has(path.basename(file, codec.extension)));
}
