import path from "node:path";

import { CLAUDE_DIR, STANDARD_DIRS } from "../../consts.js";
import { unusedSourceFolderName, type SourceFolderMove } from "./install-layout.js";
import { listAgentMdFiles } from "../agents/list-compiled-agents.js";
import { readFile } from "../../utils/fs.js";
import {
  bothSourceFoldersPresent,
  compiledAgentNamesTheOtherFolder,
  layoutIsCurrent,
  layoutIsLegacy,
  scopeLabel,
} from "../../utils/messages.js";
import { folderBeingRead, type SourceScope } from "./source-scopes.js";

/**
 * What `doctor`'s Layout row says about one scope.
 *
 * The row and the write commands' refusal read the same state through the same functions on
 * purpose: a collision one of them reports and the other does not is a state a user cannot get
 * out of. Reading is what `doctor` does, so it reports the state the refusal stops on rather than
 * stopping on it itself.
 *
 * One row per scope, never one for the machine. Two scopes can be on different layouts, and a
 * single row for both can only ever be wrong about one of them.
 */

/** A row: how serious it is, the sentence it leads with, and what else is true of this scope. */
export type LayoutFinding = {
  status: "pass" | "warn" | "fail";
  message: string;
  details: string[];
};

export async function layoutFindingFor(scope: SourceScope): Promise<LayoutFinding> {
  const { move } = scope;
  const label = scopeLabel(scope.kind);

  // A provider that never had a legacy folder has no move to describe, and until 2026-09-22 that
  // left the row printing the scope's NAME with no predicate after it — "This project", which is
  // not a sentence and says nothing about the layout the row exists to report. Both faults this
  // row can otherwise carry are properties of having two folder names: `both` is false by
  // construction for such a provider, and `unusedSourceFolderName` answers `null`, so there is
  // nothing to lead with and the layout statement is the whole row.
  if (move === null) {
    return { status: "pass", message: layoutIsCurrent(label, scope.relName), details: [] };
  }

  const whichLayout = layoutStatement(scope, move, label);
  const faults = await faultsFor(scope, move);
  const [worst, ...rest] = faults;

  if (worst === undefined) return { ...whichLayout, details: [] };

  // The fault leads and the layout becomes a detail: both are true, and a row can only carry one
  // status — so the line a reader must act on is the one at the top.
  return {
    status: "fail",
    message: `${label}: ${worst}`,
    details: [...rest.map((fault) => `${label}: ${fault}`), whichLayout.message],
  };
}

/** Which of the two folders this scope is on, and how much of a problem that is on its own. */
function layoutStatement(
  scope: SourceScope,
  move: SourceFolderMove,
  label: string,
): Pick<LayoutFinding, "status" | "message"> {
  if (!scope.legacy) return { status: "pass", message: layoutIsCurrent(label, move.to.relName) };
  return { status: "warn", message: layoutIsLegacy(label, move.from.relName, move.to.relName) };
}

/** Everything wrong with this scope's layout, most serious first. */
async function faultsFor(scope: SourceScope, move: SourceFolderMove): Promise<string[]> {
  const staleAgents = await compiledAgentsNamingTheOtherFolder(scope);
  return [...rivalFolderFault(scope, move), ...staleAgents];
}

/** Two folders on disk: whichever the resolver picked, the other one is being read by nobody. */
function rivalFolderFault(scope: SourceScope, move: SourceFolderMove): string[] {
  if (!scope.both) return [];
  return [
    bothSourceFoldersPresent(move.from.relName, move.to.relName, folderBeingRead(scope, move)),
  ];
}

/**
 * Installed agents whose own prompt names the folder this scope is NOT on.
 *
 * `agent-summoner`'s playbook tells an agent where to author new sub-agents, so a copy compiled
 * under the other layout aims that instruction at a folder the resolver does not read: the files
 * it writes never compile, and nothing else in the product reports it. The remedy is a recompile,
 * which is what the message says.
 */
async function compiledAgentsNamingTheOtherFolder(scope: SourceScope): Promise<string[]> {
  const unused = unusedSourceFolderName(scope.root, scope.provider);
  if (unused === null) return [];

  const agentsDir = path.join(scope.root, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
  const files = await listAgentMdFiles(agentsDir);
  const named = await Promise.all(
    files.map(async (file) => ({
      file,
      names: await namesFolder(path.join(agentsDir, file), unused),
    })),
  );

  return named
    .filter((entry) => entry.names)
    .map((entry) => compiledAgentNamesTheOtherFolder(entry.file, unused));
}

/** Whether one compiled agent's text names the folder. An unreadable file names nothing. */
async function namesFolder(agentPath: string, folder: string): Promise<boolean> {
  try {
    return (await readFile(agentPath)).includes(folder);
  } catch {
    return false;
  }
}
