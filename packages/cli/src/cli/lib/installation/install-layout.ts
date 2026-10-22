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
 * Where each (provider, scope) keeps its agents-inc source (`.agents-inc/<provider>/`) and the
 * host directories it writes into.
 */

export type SourceFolder = {
  dir: string;
  /** As a user writes it: `.agents-inc/claude`. */
  relName: string;
};

export function sourceDir(root: string, provider: Provider): string {
  return path.join(root, SOURCE_ROOT_DIR, provider);
}

export type SourceRoot = {
  dir: string;
  relName: string;
};

export function sourceRootOf(root: string): SourceRoot {
  return { dir: path.join(root, SOURCE_ROOT_DIR), relName: SOURCE_ROOT_DIR };
}

export const RETIRED_SOURCE_FOLDER = ".claude-src";

/**
 * Where the retired folder's contents belong now when any root holds it, else `null`. The folder
 * was Claude's, so the answer is Claude's.
 */
export function retiredSourceFolderIn(roots: readonly string[]): string | null {
  if (!roots.some(holdsTheRetiredSourceFolder)) return null;
  return sourceDirName("claude");
}

function holdsTheRetiredSourceFolder(root: string): boolean {
  return directoryExists(path.join(root, RETIRED_SOURCE_FOLDER));
}

/** Reachable only through {@link providerInUse}, so no call site defaults a provider silently. */
const PROVIDER_OF_A_NEW_INSTALLATION: Provider = "claude";

/**
 * The provider `--provider` named for this run. Process state rather than a parameter because
 * path builders deep below the command must all see it; set before any path is read, never after.
 */
let providerChosenForThisRun: Provider | undefined;

export function chooseProviderForThisRun(provider: Provider): void {
  providerChosenForThisRun = provider;
}

/** For test processes that outlive one run. */
export function forgetTheProviderChosenForThisRun(): void {
  providerChosenForThisRun = undefined;
}

/**
 * The provider a run over `root` is about: the run's `--provider` if given, else read off the
 * disk (a folder holding `config.ts` beats a merely non-empty one; an empty folder decides
 * nothing). A root holding live installations of both providers answers by roster order.
 */
export function providerInUse(root: string | undefined): Provider {
  if (providerChosenForThisRun !== undefined) return providerChosenForThisRun;
  if (root === undefined) return PROVIDER_OF_A_NEW_INSTALLATION;
  return providerOnDisk(root);
}

function providerOnDisk(root: string): Provider {
  const live = PROVIDERS.find((provider) => holdsAnInstallation(root, provider));
  if (live !== undefined) return live;

  const started = PROVIDERS.find((provider) => holdsASourceFolder(root, provider));
  return started ?? PROVIDER_OF_A_NEW_INSTALLATION;
}

function holdsAnInstallation(root: string, provider: Provider): boolean {
  return holdsAConfig(sourceDir(root, provider));
}

function holdsASourceFolder(root: string, provider: Provider): boolean {
  return holdsAnything(sourceDir(root, provider));
}

export function sourceFolderInUse(root: string, provider: Provider): SourceFolder {
  return { dir: sourceDir(root, provider), relName: sourceDirName(provider) };
}

/** `.agents-inc/<provider>/config.ts`, relative to the scope root. */
export function relativeConfigPath(root: string, provider: Provider): string {
  return `${sourceFolderInUse(root, provider).relName}/${STANDARD_FILES.CONFIG_TS}`;
}

/** With no project, names the folder a new installation would be created in. */
export function sourceFolderName(root: string | undefined, provider: Provider): string {
  if (root === undefined) return sourceDirName(provider);
  return sourceFolderInUse(root, provider).relName;
}

/**
 * Home for `"global"`, the project otherwise. `os.homedir()` is read at call time so tests that
 * repoint HOME are honoured. Declared here (not `install-base-dir.ts`) to avoid an import cycle.
 */
export function installBaseDir(projectDir: string, scope: SkillScope | undefined): string {
  return scope === "global" ? os.homedir() : projectDir;
}

const CODEX_DIR = ".codex";

/** Exported so `e2e-runner-environment.test.ts` imports the name rather than restating it. */
export const CODEX_HOME_VAR = "CODEX_HOME";

/** Committed to the repository, which is why it is not under `.codex/`. */
const CODEX_PROJECT_SKILLS_PATH = ".agents/skills";

const CODEX_CONFIG_FILE = "config.toml";

/** Claude Code's own state file; only ever read by this CLI. */
const CLAUDE_STATE_FILE = ".claude.json";

/** Exported for `e2e-runner-environment.test.ts`, as {@link CODEX_HOME_VAR} is. */
export const CLAUDE_CONFIG_DIR_VAR = "CLAUDE_CONFIG_DIR";

export const INSTALLED_PLUGINS_FILE = "installed_plugins.json";

/**
 * Where one (provider, scope) puts everything the host reads. `null` is a role the host does not
 * have at that scope.
 */
type HostRoles = {
  userConfigRoot: string;
  agentsDir: string;
  skillsDir: string;
  pluginsDir: string | null;
  pluginRegistry: string | null;
  permissionFiles: string[];
};

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

function claudeRoles(scopeRoot: string): HostRoles {
  const root = path.join(scopeRoot, CLAUDE_DIR);
  const plugins = path.join(root, PLUGINS_SUBDIR);

  return {
    userConfigRoot: root,
    agentsDir: path.join(root, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(root, STANDARD_DIRS.SKILLS),
    pluginsDir: plugins,
    pluginRegistry: path.join(plugins, INSTALLED_PLUGINS_FILE),
    // The developer's local overlay is read too, though never written.
    permissionFiles: [
      path.join(root, STANDARD_FILES.SETTINGS_JSON),
      path.join(root, STANDARD_FILES.SETTINGS_LOCAL_JSON),
    ],
  };
}

/** Codex records installed plugins in `config.toml`, so there is no registry file. */
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
 * Codex reads `<project>/.codex/agents/` only while the GLOBAL `$CODEX_HOME/config.toml` marks
 * this exact path `trust_level = "trusted"`, and silently ignores it otherwise. Codex installs
 * plugins per machine, so there is no project plugins dir. `$CODEX_HOME` does not apply here.
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

/** `$CODEX_HOME` or `~/.codex`, read at call time. */
function codexUserRoot(): string {
  return relocatedTo(process.env[CODEX_HOME_VAR]) ?? path.join(os.homedir(), CODEX_DIR);
}

/**
 * Empty counts as unset, since `path.join("", ...)` would root every path at the cwd. Takes the
 * value, not the name, so every read still names its variable where the environment gate looks.
 */
function relocatedTo(variableValue: string | undefined): string | undefined {
  return variableValue === "" ? undefined : variableValue;
}

/** The global Codex config, which decides whether a project's role files are read at all. */
export function codexGlobalConfigFile(): string {
  return path.join(codexUserRoot(), CODEX_CONFIG_FILE);
}

/**
 * Where Claude Code records `projects[<path>].hasTrustDialogAccepted`; a project sub-agent's
 * frontmatter hooks are dropped until it is `true`. Read, never written.
 */
export function claudeStateFile(): string {
  return path.join(claudeStateRoot(), CLAUDE_STATE_FILE);
}

/** `$CLAUDE_CONFIG_DIR` or home, read at call time. */
function claudeStateRoot(): string {
  return relocatedTo(process.env[CLAUDE_CONFIG_DIR_VAR]) ?? os.homedir();
}

export function userConfigRoot(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).userConfigRoot;
}

/** Where a role file goes, not a promise the host reads it — see {@link codexProjectRoles}. */
export function agentsDir(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).agentsDir;
}

/** Where this host reads skills that are copied in rather than installed as a plugin. */
export function skillsDir(provider: Provider, scope: SkillScope, projectDir: string): string {
  return hostRoles(provider, scope, projectDir).skillsDir;
}

export function pluginsDir(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string | null {
  return hostRoles(provider, scope, projectDir).pluginsDir;
}

export function pluginRegistry(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string | null {
  return hostRoles(provider, scope, projectDir).pluginRegistry;
}

/** In precedence order. */
export function permissionFiles(
  provider: Provider,
  scope: SkillScope,
  projectDir: string,
): string[] {
  return hostRoles(provider, scope, projectDir).permissionFiles;
}

/**
 * The skills directory relative to the scope root (`.claude/skills`, `.agents/skills`), or the
 * absolute path where it sits outside it (a relocated `$CODEX_HOME`).
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
 * The roots that say which provider an installation belongs to — not a list of directories safe
 * to remove.
 */
export function ownedRoots(provider: Provider, scope: SkillScope, projectDir: string): string[] {
  const host = userConfigRoot(provider, scope, projectDir);
  const skills = skillsDir(provider, scope, projectDir);
  const source = sourceFolderInUse(installBaseDir(projectDir, scope), provider).dir;

  return [host, ...(isUnder(host, skills) ? [] : [skills]), source];
}

/** `dir` relative to `root`, POSIX-separated, or `null` where it is not under it. */
function pathUnder(root: string, dir: string): string | null {
  const relative = path.relative(root, dir);
  const escapes = relative === ".." || relative.startsWith(`..${path.sep}`);

  if (relative === "" || escapes || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

/** A root does not count as being under itself. */
function isUnder(root: string, dir: string): boolean {
  return pathUnder(root, dir) !== null;
}

export type AgentCodec = {
  extension: string;
  listGlob: string;
  /**
   * Whether this CLI compiled the content. Claude carries the marker as the first body line, Codex
   * as the first line of `developer_instructions`; a marker quoted elsewhere does not count.
   */
  hasMarker: (content: string) => boolean;
};

/** Fresh per call so no caller shares another's object. */
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

function agentFormat(extension: string, hasMarker: (content: string) => boolean): AgentCodec {
  return { extension, listGlob: `*${extension}`, hasMarker };
}

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

/** Claude Code's `settings.json` advice; nothing is known to say for Codex. */
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
 * The probes below never throw: a fault such as EACCES points the CLI at the folder anyway, so the
 * later read or write there fails naming the real file.
 */
function holdsAConfig(dir: string): boolean {
  return fs.existsSync(path.join(dir, STANDARD_FILES.CONFIG_TS));
}

function holdsAnything(dir: string): boolean {
  return directoryExists(dir) && isNotEmpty(dir);
}

/** An unlistable directory counts as non-empty, so a locked installation keeps its folder. */
function isNotEmpty(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return true;
  }
}

function directoryExists(dir: string): boolean {
  try {
    return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}
