import os from "os";

import type { Provider } from "../../consts.js";
import { isHomeDirectory } from "./is-home-directory.js";
import { providerInUse, sourceFolderInUse } from "./install-layout.js";
import { directoryExists } from "../../utils/fs.js";

export type ScopeKind = "project" | "global";

export type ScopeRoot = { kind: ScopeKind; root: string };

export type SourceScope = {
  kind: ScopeKind;
  root: string;
  provider: Provider;
  /** As a user writes it: `.agents-inc/claude`. */
  relName: string;
};

/**
 * Scopes with a source folder on disk, global first. Each is read with the provider `providerOf`
 * names, off its folder by default; `doctor` names one installation's for both.
 */
export async function sourceScopesInPlay(
  cwd: string,
  providerOf: (scope: ScopeRoot) => Provider = ({ root }) => providerInUse(root),
): Promise<SourceScope[]> {
  const scopes = await Promise.all(
    scopeRootsInPlay(cwd).map(async (scope) =>
      describeScope(scope.kind, scope.root, providerOf(scope)),
    ),
  );
  return scopes.filter((scope): scope is SourceScope => scope !== null);
}

/** Global first; run from home, the two scopes collapse into the global one. */
export function scopeRootsInPlay(cwd: string): ScopeRoot[] {
  const global: ScopeRoot = { kind: "global", root: os.homedir() };
  if (isHomeDirectory(cwd)) return [global];
  return [global, { kind: "project", root: cwd }];
}

async function describeScope(
  kind: ScopeKind,
  root: string,
  provider: Provider,
): Promise<SourceScope | null> {
  const folder = sourceFolderInUse(root, provider);
  if (!(await directoryExists(folder.dir))) return null;

  return { kind, root, provider, relName: folder.relName };
}
