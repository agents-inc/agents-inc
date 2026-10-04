import path from "path";
import { realpath } from "fs/promises";

import { z } from "zod";

import { agentCodec, agentsDir, claudeStateFile } from "../installation/install-layout.js";
import { isHomeDirectory } from "../installation/is-home-directory.js";
import { fileExists, glob, readFile, readFileOptional } from "../../utils/fs.js";
import type { Provider } from "../../consts.js";

/**
 * Whether Claude Code will run the completion gate a PROJECT installation just compiled — and the
 * line that says so when it will not.
 *
 * **Every writing sub-agent carries one.** Compile gives each sub-agent holding `Write` or `Edit` a
 * `Stop` hook that runs the project's typecheck (`withCompletionGate` in `@workspace/compile`'s
 * `agent-source.ts`), unless the sub-agent declares a `Stop` or `SubagentStop` hook of its own,
 * which is then its completion gate instead. Either way it is one frontmatter line: `hooks:` and a
 * JSON record holding at least one hook under that event — a key holding an empty list states no
 * gate, which is how compile's `declaresOwnGate` reads it too.
 *
 * **A project sub-agent's hooks run only in a folder the user has trusted.** Read from the shipped
 * binary 2.1.288 and watched under a scratch HOME on 2026-10-03:
 *
 * - **The record.** Claude Code keeps the answer in `~/.claude.json` as
 *   `projects[<key>].hasTrustDialogAccepted`, where the key is the folder's git repository root —
 *   the main checkout's root for a linked worktree — or the folder itself outside any repository.
 *   Accepting the prompt writes that key, and the hook gate for `<project>/.claude/agents/` reads
 *   it, exactly. Absent or `false`, the sub-agent loads, its prompt loads, and its completion gate
 *   is dropped, logged only to Claude Code's own diagnostics.
 * - **The prompt.** Claude Code skips it when any folder from this one up to its repository root —
 *   or up to `/` outside one — is recorded as trusted. So below a trusted plain folder it never
 *   asks, while the gate still reads the folder's own key and keeps the hooks off.
 *
 * **So the install says it, and only while it is true.** Owner, 2026-09-26: _"yes ofc"_ to telling
 * the user. It is the Claude sibling of `codex-project-trust.ts`, and it READS the host's state and
 * never writes it — accepting the dialog is the user's act. A global installation needs nothing:
 * Claude Code trusts `~/.claude/agents/` unconditionally, and that folder is also the project
 * agents directory of a run from the home directory, so such a run says nothing either.
 */

/** The part of `~/.claude.json` this reads. Every other project's record is left unparsed. */
const claudeStateSchema = z.object({ projects: z.record(z.string(), z.unknown()) });

/** One project's record, answering only the question asked of it. */
const trustedProjectSchema = z.object({ hasTrustDialogAccepted: z.literal(true) });

/**
 * The frontmatter line a completion gate is written on: `hooks:` with `Stop` or `SubagentStop` as a
 * key holding at least one definition. A line naming only other events is a hook, and nothing this
 * notice is about; an empty list under the key states no gate. The template writes the record
 * through Liquid's `json` filter, compact, which is why the key and its first `{` are adjacent.
 */
const STOP_HOOK_LINE = /^hooks:\s*\{.*"(Stop|SubagentStop)":\[\{/m;
const FRONTMATTER_FENCE = "---";

/** The entry whose presence makes a folder a repository root, and a linked worktree's pointer. */
const GIT_ENTRY = ".git";
const GITDIR_PREFIX = "gitdir:";
/** What a linked worktree's own git directory holds, and where the main repository keeps it. */
const COMMONDIR_FILE = "commondir";
const BACK_LINK_FILE = "gitdir";
const WORKTREES_DIR = "worktrees";

/**
 * How Claude Code stands toward a project folder: trusted, untrusted and asking, or untrusted and
 * never asking — a folder above it is trusted — which leaves only the record itself to set.
 */
type ClaudeTrust =
  | { readonly kind: "trusted" }
  | { readonly kind: "asks" }
  | { readonly kind: "never asks"; readonly recordKey: string };

/** Whether `~/.claude.json` records `folder` as trusted. */
type TrustRecord = (folder: string) => boolean;

/**
 * The notice a Claude install owes when this project holds sub-agents carrying a completion gate
 * and the folder is not trusted, as lines — empty for every other provider, for a run from the
 * home directory, for a trusted project, and for one whose sub-agents carry none.
 */
export async function claudeCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  if (provider !== "claude") return [];
  if (isHomeDirectory(projectDir)) return [];

  const withAStopHook = await projectAgentsWithAStopHook(projectDir);
  if (withAStopHook.length === 0) return [];

  const trust = await claudeTrustOf(projectDir);
  switch (trust.kind) {
    case "trusted":
      return [];
    case "asks":
      return [claudeProjectNeedsTrustMessage(projectDir, withAStopHook.length)];
    case "never asks":
      return [claudeProjectNeverAskedMessage(trust.recordKey, withAStopHook.length)];
    default: {
      const _exhaustive: never = trust;
      return _exhaustive;
    }
  }
}

/**
 * The line itself. It names the folder and the remedy, because the failure it warns about prints
 * nothing anywhere a user would read.
 */
export function claudeProjectNeedsTrustMessage(projectDir: string, count: number): string {
  return (
    `Claude Code runs a project sub-agent's completion gate (its Stop hook — the project's ` +
    `typecheck, unless the sub-agent declares its own) only once you trust the folder: open ` +
    `Claude Code in ${projectDir} and accept the trust prompt. Until then, ${completionGates(count)} ` +
    `will not run, and nothing will say so.`
  );
}

/**
 * The line for a folder Claude Code will never ask about, naming the one remedy left — the one
 * Claude Code's own diagnostic gives.
 */
export function claudeProjectNeverAskedMessage(recordKey: string, count: number): string {
  return (
    `Claude Code runs ${completionGates(count)} only once you trust the folder, and will not ask ` +
    `here: set projects[${JSON.stringify(recordKey)}].hasTrustDialogAccepted to true in ` +
    `${claudeStateFile()}.`
  );
}

function completionGates(count: number): string {
  return count === 1 ? "1 sub-agent's completion gate" : `${count} sub-agents' completion gates`;
}

/** Reads the project's trust the way Claude Code does: by its record's key, then by its prompt. */
async function claudeTrustOf(projectDir: string): Promise<ClaudeTrust> {
  const [isTrusted, repositoryRoot] = await Promise.all([
    trustRecord(),
    gitRepositoryRoot(projectDir),
  ]);
  const recordKey =
    repositoryRoot === undefined ? projectDir : await canonicalRepositoryRoot(repositoryRoot);
  if (isTrusted(recordKey)) return { kind: "trusted" };

  const promptSuppressed = foldersUpTo(projectDir, repositoryRoot).some(isTrusted);
  return promptSuppressed ? { kind: "never asks", recordKey } : { kind: "asks" };
}

/**
 * The trust record in `~/.claude.json`. Anything it cannot read counts as untrusted, which is the
 * safe direction: the cost of a wrong "untrusted" is one line of advice, and the cost of a wrong
 * "trusted" is a completion gate nobody knows is off.
 */
async function trustRecord(): Promise<TrustRecord> {
  const stateFile = claudeStateFile();
  if (!(await fileExists(stateFile))) return () => false;

  const state = claudeStateSchema.safeParse(parsedOrUndefined(await readFile(stateFile)));
  if (!state.success) return () => false;

  const { projects } = state.data;
  return (folder) => trustedProjectSchema.safeParse(projects[folder]).success;
}

function parsedOrUndefined(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** `folder` and each folder above it, nearest first, up to `top` — or to the filesystem root. */
function foldersUpTo(folder: string, top?: string): string[] {
  const parent = path.dirname(folder);
  if (folder === top || parent === folder) return [folder];
  return [folder, ...foldersUpTo(parent, top)];
}

/** The nearest folder at or above `folder` holding a `.git` entry, as Claude Code finds it. */
async function gitRepositoryRoot(folder: string): Promise<string | undefined> {
  const candidates = foldersUpTo(folder);
  const holdsGit = await Promise.all(
    candidates.map((candidate) => fileExists(path.join(candidate, GIT_ENTRY))),
  );
  return candidates.find((_, index) => holdsGit[index]);
}

/**
 * The root Claude Code keys a repository by: the main checkout's, where `root` is a linked
 * worktree — its `.git` file points into `<main>/.git/worktrees/`, and that directory points back —
 * and `root` itself otherwise, a `.git` directory or a pointer that does not check out included.
 */
async function canonicalRepositoryRoot(root: string): Promise<string> {
  // A `.git` directory reads as empty, as a missing file does.
  const pointer = (await readFileOptional(path.join(root, GIT_ENTRY))).trim();
  if (!pointer.startsWith(GITDIR_PREFIX)) return root;

  const gitDir = path.resolve(root, pointer.slice(GITDIR_PREFIX.length).trim());
  const [commonDir, backLink] = await Promise.all([
    pathRecordedIn(gitDir, COMMONDIR_FILE),
    pathRecordedIn(gitDir, BACK_LINK_FILE),
  ]);
  const isLinkedWorktree =
    path.dirname(gitDir) === path.join(commonDir, WORKTREES_DIR) &&
    (await pointsBackAt(backLink, root));
  if (!isLinkedWorktree) return root;

  // A worktree of a bare repository is keyed by the bare repository's own folder.
  return path.basename(commonDir) === GIT_ENTRY ? path.dirname(commonDir) : commonDir;
}

/** The path a git bookkeeping file in `dir` holds, resolved against `dir`; `dir` if it is absent. */
async function pathRecordedIn(dir: string, file: string): Promise<string> {
  return path.resolve(dir, (await readFileOptional(path.join(dir, file))).trim());
}

/** Whether a worktree's back-link names `root`'s own `.git`, both read through symlinks. */
async function pointsBackAt(backLink: string, root: string): Promise<boolean> {
  const [linked, realRoot] = await Promise.all([
    realpathOrUndefined(backLink),
    realpathOrUndefined(root),
  ]);
  return realRoot !== undefined && linked === path.join(realRoot, GIT_ENTRY);
}

async function realpathOrUndefined(file: string): Promise<string | undefined> {
  try {
    return await realpath(file);
  } catch {
    return undefined;
  }
}

/** The compiled sub-agents in this project's own agents directory that carry a completion gate. */
async function projectAgentsWithAStopHook(projectDir: string): Promise<string[]> {
  const dir = agentsDir("claude", "project", projectDir);
  const files = await glob(agentCodec("claude").listGlob, dir);
  const carriers = await Promise.all(
    files.map(async (file) => ((await carriesAStopHook(path.join(dir, file))) ? [file] : [])),
  );
  return carriers.flat();
}

async function carriesAStopHook(agentFile: string): Promise<boolean> {
  const [, frontmatter = ""] = (await readFile(agentFile)).split(FRONTMATTER_FENCE);
  return STOP_HOOK_LINE.test(frontmatter);
}
