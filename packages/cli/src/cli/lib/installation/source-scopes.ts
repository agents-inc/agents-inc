import os from "os";

import type { Provider } from "../../consts.js";
import { isHomeDirectory } from "./is-home-directory.js";
import { providerInUse, sourceFolderInUse } from "./install-layout.js";
import { directoryExists } from "../../utils/fs.js";

/**
 * The scopes a run reads, and which source folder each one holds — what `doctor`'s Layout row
 * reports on, one row per scope.
 *
 * One enumeration of "the scopes in play", shared with installation discovery, so the two cannot
 * disagree about whether the home directory counts twice.
 */

/** Which of a run's two scopes this is — the directory the command was run in, or the machine's. */
export type ScopeKind = "project" | "global";

/** One scope a run reads, and the directory it is rooted at. */
export type ScopeRoot = { kind: ScopeKind; root: string };

/** A scope with a source folder on disk. */
export type SourceScope = {
  kind: ScopeKind;
  /** The directory the source folder sits under: a project root, or the home directory. */
  root: string;
  /** Which installation this scope holds, read off the folder. */
  provider: Provider;
  /** The folder this scope is read from, as a user writes it — `.agents-inc/claude`. */
  relName: string;
};

/**
 * Every scope of this run that holds an installation, global first.
 *
 * A scope with no source folder on disk is left out rather than reported as on the current layout:
 * there is nothing there, and a command that congratulated an empty directory on its layout would
 * say it of every directory anyone ever ran it in.
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
  const folder = sourceFolderInUse(root, provider);
  if (!(await directoryExists(folder.dir))) return null;

  return { kind, root, provider, relName: folder.relName };
}
