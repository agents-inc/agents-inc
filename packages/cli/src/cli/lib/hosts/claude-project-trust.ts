import path from "path";
import { realpath } from "fs/promises";

import { z } from "zod";

import { agentCodec, agentsDir, claudeStateFile } from "../installation/install-layout.js";
import { isHomeDirectory } from "../installation/is-home-directory.js";
import { fileExists, glob, readFile, readFileOptional } from "../../utils/fs.js";
import type { Provider } from "../../consts.js";

/**
 * Warns when Claude Code will drop a project sub-agent's Stop hook: project hooks run only once
 * `~/.claude.json` records `projects[<key>].hasTrustDialogAccepted`, keyed by the git repository
 * root (a linked worktree's main checkout). Reads that state, never writes it.
 */

const claudeStateSchema = z.object({ projects: z.record(z.string(), z.unknown()) });

const trustedProjectSchema = z.object({ hasTrustDialogAccepted: z.literal(true) });

/** `Stop`/`SubagentStop` with at least one definition; the template writes compact JSON. */
const STOP_HOOK_LINE = /^hooks:\s*\{.*"(Stop|SubagentStop)":\[\{/m;
const FRONTMATTER_FENCE = "---";

const GIT_ENTRY = ".git";
const GITDIR_PREFIX = "gitdir:";
const COMMONDIR_FILE = "commondir";
const BACK_LINK_FILE = "gitdir";
const WORKTREES_DIR = "worktrees";

/** "never asks": a folder above is trusted, so no prompt appears and only the record can fix it. */
type ClaudeTrust =
  | { readonly kind: "trusted" }
  | { readonly kind: "asks" }
  | { readonly kind: "never asks"; readonly recordKey: string };

type TrustRecord = (folder: string) => boolean;

/** Empty from the home directory: `~/.claude/agents/` is trusted unconditionally. */
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

export function claudeProjectNeedsTrustMessage(projectDir: string, count: number): string {
  return (
    `Claude Code runs a project sub-agent's completion gate (its Stop hook — the project's ` +
    `typecheck, unless the sub-agent declares its own) only once you trust the folder: open ` +
    `Claude Code in ${projectDir} and accept the trust prompt. Until then, ${completionGates(count)} ` +
    `will not run, and nothing will say so.`
  );
}

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

/** Unreadable counts as untrusted: a wrong "untrusted" costs one line of advice. */
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

function foldersUpTo(folder: string, top?: string): string[] {
  const parent = path.dirname(folder);
  if (folder === top || parent === folder) return [folder];
  return [folder, ...foldersUpTo(parent, top)];
}

async function gitRepositoryRoot(folder: string): Promise<string | undefined> {
  const candidates = foldersUpTo(folder);
  const holdsGit = await Promise.all(
    candidates.map((candidate) => fileExists(path.join(candidate, GIT_ENTRY))),
  );
  return candidates.find((_, index) => holdsGit[index]);
}

/**
 * A linked worktree (`.git` file pointing into `<main>/.git/worktrees/`, which points back) is
 * keyed by its main checkout; anything else by `root` itself.
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

async function pathRecordedIn(dir: string, file: string): Promise<string> {
  return path.resolve(dir, (await readFileOptional(path.join(dir, file))).trim());
}

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
