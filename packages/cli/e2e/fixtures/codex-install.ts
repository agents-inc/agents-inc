import path from "path";

import { CLI, type CLIResult } from "./cli.js";
import { codexHome } from "../helpers/test-utils.js";
import { DIRS } from "../pages/constants.js";

import type { ProjectHandle } from "../pages/wizard-result.js";
import type { SeedConfigStore } from "./seed-config-store.js";

/**
 * What a C4 spec needs to drive an install onto Codex and then look at where it landed.
 *
 * Everything here is one composition or one path join. The measuring instruments — the pinned
 * binary, the prompt Codex would send, the global-config reset — live in `codex.ts`, because a
 * spec that asks "did Codex read it" must ask Codex rather than this file.
 *
 * **The provider arrives on the COMMAND and nowhere else.** There is no `provider` field in
 * `config.ts`, nothing in a shared payload carries one, and the share id does not encode one — so
 * one saved configuration installs onto either provider and every existing id keeps working. After
 * the install the folder on disk is the whole record, which is why {@link CODEX_SOURCE_REL} and
 * {@link CLAUDE_SOURCE_REL} are what the assertions read rather than any file's contents.
 */

/** The flag pair `init --from` takes to install onto Codex. Real from C4, documented from C7b. */
export const PROVIDER_CODEX = ["--provider", "codex"] as const;

/** The same flag naming the provider a Claude install is, for the paired allowed case. */
export const PROVIDER_CLAUDE = ["--provider", "claude"] as const;

/**
 * The three mode/scope cells a Codex installation offers, spelled the way a refusal names them.
 *
 * MIRRORED from `lib/hosts/offered-placements.ts`'s `${mode}+${scope}` rather than imported, for
 * the reason `e2e/pages/constants.ts` gives at length: an assertion that imports the string the
 * product renders moves both sides at once and cannot fail. A message that stops naming all three
 * has to redden here.
 *
 * Plugin+project is the fourth cell and is deliberately absent — Codex has no per-project plugin
 * INSTALL (no subcommand takes a scope, and `plugin add` from inside a project writes the switch
 * to the global config and silently un-scopes it). A shared configuration asking for it is refused
 * naming these three, never quietly ejected.
 */
export const CODEX_OFFERED_CELLS = ["plugin+global", "eject+global", "eject+project"] as const;

/** The cell Codex does not offer, spelled the same way. */
export const CODEX_REFUSED_CELL = "plugin+project";

/** Where a Codex installation's config pair sits under a scope root. */
export const CODEX_SOURCE_REL = DIRS.SOURCE_CODEX;

/** Where a Claude installation's does — the folder a Codex run must never create. */
export const CLAUDE_SOURCE_REL = DIRS.SOURCE_CLAUDE;

/**
 * Where `eject` + `global` puts a skill on Codex: `$CODEX_HOME/skills/<id>/SKILL.md` (D14).
 *
 * `~/.agents/skills` also reaches the model and is deliberately NOT this: uninstall and doctor
 * have to agree with where Codex reads, `$CODEX_HOME` moves with the variable wherever a user
 * puts it, and `~/.agents/skills` is a shared namespace this product does not own.
 */
export function codexGlobalSkillsDir(home: string): string {
  return path.join(codexHome(home), DIRS.SKILLS);
}

/**
 * Where `eject` + `project` puts one: `<repo>/.agents/skills/<id>/SKILL.md`.
 *
 * A committed file BY DESIGN rather than a degraded fallback — it reaches the model in that
 * repository and nowhere else, with no plugin, no install, no marketplace, no trust entry and no
 * global config file at all. That is Codex's own mechanism for a project skill, and it is why
 * `<repo>/skills/`, which Codex does not read, must never be written to.
 */
export function codexProjectSkillsDir(projectDir: string): string {
  return path.join(projectDir, DIRS.CODEX_PROJECT_SKILLS);
}

/** Where Codex stages an installed plugin's files, under the HOME its `CODEX_HOME` sits in. */
export function codexPluginCacheDir(home: string): string {
  return path.join(codexHome(home), DIRS.PLUGINS, "cache");
}

/**
 * `init --from <id> --provider codex`, the one command that produces a Codex installation.
 *
 * `--marketplace` comes along for the same reason `runInitFrom` carries it: the payload names
 * skills by catalogue id and the fixture source is local, so the run has to be told where the
 * catalogue is. It is not a provider-aware flag and does not become one.
 */
export function runInitFromOnCodex(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  sourceDir: string,
  extraArgs: readonly string[] = [],
): Promise<CLIResult> {
  return CLI.run(
    ["init", "--from", id, "--marketplace", sourceDir, ...PROVIDER_CODEX, ...extraArgs],
    project,
    { env: { AGENTS_INC_API_URL: store.url } },
  );
}

/** The same install without the flag, so every Codex claim has a Claude control beside it. */
export function runInitFromOnClaude(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  sourceDir: string,
): Promise<CLIResult> {
  return CLI.run(["init", "--from", id, "--marketplace", sourceDir], project, {
    env: { AGENTS_INC_API_URL: store.url },
  });
}
