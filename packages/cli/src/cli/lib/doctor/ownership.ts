/**
 * What an installation holds that its configuration does not account for: `doctor`'s No Orphans
 * row. An agents folder a configuration declares is judged against it, whatever wrote the files;
 * one none declares, by this CLI's marker. Skill folders only where no configuration exists at
 * all, by `forkedFrom`: `eject skills` copies in stamped folders that no configuration lists.
 */

import path from "path";
import { groupBy, unique } from "remeda";

import type { CheckedInstallation, ConfigState, Hosts } from "./installation-reads.js";
import { listAgentFilesOf } from "../agents/index.js";
import {
  agentFilesWithOurProvenanceIn,
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

export type Ownership = {
  /** Display paths of what this CLI provably wrote into a folder no configuration declares. */
  unowned: { skills: string[]; agents: string[] };
  /** File names, not paths, in a declared agents folder its configuration does not claim. */
  orphanedAgentFiles: string[];
};

/**
 * One agents folder, once however many scopes share it, and the names a configuration claims in
 * it: `null` where none declares its scope, so only what this CLI provably wrote there is named.
 */
type JudgedAgentFolder = { dir: string; codec: AgentCodec; claimed: ReadonlySet<string> | null };

/** `config` is `null` only where `state` is absent: a config the checks rejected is not judged. */
export async function judgeOwnership(
  state: ConfigState,
  config: ProjectConfig | null,
  installation: CheckedInstallation,
): Promise<Ownership> {
  const agentFolders = agentFoldersToJudge(state, config, installation);

  const [skills, agents, orphanedAgentFiles] = await Promise.all([
    unownedSkillDirs(state, installation),
    unownedAgentFiles(agentFolders),
    Promise.all(agentFolders.map(unclaimedAgentFiles)),
  ]);
  return { unowned: { skills, agents }, orphanedAgentFiles: orphanedAgentFiles.flat() };
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

/** Only where no configuration exists anywhere: then every stamped folder is a leftover. */
async function unownedSkillDirs(
  state: ConfigState,
  { projectDir, hosts }: CheckedInstallation,
): Promise<string[]> {
  if (state.kind !== "absent") return [];

  const dirs = unique(
    scopesToJudge(state, hosts).map((scope) => skillsDir(hosts[scope], scope, projectDir)),
  );
  const listed = await Promise.all(dirs.map(skillDirsWithOurProvenanceIn));
  return listed.flat();
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

/** An excluded global entry still serves other projects; an excluded project one serves nothing. */
function claimsAt(entry: { scope: SkillScope; excluded?: boolean }, scope: SkillScope): boolean {
  return entry.scope === scope && (scope === "global" || !entry.excluded);
}

/** Two scopes can share a folder (Claude's at home): judged once, against both claims. */
function oncePerFolder(folders: JudgedAgentFolder[]): JudgedAgentFolder[] {
  return typedValues(groupBy(folders, (folder) => folder.dir)).map((sharing) =>
    sharing.reduce(joinClaims),
  );
}

function joinClaims(into: JudgedAgentFolder, from: JudgedAgentFolder): JudgedAgentFolder {
  if (into.claimed === null) return from;
  if (from.claimed === null) return into;
  return { ...into, claimed: new Set([...into.claimed, ...from.claimed]) };
}

async function unownedAgentFiles(agentFolders: JudgedAgentFolder[]): Promise<string[]> {
  const listed = await Promise.all(
    agentFolders
      .filter((folder) => folder.claimed === null)
      .map(({ dir, codec }) => agentFilesWithOurProvenanceIn(dir, codec)),
  );
  return listed.flat();
}

async function unclaimedAgentFiles({ dir, codec, claimed }: JudgedAgentFolder): Promise<string[]> {
  if (claimed === null || !(await directoryExists(dir))) return [];
  const files = await listAgentFilesOf(dir, codec);
  return files.filter((file) => !claimed.has(path.basename(file, codec.extension)));
}
