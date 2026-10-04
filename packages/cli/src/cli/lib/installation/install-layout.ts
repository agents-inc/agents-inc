import fs from "fs";
import os from "os";
import path from "path";

import {
  compilesForCodex,
  hasCodexRoleMarker,
  hasProvenanceMarker,
} from "@workspace/compile/agent-source";

import {
  CLAUDE_DIR,
  LEGACY_SOURCE_DIR,
  PLUGINS_SUBDIR,
  PROVIDERS,
  SOURCE_ROOT_DIR,
  sourceDirName,
  STANDARD_DIRS,
  STANDARD_FILES,
  type Provider,
} from "../../consts.js";
import type { AgentName } from "../../types/agents.js";
import type { SkillScope } from "../../types/config.js";

/**
 * Which folder a scope keeps its agents-inc source in, and how to build a path under it.
 *
 * A new installation is created in `.agents-inc/<provider>/` at both scopes. An installation made
 * before that flip keeps `.claude-src/`, is read there and written there indefinitely, and moves
 * only when a user moves it by hand — there is no command that moves one. So the two answers here
 * have converged and differ in nothing today:
 *
 * - {@link resolveSourceDir} says which layout a scope is ON, which is what doctor's Layout row
 *   and the rival-folder refusal each need.
 * - {@link sourceFolderInUse} says which folder this release reads from and writes to, which is
 *   where every path the CLI builds under a source folder comes from.
 *
 * They are kept as two names because they answer two questions, and a provider whose folders both
 * exist is answered differently by each.
 *
 * It is also where the HOST roles live — `userConfigRoot`, `agentsDir`, `skillsDir` and the rest
 * of the group under {@link installBaseDir} below — rather than in a second funnel beside it. A
 * source folder and a host directory are one question asked twice: both answer "where does this
 * installation put things", and both have to answer it per provider.
 */

/** Which of a scope's two possible source folders is read, and what else is on disk beside it. */
export type SourceFolder = {
  /** Absolute path of the folder. */
  dir: string;
  /** The same folder as a user writes it: `.agents-inc/claude`, or `.claude-src`. */
  relName: string;
  /** Whether it is the name every installation made before the rename carries. */
  legacy: boolean;
  /**
   * Whether this provider's new folder and the folder it replaces are BOTH on disk.
   *
   * Provider-scoped, not "the root holds two folders": the legacy name belonged to Claude, so a
   * `.claude-src/` beside a Codex installation is a second installation rather than a rival half
   * of this one, and refusing a Codex write on account of it would refuse the one arrangement the
   * ruling explicitly allows.
   */
  both: boolean;
};

/**
 * A scope's two possible source folders for one provider: the legacy one, the current one, and
 * the parent the current one sits in.
 *
 * `null` for a provider that never had a legacy folder — the name being retired is Claude's, so a
 * Codex installation has only ever had one folder and no sentence about two applies to it.
 *
 * Both ends are named as a user writes them as well as resolved, because every sentence about the
 * layout names both folders and is read by someone looking at their own disk. Moving a folder
 * from `from` to `to` is a thing the USER does by hand; nothing in this CLI moves one.
 */
export type SourceFolderMove = {
  /** The legacy folder: where a pre-rename installation's source is. */
  from: SourceFolderEnd;
  /** The provider folder under the new root: where this release creates one. */
  to: SourceFolderEnd;
  /** The `.agents-inc/` parent `to` sits in, which a manual move has to create. */
  parent: SourceRoot;
};

/** One end of a move: the absolute directory, and the relative name a message uses. */
export type SourceFolderEnd = {
  dir: string;
  relName: string;
};

/**
 * Every folder name under `.agents-inc/` that belongs to this product, in roster order.
 *
 * The one caller is the `.gitignore` remedy, which has to name all of them: a rule narrowed to the
 * provider a user happens to be on today hides the other one the day they install it, and the
 * whole point of that message is that the user does not meet this again.
 */
export function everySourceFolderName(): string[] {
  return PROVIDERS.map(sourceDirName);
}

/** `provider`'s two folder names under `root`, whatever is actually on disk. */
export function plannedSourceFolderMove(root: string, provider: Provider): SourceFolderMove | null {
  const legacy = legacyFolderFor(root, provider);
  if (legacy === null) return null;

  return {
    from: { dir: legacy, relName: LEGACY_SOURCE_DIR },
    to: { dir: sourceDir(root, provider), relName: sourceDirName(provider) },
    parent: { dir: path.join(root, SOURCE_ROOT_DIR), relName: SOURCE_ROOT_DIR },
  };
}

/**
 * The folder this scope is NOT on, as a compiled agent's own prompt would spell it.
 *
 * An installed `agent-summoner` carries an instruction about where to author new sub-agents, and
 * a copy compiled under the other layout aims that instruction at a folder this installation does
 * not read — so the files it writes never compile and nothing reports it. This is the string that
 * finding looks for. `null` where the provider has only one folder it could ever be on.
 */
export function unusedSourceFolderName(root: string, provider: Provider): string | null {
  const move = plannedSourceFolderMove(root, provider);
  if (move === null) return null;
  return sourceFolderInUse(root, provider).legacy ? move.to.relName : move.from.relName;
}

/** The folder a provider's source lives in under `root`, whether or not anything is there. */
export function sourceDir(root: string, provider: Provider): string {
  return path.join(root, SOURCE_ROOT_DIR, provider);
}

/** The parent a scope's provider folders sit under: where it is, and how a message names it. */
export type SourceRoot = {
  /** Absolute path of the parent. */
  dir: string;
  /** The same folder as a user writes it: `.agents-inc`. */
  relName: string;
};

/**
 * The `.agents-inc/` parent of the folder `provider` is read from under `root`, or `null` for a
 * scope still on the legacy name.
 *
 * `null` rather than a path, because `.claude-src/` has no parent belonging to this product: its
 * parent is the scope root, and a caller that removed THAT would take a user's project with it.
 * So the one caller that acts on this — uninstall's cleanup, which removes the parent once the
 * last provider folder under it is gone — cannot reach the destructive case at all.
 */
export function sourceRootOf(root: string, provider: Provider): SourceRoot | null {
  if (sourceFolderInUse(root, provider).legacy) return null;
  return { dir: path.join(root, SOURCE_ROOT_DIR), relName: SOURCE_ROOT_DIR };
}

/**
 * The provider a run creates an installation under when the root holds none.
 *
 * It is the ONE place this package still names a provider without reading one, and it is a
 * parameter of the run rather than a property of the disk: `init --from <id> --provider codex` is
 * what changes it, through {@link chooseProviderForThisRun}. So a root with nothing installed and
 * a run that was told nothing gets Claude, which is what every such root got before the flag
 * existed.
 *
 * It is deliberately not a default parameter on {@link sourceFolderInUse} and the rest, which is
 * what `DEFAULT_PROVIDER` was until C2. A default is invisible at every call site; this is
 * reachable only through {@link providerInUse}, whose name says the answer was read.
 */
const PROVIDER_OF_A_NEW_INSTALLATION: Provider = "claude";

/**
 * The provider `--provider` named for THIS RUN, and nothing when no flag was given.
 *
 * **It is a location parameter of one invocation, which is why it is process state rather than an
 * argument.** The alternative was threading a provider through every path builder, and the shape
 * that would take is this census, run in `packages/cli`:
 *
 * ```
 * grep -rn "providerInUse(" src --include='*.ts' --include='*.tsx' \
 *   | grep -v "__tests__\|\.test\." | grep -v "install-layout.ts:"
 * ```
 *
 * They sit in `config-gate/`, `configuration/`, `loading/`, `compiler.ts` and six commands, and
 * the ones that decide where a write LANDS are reached from inside `writeScopedFromWizard` and
 * `propagateGlobalChangesToProjects` rather than from a command. A parameter that stops at the
 * first module boundary is worse than none: it reads as threaded at every call site it reaches
 * and answers off the disk everywhere after it, which is the half-routed write this funnel exists
 * against.
 *
 * `setVerbose` in `utils/logger.ts` is the same shape and the precedent — a flag of the run, held
 * where every layer below the command can see it, in a process that runs exactly one command.
 *
 * **It is set before anything reads a path and never after.** A run that chose a provider
 * mid-flight would have already resolved some paths off the disk, which is how two answers to one
 * question get into one installation.
 */
let providerChosenForThisRun: Provider | undefined;

/**
 * Names the provider this run is about, ahead of whatever the disk says.
 *
 * Two commands' worth of reasons, and neither is served by reading the folder:
 *
 * - `init --from <id> --provider codex` creates a folder that does not exist yet, so there is no
 *   disk to read. This is the case D15 makes the flag's whole purpose.
 * - `edit`, `uninstall`, `share` and `eject` in a scope holding BOTH folders: the disk has two
 *   answers, `providerInUse` resolves them by roster order, and a command that acted on the
 *   roster's first answer would act on a user's other installation with nothing on screen saying
 *   so. Those commands refuse instead, and this is what the flag they name does.
 */
export function chooseProviderForThisRun(provider: Provider): void {
  providerChosenForThisRun = provider;
}

/**
 * Drops the choice, for a test process that outlives one run.
 *
 * Production never calls it: a CLI process runs one command and exits. A spec that set a choice
 * and did not clear it would leak it into every later spec in the same worker, which is the one
 * failure mode process state has that an argument does not.
 */
export function forgetTheProviderChosenForThisRun(): void {
  providerChosenForThisRun = undefined;
}

/**
 * Which provider's installation a run over `root` is about, read off the folder.
 *
 * The folder is the only record of a provider — there is no field in `config.ts` and nothing in
 * a shared payload carries one — so this is the whole of "the provider is derivable after the
 * install", for every caller that holds a directory and nothing else. It is also the ONE function
 * that answers it: `providerAt` asked the same question on rungs of its own until C2, answering
 * `[]` for every pre-rename machine and giving a bare `mkdir` equal standing with a live
 * installation, and the list a caller needs in order to see that a root holds two is
 * `detectInstallations`, which carries the scope and the config path with it.
 *
 * The rungs are {@link sourceFolderOnDisk}'s, asked across providers instead of across names: an
 * installation that holds a `config.ts` wins over one that merely holds a folder, because a
 * half-built or abandoned folder beside a live installation must not take the run away from it.
 * An EMPTY folder is on no rung at all, so `mkdir -p .agents-inc/codex` decides nothing.
 *
 * `undefined` is a caller that is rendering for NO installation — the compile engine built over
 * no project is the one — and gets the provider a new installation is created under, because
 * there is no disk to read.
 *
 * **A root holding a live installation of EACH provider is answered by roster order**, which is
 * Claude. That is a known limit rather than a reading of the disk: `--provider` is what picks one
 * on a greenfield install, and `detectInstallations` is what a caller uses to see that there are
 * two.
 *
 * **It refused a Codex answer by name until C4, and no longer does.** `refuseAProviderWithNoHost`
 * and the `PROVIDERS_WITH_A_HOST` roster beside it existed for the window in which the folder
 * could say `codex` and every path built under that answer was Claude's — `compile` reading
 * `.agents-inc/codex/` and writing `.md` sub-agents into `.claude/agents/`, with nothing able to
 * report it. C4 closed that window by building the host rather than by widening the roster, which
 * is why both are deleted rather than edited: a roster naming one provider and a `PROVIDERS` list
 * naming two is a disagreement waiting to be resolved in the wrong direction.
 *
 * **`--provider` beats the disk, and only where a run was given one.** The flag is the answer to
 * the two questions the folder cannot answer — a greenfield install has no folder, and a scope
 * holding two has two — so a run that was told one is about that provider at every root it
 * touches. Nothing else changes: which FOLDER that provider is read from is still
 * {@link sourceFolderInUse}'s ladder, so a pre-rename `.claude-src/` is still found by a run that
 * named `claude` out loud. See {@link chooseProviderForThisRun}.
 */
export function providerInUse(root: string | undefined): Provider {
  if (providerChosenForThisRun !== undefined) return providerChosenForThisRun;
  if (root === undefined) return PROVIDER_OF_A_NEW_INSTALLATION;
  return providerOnDisk(root);
}

/** The rung ladder: a live installation first, a started folder next, the new-installation default last. */
function providerOnDisk(root: string): Provider {
  // Rung by rung rather than both at once: each predicate probes the disk, and the second rung's
  // answer is never needed when the first one has a live installation to name.
  const live = PROVIDERS.find((provider) => holdsAnInstallation(root, provider));
  if (live !== undefined) return live;

  const started = PROVIDERS.find((provider) => holdsASourceFolder(root, provider));
  return started ?? PROVIDER_OF_A_NEW_INSTALLATION;
}

/** Whether `provider`'s source folder under `root` holds a config — a live installation. */
function holdsAnInstallation(root: string, provider: Provider): boolean {
  return holdsAConfig(sourceFolderInUse(root, provider).dir);
}

/** Whether `provider` has a source folder under `root` at all, config or not. */
function holdsASourceFolder(root: string, provider: Provider): boolean {
  return sourceFolderOnDisk(root, provider) !== null;
}

/**
 * Which folder `provider`'s source is read from under `root`, and the state of the two names
 * beside it. A scope with neither folder is named under the new layout.
 */
export function resolveSourceDir(root: string, provider: Provider): SourceFolder {
  return describeSourceFolder(
    sourceFolderOnDisk(root, provider) ?? sourceDir(root, provider),
    root,
    provider,
  );
}

/**
 * Which folder `provider`'s source is read from and written to under `root` — the answer every
 * path the CLI builds under a source folder comes from.
 *
 * @param provider is threaded, never defaulted. It carried `DEFAULT_PROVIDER` until C2, and
 *   deleting that default is what turned the census into a compiler error apiece: a defaulted
 *   provider lets a call site nobody visited go on answering `.agents-inc/claude/` for a Codex
 *   run and exit 0, which is the half-routed state this module exists against. A caller holding
 *   only a directory asks {@link providerInUse} for the answer rather than assuming one.
 */
export function sourceFolderInUse(root: string, provider: Provider): SourceFolder {
  return describeSourceFolder(
    sourceFolderOnDisk(root, provider) ?? newInstallationDir(root, provider),
    root,
    provider,
  );
}

/**
 * The config file as a user sees it written, relative to the scope root:
 * `.claude-src/config.ts`, or `.agents-inc/claude/config.ts`.
 *
 * One builder rather than one per command, because every message naming that file has to name the
 * folder this scope is ACTUALLY on. A message assembled from a constant tells a user on the old
 * name to edit a file that is not there — and the three commands that print it each used to hold
 * their own copy of the string.
 */
export function relativeConfigPath(root: string, provider: Provider): string {
  return `${sourceFolderInUse(root, provider).relName}/${STANDARD_FILES.CONFIG_TS}`;
}

/**
 * The source folder a compile writes into, as an agent's own prompt spells it, for a caller that
 * may not have an installation to name.
 *
 * `createLiquidEngine` is the caller and both of its states are real: an engine built over a
 * project names THAT project's folder, so a compiled agent tells an agent to author where this
 * install actually reads; an engine built over no project — every render that is not writing into
 * one — names the folder a new installation is created in.
 */
export function sourceFolderName(root: string | undefined, provider: Provider): string {
  if (root === undefined) return sourceDirName(provider);
  return sourceFolderInUse(root, provider).relName;
}

/**
 * The preference order, one rung per line, answering `null` when neither name is on disk.
 *
 * A config decides the winner before content does, so a legacy installation keeps being read while
 * an empty or half-built new folder sits beside it — which is what an interrupted migration leaves
 * behind, and taking a live config away from it would be the one unrecoverable outcome here.
 */
function sourceFolderOnDisk(root: string, provider: Provider): string | null {
  const preferred = sourceDir(root, provider);
  const legacy = legacyFolderFor(root, provider);

  if (holdsAConfig(preferred)) return preferred;
  if (legacy !== null && holdsAConfig(legacy)) return legacy;
  if (holdsAnything(preferred)) return preferred;
  if (legacy !== null && directoryExists(legacy)) return legacy;
  return null;
}

/**
 * Where a scope holding no source folder at all gets one CREATED.
 *
 * Every provider now gets `.agents-inc/<provider>/`, Claude included — this function IS the flip,
 * and it is the whole of it: every production path under a source folder is built from
 * {@link sourceFolderInUse}, so one return decides them all.
 *
 * It says nothing about an installation that already exists. {@link sourceFolderOnDisk} answers
 * first and prefers whichever folder holds a config, so a scope on `.claude-src/` goes on being
 * read AND written where it is, indefinitely; nothing in this CLI moves one.
 */
function newInstallationDir(root: string, provider: Provider): string {
  return sourceDir(root, provider);
}

/**
 * The legacy folder as a candidate for `provider`, which only Claude ever has.
 *
 * `null` for every other provider. Every rung that names the old folder comes through here — the
 * one preferring a legacy folder holding a `config.ts`, and the bare-folder rung under it — so a
 * provider that never had one cannot be sent to it by either.
 */
function legacyFolderFor(root: string, provider: Provider): string | null {
  return provider === "claude" ? path.join(root, LEGACY_SOURCE_DIR) : null;
}

function describeSourceFolder(dir: string, root: string, provider: Provider): SourceFolder {
  const legacy = dir === legacyFolderFor(root, provider);

  return {
    dir,
    relName: legacy ? LEGACY_SOURCE_DIR : sourceDirName(provider),
    legacy,
    both: bothFoldersPresent(root, provider),
  };
}

/**
 * Whether this provider's new folder and the folder it replaces are both on disk AS RIVALS.
 *
 * The state the write commands refuse on: with two folders the preference order picks whichever
 * holds a `config.ts`, and that can be the stale one.
 */
function bothFoldersPresent(root: string, provider: Provider): boolean {
  const legacyFolder = legacyFolderFor(root, provider);
  if (legacyFolder === null) return false;
  return directoryExists(sourceDir(root, provider)) && directoryExists(legacyFolder);
}

/**
 * Which directory a scope is rooted at: the user's home for `"global"`, the project otherwise.
 *
 * `os.homedir()` at call time rather than at module load, for the reason `globalInstallRoot`
 * writes out in `consts.ts` — a frozen copy answers from whichever home the first import saw, and
 * every later reader writes under a directory that has since been removed.
 *
 * It is declared here rather than in `install-base-dir.ts`, which re-exports it under the name its
 * ~20 callers already write: every host role below is rooted at this answer, and
 * `install-base-dir.ts` imports THIS module, so the layout cannot ask it back without a cycle.
 */
export function installBaseDir(projectDir: string, scope: SkillScope | undefined): string {
  return scope === "global" ? os.homedir() : projectDir;
}

/**
 * Where Codex keeps a user's state when `CODEX_HOME` names nowhere, and a project's own beside it.
 */
const CODEX_DIR = ".codex";

/**
 * The environment variable that relocates everything Codex keeps for a user.
 *
 * Exported for the one surface that has to agree with this read and cannot see it:
 * `e2e-runner-environment.test.ts` resolves the variable a bracket read names by IMPORTING the
 * constant, so renaming it moves what every spawn door must answer for and reddens them until
 * they follow. A value restated there would go on naming the old variable in silence.
 */
export const CODEX_HOME_VAR = "CODEX_HOME";

/**
 * Where a Codex project's skills are committed, relative to the repository root.
 *
 * A Codex project skill is a file in the repository rather than an install: it reaches the model
 * in that repository and nowhere else, with no plugin, no marketplace and no trust entry. So this
 * names a directory a user commits, which is why it is not under `.codex/` with the rest of a
 * project's Codex state.
 */
const CODEX_PROJECT_SKILLS_PATH = ".agents/skills";

/** Codex's single configuration file: marketplaces, plugin switches, trust and hooks alike. */
const CODEX_CONFIG_FILE = "config.toml";

/**
 * Claude Code's own state file — per-project records, the trust dialog's answer among them — in
 * the directory {@link claudeStateRoot} names. Only ever READ by this CLI.
 */
const CLAUDE_STATE_FILE = ".claude.json";

/**
 * The environment variable that moves Claude Code's state file out of the home directory.
 *
 * Exported for `e2e-runner-environment.test.ts`, which resolves the variable a bracket read names
 * by IMPORTING the constant — {@link CODEX_HOME_VAR}'s reason, one host over.
 */
export const CLAUDE_CONFIG_DIR_VAR = "CLAUDE_CONFIG_DIR";

/**
 * The file the claude CLI records every plugin install in, inside a plugins directory.
 *
 * Exported because two surfaces have to agree on it and neither can read the other's copy: the
 * {@link pluginRegistry} role here, and `getInstalledPluginsRegistryPath` in
 * `lib/plugins/plugin-settings.ts`, which reads the registry back. That module imports this one
 * rather than the reverse — this file is the leaf, and `utils/fs.ts` already imports it.
 */
export const INSTALLED_PLUGINS_FILE = "installed_plugins.json";

/**
 * Everything one (provider, scope) cell of an installation puts where the HOST reads it.
 *
 * Decided in one place, so two roles of one cell cannot disagree about the root they hang off.
 * `null` is a role this host does not have at this scope — a measured absence, never a path the
 * CLI would write and the host would ignore, which is the half-routed state this funnel exists
 * against.
 *
 * **`agentsDir` is NOT among them, and stopped being on 2026-09-21.** It carried `| null` for the
 * one cell that answered it — Codex at project scope — and that measurement was overturned, so the
 * union had no inhabitant left: an absence nothing can produce is a branch every call site writes
 * and no test can reach, which is this repository's own
 * `a-path-helper-that-names-one-layout-turns-every-absence-it-asserts-into-a-tautology`. Widening
 * it again is one character the day a host registers no sub-agents at a scope; the dead branch it
 * would otherwise license lands at every C5 call site first. A non-null answer still says only
 * where a role GOES — {@link codexProjectRoles} carries the condition under which the host reads
 * it — and this narrowing is a proposal the implementer or the owner may overturn.
 */
type HostRoles = {
  userConfigRoot: string;
  agentsDir: string;
  skillsDir: string;
  pluginsDir: string | null;
  pluginRegistry: string | null;
  permissionFiles: string[];
};

/**
 * One cell of the table, chosen by host and then by scope.
 *
 * The provider is a required argument on every role that reaches this, never a defaulted one. A
 * defaulted host would let a call site that was missed go on writing into `.claude/` and exit 0 —
 * the failure the whole funnel is written against — where a required one is a compiler error at
 * each site instead.
 */
function hostRoles(provider: Provider, scope: SkillScope, projectDir: string): HostRoles {
  switch (provider) {
    case "claude":
      return claudeRoles(installBaseDir(projectDir, scope));
    case "codex":
      return scope === "global" ? codexGlobalRoles() : codexProjectRoles(projectDir);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * Claude, at either scope. The scope root is the whole of the difference between the two — a
 * global installation and a project one hold the same five things under their own `.claude/` —
 * which is why this table is written once where the Codex tables are written twice.
 */
function claudeRoles(scopeRoot: string): HostRoles {
  const root = path.join(scopeRoot, CLAUDE_DIR);
  const plugins = path.join(root, PLUGINS_SUBDIR);

  return {
    userConfigRoot: root,
    agentsDir: path.join(root, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(root, STANDARD_DIRS.SKILLS),
    pluginsDir: plugins,
    pluginRegistry: path.join(plugins, INSTALLED_PLUGINS_FILE),
    // Both spellings, because `lib/permission-checker.tsx` reads both: the settings file this CLI
    // writes, and the developer's own overlay beside it, which it never writes and must not miss.
    permissionFiles: [
      path.join(root, STANDARD_FILES.SETTINGS_JSON),
      path.join(root, STANDARD_FILES.SETTINGS_LOCAL_JSON),
    ],
  };
}

/**
 * Codex at global scope, hung off whichever root `$CODEX_HOME` names.
 *
 * `pluginRegistry` is `null` because Codex records installed plugins in its own `config.toml`
 * and writes no registry file anywhere — an absence, not a file this step has not found yet.
 */
function codexGlobalRoles(): HostRoles {
  const root = codexUserRoot();

  return {
    userConfigRoot: root,
    agentsDir: path.join(root, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(root, STANDARD_DIRS.SKILLS),
    pluginsDir: path.join(root, PLUGINS_SUBDIR),
    pluginRegistry: null,
    permissionFiles: [path.join(root, CODEX_CONFIG_FILE)],
  };
}

/**
 * Codex at project scope, where `agentsDir` is a path the HOST only reads under a condition and
 * two roles are `null`.
 *
 * **`agentsDir` IS a directory here, and this answer was `null` until 2026-09-21 on a measurement
 * that has since been overturned.** A role file at `<project-root>/.codex/agents/<anything>.toml`
 * DOES register on the pinned 0.155.1 — settled by a tie-break over 23 captured `codex exec` runs
 * after two lanes disagreed, with the instrument calibrated both ways (no role file → `agent_type`
 * absent from `spawn_agent`; a global role → present and named). No `.git` is needed and the cwd
 * may be a subdirectory. The role id is the file's `name` key rather than its filename, and the
 * file must carry `name`, `description` AND `developer_instructions` or it is dropped with a
 * startup warning.
 *
 * **THE CONDITION TRAVELS WITH THE PATH, because a role that only works when the user's global
 * config trusts this project is not the same as one that just works.** Registration requires
 * `[projects."<exact absolute path>"] trust_level = "trusted"` in the GLOBAL
 * `$CODEX_HOME/config.toml`. Four kill switches were each measured, and each produces nothing with
 * NO warning anywhere: no `[projects]` entry at all; `trust_level = "untrusted"`, which beats a
 * permissive sandbox flag; a trailing slash on the path key; and the trust declared in the
 * project's own `.codex/config.toml`, which is correctly refused as self-authorisation. So this
 * path is where a compiled role GOES; whether Codex reads it is the user's global config's answer,
 * the CLI must detect that entry rather than write it silently, and no caller may read a non-null
 * answer here as "this will be picked up".
 *
 * **The trap for anyone re-measuring it**, and why the first measurement went wrong: every false
 * negative was a trust failure rather than a registration failure, and `--sandbox workspace-write`
 * or `danger-full-access` makes Codex WRITE that trust entry into the global config itself. The
 * tool under test mutates the independent variable, so a later run in the same home registers for
 * a reason the experiment never set. Reset the config between runs.
 *
 * **What stays UNMEASURED:** whether a spawned sub-agent's context actually receives the role's
 * `developer_instructions`. The mock's router refused the `spawn_agent` call, so registration is
 * proven and delivery is not — and `spawn_agent` is not a top-level tool, it is nested in a
 * `"type":"namespace"` tool, `multi_agent_v1`.
 *
 * `pluginsDir` is `null` because Codex installs plugins for a machine and not for a project:
 * no subcommand takes a scope, and `codex plugin add` run inside a project writes the switch to
 * the global config and silently un-scopes it. Plugin+project is refused by name instead.
 *
 * `$CODEX_HOME` does not reach this cell at all — a project's Codex state is its own directory,
 * and a role built from the variable would follow a developer's shell out of the repository.
 */
function codexProjectRoles(projectDir: string): HostRoles {
  const root = path.join(projectDir, CODEX_DIR);

  return {
    userConfigRoot: root,
    agentsDir: path.join(root, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(projectDir, CODEX_PROJECT_SKILLS_PATH),
    pluginsDir: null,
    pluginRegistry: null,
    permissionFiles: [path.join(root, CODEX_CONFIG_FILE)],
  };
}

/**
 * The root Codex keeps a user's state under: `$CODEX_HOME` where it names one, `~/.codex`
 * otherwise.
 *
 * Read at call time for {@link installBaseDir}'s reason, one host over: the variable is inherited
 * by every `codex` process this CLI spawns, so a value frozen at import decides where a later
 * command writes.
 *
 * An EXPORTED-BUT-EMPTY variable is read as no answer rather than as the root of the filesystem.
 * `path.join("", "skills")` is `skills` — a relative path — so an empty `CODEX_HOME` would root
 * every Codex path at whichever directory the process happens to be running in.
 */
function codexUserRoot(): string {
  const relocated = process.env[CODEX_HOME_VAR];
  if (relocated === undefined || relocated === "") return path.join(os.homedir(), CODEX_DIR);
  return relocated;
}

/**
 * Codex's own GLOBAL configuration file — the one that decides whether a project's role files are
 * read at all.
 *
 * Exported because the trust check has to name this exact file to a user and must not spell the
 * path a second time.
 *
 * **It is the user's file, and this CLI writes one thing into it: `[projects."<path>"]
 * trust_level` for a project it installed into**, since 2026-09-26 (owner: _"it should be
 * automated on install"_, CLI-893). `trustCodexProject` merges it in, never overrides a level the
 * user already set, and the install prints what it wrote. _Until then that entry was only read,
 * and the install printed the line for the user to add._
 */
export function codexGlobalConfigFile(): string {
  return path.join(codexUserRoot(), CODEX_CONFIG_FILE);
}

/**
 * `~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json` while that variable names a directory,
 * where Claude Code records whether each project's trust dialog was accepted —
 * `projects[<path>].hasTrustDialogAccepted`. Read from the shipped binary 2.1.259, 2026-09-03: a
 * PROJECT sub-agent's frontmatter hooks are dropped until that is `true`, so the completion gate
 * compiled into `<project>/.claude/agents/` does nothing in an untrusted folder. The CLI reads it
 * to say so, and never writes it (owner, 2026-09-26: tell the user).
 */
export function claudeStateFile(): string {
  return path.join(claudeStateRoot(), CLAUDE_STATE_FILE);
}

/**
 * The directory Claude Code keeps its state file in: `$CLAUDE_CONFIG_DIR` where it names one, the
 * home directory otherwise. Watched with Claude Code 2.1.288 under a scratch HOME on 2026-10-03:
 * set, the file is `$CLAUDE_CONFIG_DIR/.claude.json` — even where the variable names `~/.claude`,
 * the tree HOME already implies — and unset or empty, it is `~/.claude.json`.
 *
 * Read at call time and with an empty value read as no answer, for {@link codexUserRoot}'s reasons.
 */
function claudeStateRoot(): string {
  const relocated = process.env[CLAUDE_CONFIG_DIR_VAR];
  if (relocated === undefined || relocated === "") return os.homedir();
  return relocated;
}

/** Where this host keeps the configuration and state of one scope's installation. */
export function userConfigRoot(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).userConfigRoot;
}

/**
 * Where this host reads compiled sub-agents at this scope.
 *
 * It answers where a role file GOES, never that the host will pick it up: Codex reads
 * `<project>/.codex/agents/` only while the user's GLOBAL `$CODEX_HOME/config.toml` trusts that
 * exact absolute path, and says nothing at all when it does not — see {@link codexProjectRoles}
 * for the condition and the four ways it silently fails.
 */
export function agentsDir(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).agentsDir;
}

/** Where this host reads skills that are copied in rather than installed as a plugin. */
export function skillsDir(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).skillsDir;
}

/** Where this host stages installed plugins, or `null` where it installs none at this scope. */
export function pluginsDir(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string | null {
  return hostRoles(provider, scope, projectDir).pluginsDir;
}

/**
 * The file this host records its plugin installs in, or `null` where it keeps no such file.
 *
 * `null` is not "unknown": Codex records installs in the same `config.toml` its switches and
 * trust entries live in, so a caller that went looking for a registry there would find nothing
 * whatever this answered.
 */
export function pluginRegistry(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string | null {
  return hostRoles(provider, scope, projectDir).pluginRegistry;
}

/**
 * Every file this host reads permissions from at this scope, in precedence order.
 *
 * A list rather than one path, because Claude Code reads a settings file and a developer's own
 * overlay beside it, and a single answer can only ever name one of the two.
 */
export function permissionFiles(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string[] {
  return hostRoles(provider, scope, projectDir).permissionFiles;
}

/**
 * The skills directory as a user writes it FROM THE SCOPE ROOT — `.claude/skills`,
 * `.codex/skills`, `.agents/skills` — which is the spelling a message shows and a skill's
 * recorded `path` carries.
 *
 * Derived from {@link skillsDir} rather than declared a second time per host, so the two cannot
 * disagree: a prefix naming a directory the installer does not write is a place a user is told to
 * look and finds nothing in.
 *
 * A relocated `$CODEX_HOME` has no scope-root-relative spelling at all — being outside the home
 * directory is the whole point of the variable — so the absolute path is what a reader gets.
 * Answering `../elsewhere/codex-state/skills` would spell it relative to a root the user never
 * typed, and every consumer joining it back onto the scope root would still be right by accident.
 */
export function skillsPathPrefix(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string {
  const skills = skillsDir(provider, scope, projectDir);
  const fromScopeRoot = pathUnder(installBaseDir(projectDir, scope), skills);

  return fromScopeRoot ?? skills;
}

/**
 * The roots that SAY which provider an installation at this scope belongs to: this host's own
 * state root, any skills directory sitting outside it, and the source folder.
 *
 * Not a list of directories uninstall may remove. `.claude/` holds a user's own agents and skills
 * beside ours, and uninstall already decides per directory whether it is empty enough to go. What
 * this answers is which roots a command reads to know WHOSE installation it is looking at, which
 * is what "the folder says the provider, so no command needs a flag" rests on.
 *
 * The source folder comes from {@link sourceFolderInUse} rather than from {@link sourceDir}, so
 * an installation still on the legacy name is named where it is actually read from.
 */
export function ownedRoots(provider: Provider, scope: SkillScope, projectDir: string): string[] {
  const host = userConfigRoot(provider, scope, projectDir);
  const skills = skillsDir(provider, scope, projectDir);
  const source = sourceFolderInUse(installBaseDir(projectDir, scope), provider).dir;

  return [host, ...(isUnder(host, skills) ? [] : [skills]), source];
}

/**
 * `dir` spelled from `root`, POSIX-separated — `null` where it does not sit under `root` at all.
 *
 * `path.relative` rather than a prefix comparison, because the question is about DIRECTORIES and
 * not about strings: a root spelled with a trailing separator, and a sibling whose name merely
 * begins with the root's, are both answered wrongly by the comparison and correctly by this.
 * POSIX-separated because what comes back is a NAME — it is shown to users and written into
 * manifests, the same reason `sourceDirName` gives one folder over.
 */
function pathUnder(root: string, dir: string): string | null {
  const relative = path.relative(root, dir);
  const escapes = relative === ".." || relative.startsWith(`..${path.sep}`);

  if (relative === "" || escapes || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

/** Whether `dir` sits under `root`. A root does not count as being under itself. */
function isUnder(root: string, dir: string): boolean {
  return pathUnder(root, dir) !== null;
}

/** How a compiled sub-agent is written on one host, and how one of ours is recognised again. */
export type AgentCodec = {
  /** The extension a compiled agent file carries. */
  extension: string;
  /** The glob that lists every compiled agent in an agents directory. */
  listGlob: string;
  /**
   * Whether this content is an agent THIS CLI compiled.
   *
   * ONE marker, TWO positions, which is why this is a per-host function rather than one shared
   * predicate. A compiled Claude agent carries the line as its first body line, under the
   * frontmatter fence; a Codex agent ROLE DEFINITION carries the same line as the first line of
   * its `developer_instructions`. Both readers match on SHAPE and on POSITION, so a file whose
   * prose merely quotes the marker further down is the user's and is left alone.
   */
  hasMarker: (content: string) => boolean;
};

/** A fresh codec per call rather than one shared object, so no caller holds another's by identity. */
export function agentCodec(provider: Provider): AgentCodec {
  switch (provider) {
    case "claude":
      return agentFormat(".md", hasProvenanceMarker);
    case "codex":
      return agentFormat(".toml", hasCodexRoleMarker);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** One host's codec from its extension alone, so the glob and the extension cannot diverge. */
function agentFormat(extension: string, hasMarker: (content: string) => boolean): AgentCodec {
  return { extension, listGlob: `*${extension}`, hasMarker };
}

/**
 * Whether `provider` compiles THIS sub-agent at all.
 *
 * One declaration rather than a branch at each compile door, which is the shape its predecessor
 * `compilesSubAgents` had and the reason it had it: a caller that never heard of a provider
 * cannot write the wrong roster by omission, and a host added later is a compiler error here.
 *
 * What changed with C5 is the QUESTION, not the shape. There is a Codex renderer now — agent
 * ROLE DEFINITION files, `.toml`, per {@link agentCodec} — so the answer is no longer about the
 * provider alone: sixteen of the eighteen shipped sub-agents compile onto Codex and two do not.
 * `agent-summoner` and `skill-summoner` are left out for v1 because their roster mechanics on
 * Codex are not proven — the owner's ruling, recorded in that form so it is not reopened by
 * someone correcting a reason that does not hold. `AGENTS_NOT_ON_CODEX` in `@workspace/compile` is
 * where it lives, and its docblock carries the reason this one used to give and why it went.
 */
export function hostCompilesAgent(provider: Provider, agent: AgentName): boolean {
  switch (provider) {
    case "claude":
      return true;
    case "codex":
      return compilesForCodex(agent);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * Whether this release can tell a user anything true about `provider`'s permission model.
 *
 * One declaration rather than a branch at the door, so a host added later is a compiler error
 * here rather than a silent inheritance of Claude's answer.
 *
 * **It is Claude-only because the notice is Claude Code's, all of it.** The advice
 * `lib/permission-checker.tsx` prints is a `permissions.allow` block in `settings.json`, a file
 * and a key Codex does not have — its equivalent state is `sandbox_mode` and `approval_policy` in
 * the TOML that {@link permissionFiles} answers for that host. A Codex install printed that
 * Claude advice verbatim until 2026-09-22, ending a run that had touched no `.claude/` directory
 * by telling the user to go and edit one.
 *
 * **What it does NOT do is invent the Codex sentence.** Nothing here has been measured against
 * Codex's approval flow, and a notice written on spec would be authoring a user-facing claim
 * rather than reporting one — the same reason `codex-refusal-on-the-read-path.e2e.test.ts` gives
 * for refusing to pin a line that did not exist yet. Saying nothing is the honest answer until
 * somebody measures what there is to say.
 */
export function advisesOnPermissions(provider: Provider): boolean {
  switch (provider) {
    case "claude":
      return true;
    case "codex":
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * EVERY PROBE BELOW IS TOTAL, because this module is the only thing between a directory and a
 * path, and `getProjectConfigPath` is reached from ~30 sites that treat it as `path.join`.
 *
 * `statSync(..., { throwIfNoEntry: false })` answers undefined for ENOENT and for ENOTDIR and
 * throws for everything else — EACCES on a parent nobody may look through being the reachable one
 * — and `readdirSync` throws EACCES on a directory it may not list. Neither is a question about
 * the LAYOUT, so neither is allowed to become one: the CLI is sent to the folder the answer names
 * and the read or the write there fails with an errno naming the actual file. One error in front
 * of a user beats two, and no caller of a path builder has a `try` to catch the first in.
 */
function holdsAConfig(dir: string): boolean {
  // `existsSync` swallows every fault already, EACCES included, so this one needs nothing.
  return fs.existsSync(path.join(dir, STANDARD_FILES.CONFIG_TS));
}

/** True when the directory is there and is not empty — a bare leftover folder is not a scope. */
function holdsAnything(dir: string): boolean {
  return directoryExists(dir) && isNotEmpty(dir);
}

/**
 * Whether the directory holds anything, answering TRUE when it cannot be listed.
 *
 * The caller has already established that the directory is there; the only question left is
 * whether it is a bare leftover, and a folder locked against this process is not one. Answering
 * false would take a live installation's own folder away from it and name the folder a NEW
 * installation is created in — the half-routed path this module exists to prevent — so the
 * unreadable case goes the way that keeps the CLI pointed where the installation is.
 */
function isNotEmpty(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return true;
  }
}

/** Whether `dir` is a directory. A path that cannot be probed is one nothing can be read from. */
function directoryExists(dir: string): boolean {
  try {
    return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}
