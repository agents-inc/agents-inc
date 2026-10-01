import type { Provider } from "../../consts.js";
import { PROVIDERS } from "../../consts.js";
import { fileExists } from "../../utils/fs.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { scopeRootsInPlay, type ScopeKind, type ScopeRoot } from "./source-scopes.js";

/**
 * What a run finds when it asks the disk which installations are there.
 *
 * The folder is the only record of a provider — there is no field in `config.ts`, and a shared
 * payload carries none either, so one saved setup installs on either provider. Discovery reading
 * the folder is therefore the whole of "the provider is derivable after the install", and it is
 * what lets `compile`, `edit`, `update`, `uninstall`, `share`, `eject` and `doctor` need no flag.
 *
 * **One installation is exactly one provider, and a root holding two folders holds TWO of them.**
 * `.agents-inc/` is a parent rather than an installation, so `.agents-inc/claude/` beside
 * `.agents-inc/codex/` is a pair of single-provider installations. The answer is a LIST, nothing
 * in it is mixed, and a root holding both is never collapsed into whichever the preference order
 * reaches first — that collapse is exactly what `getProjectConfigPath` did before C2 gave it a
 * provider, silently and with a path that exists and parses.
 */

/** One installation on disk: which provider it belongs to, which scope it is, and its config. */
export type DetectedInstallation = {
  provider: Provider;
  scope: ScopeKind;
  /** The config file as it is actually read — a pre-rename installation names `.claude-src/`. */
  configPath: string;
};

/**
 * Every installation a run from `cwd` can see, global before project and, within a scope, in the
 * provider roster's own order.
 *
 * An installation is a source folder holding a `config.ts`, never a folder that merely exists: a
 * consuming repository keeps its own state under `.agents-inc/` — the benchmark's hand gate writes
 * `baseline.json` and an `attempts/` directory there — and an empty or half-built provider folder
 * beside a live installation must not be reported as a second one.
 *
 * A pre-rename scope answers `claude` at `.claude-src/config.ts`. The provider names the
 * installation rather than the folder it was found under: a discovery that asked only which
 * `.agents-inc/<provider>/` directories exist would answer nothing at all on every machine that
 * has not moved its folder by hand, and tell those users they have nothing installed.
 */
export async function detectInstallations(cwd: string): Promise<DetectedInstallation[]> {
  const everywhereOneCouldBe = scopeRootsInPlay(cwd).flatMap(everyProviderUnder);
  const found = await Promise.all(everywhereOneCouldBe.map(installationIfPresent));

  return found.filter(
    (installation): installation is DetectedInstallation => installation !== null,
  );
}

/** Where each provider's installation WOULD be under one scope root, whatever is on disk. */
function everyProviderUnder({ kind, root }: ScopeRoot): DetectedInstallation[] {
  return PROVIDERS.map((provider) => ({
    provider,
    scope: kind,
    configPath: getProjectConfigPath(root, provider),
  }));
}

/** The same entry back when its config file is really there, and `null` when it is not. */
async function installationIfPresent(
  candidate: DetectedInstallation,
): Promise<DetectedInstallation | null> {
  return (await fileExists(candidate.configPath)) ? candidate : null;
}
