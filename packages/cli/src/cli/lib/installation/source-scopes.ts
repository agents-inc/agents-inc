import os from "os";

import type { Provider } from "../../consts.js";
import { isHomeDirectory } from "./is-home-directory.js";
import {
  plannedSourceFolderMove,
  providerInUse,
  resolveSourceDir,
  type SourceFolderMove,
} from "./install-layout.js";
import { directoryExists } from "../../utils/fs.js";

/**
 * The scopes `doctor`'s Layout row and the write commands' rival-folder refusal both answer for,
 * and which layout each one is on.
 *
 * One list, shared, because the two surfaces have to agree: a scope `doctor` calls a collision is
 * a scope a write must refuse, and two enumerations of "the scopes in play" are two things that
 * can disagree about whether the home directory counts twice.
 *
 * Nothing here moves a folder. An installation on the name every pre-rename install carries is
 * read AND written where it is, indefinitely; moving one is a manual step, documented in
 * `.ai-docs/reference/concepts/source-folder-layout.md`.
 */

/** Which of a run's two scopes this is — the directory the command was run in, or the machine's. */
export type ScopeKind = "project" | "global";

/** One scope a run reads, and the directory it is rooted at. */
export type ScopeRoot = { kind: ScopeKind; root: string };

/** A scope with a source folder on disk, and the state that folder is in. */
export type SourceScope = {
  kind: ScopeKind;
  /** The directory the source folder sits under: a project root, or the home directory. */
  root: string;
  /**
   * Which installation this scope holds, read off the folder.
   *
   * Carried rather than re-derived by each reader: `legacy`, `both` and `move` are all answers
   * ABOUT one provider — the retired name is Claude's — so a reader resolving its own provider
   * could describe a different installation from the one these three fields describe.
   */
  provider: Provider;
  /** Whether this scope is still on the folder every pre-rename installation carries. */
  legacy: boolean;
  /** Whether this provider's two folders are both on disk as rivals. */
  both: boolean;
  /**
   * The folder this scope is read from, as a user writes it — `.agents-inc/codex`, `.claude-src`.
   *
   * Carried for {@link SourceScope.provider}'s reason and answering the question
   * {@link SourceScope.move} cannot: a provider that never had a legacy folder has no move to
   * describe — the retired name is Claude's — and doctor's
   * Layout row still owes a sentence saying which folder the scope is on. Read off the same
   * `resolveSourceDir` call that decided `legacy` and `both`, so the three cannot describe
   * different folders.
   */
  relName: string;
  /** Where the source is, and the folder it belongs under. `null` for a provider with no legacy folder. */
  move: SourceFolderMove | null;
};

/**
 * The folder this scope is actually READ from, as a message spells it.
 *
 * Every sentence that names two folders has to say which one is live, and the answer is not the
 * current name: the preference order takes whichever folder holds a `config.ts` before it looks
 * at content, so a scope whose config has not been moved by hand is read from the OLD name
 * however much sits under the new one. That is the exact arrangement the refusal is read in, so a
 * sentence hard-wired to the new name was wrong in the one state it is read in.
 */
export function folderBeingRead(scope: SourceScope, move: SourceFolderMove): string {
  return scope.legacy ? move.from.relName : move.to.relName;
}

/**
 * Every scope of this run that holds an installation, global first.
 *
 * A scope with NEITHER folder on disk is left out rather than reported as already on the current
 * name: there is nothing there, and a command that congratulated an empty directory on its layout
 * would say it of every directory anyone ever ran it in.
 *
 * Run from the home directory, the project scope and the global scope are the same directory and
 * one entry is returned — the global one, because that is what the installation IS.
 */
export async function sourceScopesInPlay(cwd: string): Promise<SourceScope[]> {
  const scopes = await Promise.all(
    scopeRootsInPlay(cwd).map(async ({ kind, root }) =>
      describeScope(kind, root, providerInUse(root)),
    ),
  );
  return scopes.filter((scope): scope is SourceScope => scope !== null);
}

/**
 * The directories a run from `cwd` looks in, global first.
 *
 * Run from the home directory the project scope and the global scope are the same directory, and
 * an installation counted twice is a second installation that does not exist — so the two collapse
 * into the global one. Exported because installation discovery enumerates the same scopes, and
 * this module's own rule is that two enumerations are two things that can disagree.
 */
export function scopeRootsInPlay(cwd: string): ScopeRoot[] {
  const global: ScopeRoot = { kind: "global", root: os.homedir() };
  if (isHomeDirectory(cwd)) return [global];
  return [global, { kind: "project", root: cwd }];
}

/** One scope's layout, or `null` when nothing of this product is in that directory at all. */
export async function describeScope(
  kind: ScopeKind,
  root: string,
  provider: Provider,
): Promise<SourceScope | null> {
  const resolved = resolveSourceDir(root, provider);
  const present = resolved.legacy || (await directoryExists(resolved.dir));
  if (!present) return null;

  return {
    kind,
    root,
    provider,
    legacy: resolved.legacy,
    both: resolved.both,
    relName: resolved.relName,
    move: plannedSourceFolderMove(root, provider),
  };
}
