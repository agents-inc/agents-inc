/**
 * Claude Code's plugin machinery, behind {@link PluginHost}.
 *
 * `exec.ts` keeps `execCommand` and the argument validators, which are every host's and not this
 * one's.
 *
 * **Two vocabularies meet in this file and nowhere else.** Above the line, the seam speaks this
 * product's words — {@link SkillScope}'s `global` and `project`. Below it, `claude plugin` takes
 * {@link ClaudePluginScope}'s `user` and `project`, and routes a user-scoped call by the working
 * directory as well as by the flag. {@link toClaudePluginScope} is the whole of the translation,
 * and it belongs here because it is a fact about one binary.
 *
 * **Removal is classified from Claude's own message**, not from its exit code: `claude plugin
 * uninstall` exits 1 both for "there was no such plugin" and for a real failure, and the CLI has
 * always swallowed the first by matching the text. What C3 adds is that the caller can now see
 * which of the two happened. `e2e/smoke/plugin-host-contract.smoke.test.ts` is what holds that
 * against the real binary — a recorded string is a claim about software that ships on its own
 * schedule.
 */

import os from "os";
import path from "path";
import { z } from "zod";

import { PLUGINS_SUBDIR } from "../../consts.js";
import type { ClaudePluginScope, SkillScope } from "../../types/config.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  execCommand,
  validateMarketplaceSource,
  validatePluginName,
  validatePluginPath,
  type ExecResult,
} from "../../utils/exec.js";
import { fileExists } from "../../utils/fs.js";
import { warn } from "../../utils/logger.js";
import { pluginsDir } from "../installation/install-layout.js";
import {
  getEnabledPluginKeys,
  getInstalledPluginsRegistryPath,
  listPluginInstallsForProject,
} from "../plugins/plugin-settings.js";
import type {
  HostCallOptions,
  HostPlugin,
  InstallPlacement,
  PluginHost,
  PluginRemovalOutcome,
} from "./plugin-host.js";

/** The provider this module is the host for, named once so no member spells it again. */
const CLAUDE: PluginHost["provider"] = "claude";

/**
 * Both spellings Claude uses for a plugin it does not have, as `claude 2.1.278` prints them.
 *
 * `✘ Failed to uninstall plugin "x@y": Plugin "x@y" not found in installed plugins` is the one a
 * user meets; the other arm has been swallowed here since before the messages were recorded, and
 * dropping either turns an ordinary second uninstall into a thrown error. The exit code says 1
 * for both this and a real failure, which is why the reading is of the message.
 */
const NOT_INSTALLED_MESSAGES = ["not installed", "not found"];

/**
 * Every mode/scope cell Claude offers, which is all four of them.
 *
 * Four rather than three is the whole of what separates this host from Codex's at the seam: a
 * plugin can be installed for one project here, and cannot be there. Rebuilt per call by
 * {@link claudeHost} so no two callers hold one array.
 */
function claudeOfferedPlacements(): InstallPlacement[] {
  return [
    { mode: "plugin", scope: "global" },
    { mode: "plugin", scope: "project" },
    { mode: "eject", scope: "global" },
    { mode: "eject", scope: "project" },
  ];
}

/**
 * Maps a cc scope to the Claude CLI plugin scope: `"global"` installs are
 * user-scoped in Claude (registered in `~/.claude/settings.json`); anything
 * else — including an absent scope — is project-scoped.
 */
export function toClaudePluginScope(scope: SkillScope | undefined): ClaudePluginScope {
  return scope === "global" ? "user" : "project";
}

/** User-scoped plugins run from home dir so Claude CLI only writes to ~/.claude/settings.json */
function resolvePluginCwd(scope: ClaudePluginScope, projectDir: string): string {
  return scope === "user" ? os.homedir() : projectDir;
}

/**
 * Which Claude installation a `claude plugin` call reads and writes.
 *
 * The host's own spelling of {@link HostCallOptions}, kept as a name of its
 * own because the e2e harness drives these functions directly.
 */
export type ClaudeConfigOptions = HostCallOptions;

/**
 * The `execCommand` options fragment that pins the config dir — empty when there
 * is none, so the call inherits its process's environment untouched.
 *
 * `CLAUDE_CONFIG_DIR` takes precedence over `HOME` in the Claude CLI, so passing
 * it also overrides an exported one rather than merely competing with it.
 */
function configDirEnv(options: ClaudeConfigOptions | undefined): { env?: NodeJS.ProcessEnv } {
  if (options?.configDir === undefined) return {};
  return { env: { CLAUDE_CONFIG_DIR: options.configDir } };
}

export async function claudePluginInstall(
  pluginPath: string,
  scope: ClaudePluginScope,
  projectDir: string,
  options?: ClaudeConfigOptions,
): Promise<void> {
  validatePluginPath(pluginPath);

  const cwd = resolvePluginCwd(scope, projectDir);
  const args = ["plugin", "install", pluginPath, "--scope", scope];
  const result = await execCommand("claude", args, { cwd, ...configDirEnv(options) });

  if (result.exitCode !== 0) {
    throw new Error(`Plugin installation failed: ${whyClaudeFailed(result)}`);
  }
}

/**
 * Whether the `claude` binary is there and runnable.
 *
 * It takes the config directory like every other member, and passes it for the seam's reason
 * rather than for one of its own: measured on 2026-09-21, `claude --version` under a pinned
 * scratch `HOME` and `CLAUDE_CONFIG_DIR` wrote nothing at all, so for THIS host the option
 * changes no file. The seam carries it because the next host's probe is a write — Codex links
 * helper binaries under `$CODEX_HOME/tmp/arg0/` before it reads an argument — and a member whose
 * Claude implementation quietly dropped the option would send every spawned probe at whichever
 * installation the process happened to point at.
 */
export async function isClaudeCLIAvailable(options?: ClaudeConfigOptions): Promise<boolean> {
  try {
    const result = await execCommand("claude", ["--version"], configDirEnv(options));
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export type MarketplaceInfo = {
  name: string;
  source: string;
  repo?: string;
  path?: string;
};

const marketplaceInfoListSchema: z.ZodType<MarketplaceInfo[]> = z.array(
  z.object({
    name: z.string(),
    source: z.string(),
    repo: z.string().exactOptional(),
    path: z.string().exactOptional(),
  }),
);

export async function claudePluginMarketplaceList(
  options?: ClaudeConfigOptions,
): Promise<MarketplaceInfo[]> {
  try {
    const result = await execCommand(
      "claude",
      ["plugin", "marketplace", "list", "--json"],
      configDirEnv(options),
    );

    if (result.exitCode !== 0) return [];
    return marketplacesListedIn(result.stdout);
  } catch {
    return [];
  }
}

/** The marketplaces a `--json` listing names, or none, after a warning, where it is unreadable. */
function marketplacesListedIn(stdout: string): MarketplaceInfo[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    warn("Failed to parse marketplace list output as JSON");
    return [];
  }

  const listResult = marketplaceInfoListSchema.safeParse(parsed);
  if (!listResult.success) {
    warn("Unexpected marketplace list format — expected an array of marketplace entries");
    return [];
  }

  return listResult.data;
}

export async function claudePluginMarketplaceExists(
  name: string,
  options?: ClaudeConfigOptions,
): Promise<boolean> {
  const marketplaces = await claudePluginMarketplaceList(options);
  return marketplaces.some((m) => m.name === name);
}

export async function claudePluginMarketplaceAdd(
  source: string,
  options?: ClaudeConfigOptions,
): Promise<void> {
  validateMarketplaceSource(source);

  const args = ["plugin", "marketplace", "add", source];
  const result = await runClaude(args, options, "add marketplace");
  if (result.exitCode === 0) return;

  const said = whyClaudeFailed(result);
  if (said.includes("already installed")) return;
  throw new Error(`Failed to add marketplace: ${said}`);
}

export async function claudePluginMarketplaceRemove(
  name: string,
  options?: ClaudeConfigOptions,
): Promise<void> {
  validatePluginName(name);

  const args = ["plugin", "marketplace", "remove", name];
  const result = await runClaude(args, options, "remove marketplace");
  if (result.exitCode === 0) return;

  const said = whyClaudeFailed(result);
  if (said.includes("not found") || said.includes("not installed")) return;
  throw new Error(`Failed to remove marketplace: ${said}`);
}

export async function claudePluginMarketplaceUpdate(
  name: string,
  options?: ClaudeConfigOptions,
): Promise<void> {
  validatePluginName(name);

  const args = ["plugin", "marketplace", "update", name];
  const result = await runClaude(args, options, "update marketplace");
  if (result.exitCode === 0) return;

  throw new Error(`Failed to update marketplace: ${whyClaudeFailed(result)}`);
}

/**
 * One `claude` call against the installation `options` names, where a binary that could not be
 * spawned at all is reported as `Failed to <attempt>` — the words each marketplace verb's own
 * refusal uses. A call that ran and exited non-zero is returned for the caller to read, because
 * `add` and `remove` each treat one refusal as success.
 */
async function runClaude(
  args: string[],
  options: ClaudeConfigOptions | undefined,
  attempt: string,
): Promise<ExecResult> {
  try {
    return await execCommand("claude", args, configDirEnv(options));
  } catch (err) {
    throw new Error(`Failed to ${attempt}: ${getErrorMessage(err)}`, { cause: err });
  }
}

/** Whichever stream carried the reason a call failed, ready to quote. */
function whyClaudeFailed(result: ExecResult): string {
  return (result.stderr || result.stdout || "Unknown error").trim();
}

/**
 * Removes a plugin, and says which of the two ordinary outcomes it was.
 *
 * The classification is a widening rather than a change: `claudePluginUninstall` returned `void`
 * and swallowed the same two spellings of "there was no such plugin", so every caller that was
 * told nothing goes on being told nothing. Both spellings stay in the list — dropping either turns
 * an ordinary uninstall into a thrown error.
 */
export async function claudePluginUninstall(
  pluginName: string,
  scope: ClaudePluginScope,
  projectDir: string,
  options?: ClaudeConfigOptions,
): Promise<PluginRemovalOutcome> {
  validatePluginName(pluginName);

  const cwd = resolvePluginCwd(scope, projectDir);
  const args = ["plugin", "uninstall", pluginName, "--scope", scope];
  const result = await execCommand("claude", args, { cwd, ...configDirEnv(options) });

  if (result.exitCode === 0) return "removed";

  const said = whyClaudeFailed(result);
  if (namesAMissingPlugin(said)) return "absent";
  throw new Error(`Plugin uninstall failed: ${said}`);
}

/** Whether Claude's refusal says there was no such plugin, rather than that it could not go. */
function namesAMissingPlugin(message: string): boolean {
  return NOT_INSTALLED_MESSAGES.some((phrase) => message.includes(phrase));
}

/**
 * Which plugins directory a listing reads, given the installation the caller pinned.
 *
 * `CLAUDE_CONFIG_DIR` names the `.claude` tree itself, so the plugins directory hangs off it
 * directly. Unpinned, the answer is the layout's — the user's own tree, under whichever root
 * `installBaseDir` gives a global scope. `null` is a cell that has no plugins directory at all,
 * which `pluginsDir` answers for a host that installs plugins for a machine rather than a
 * project; Claude has one at both scopes, and the branch is the layout's shape rather than this
 * host's.
 */
function claudePluginsRoot(
  projectDir: string,
  options: ClaudeConfigOptions | undefined,
): string | null {
  if (options?.configDir !== undefined) return path.join(options.configDir, PLUGINS_SUBDIR);
  return pluginsDir(CLAUDE, "global", projectDir);
}

/**
 * What Claude has installed, as seen from one project.
 *
 * Two files rather than a command: Claude has no `plugin list --json`, so the installs come from
 * `installed_plugins.json` under {@link claudePluginsRoot} and the switch comes from the project's
 * own settings. A host that shelled out for this would read a non-zero exit as an empty listing.
 * An absent registry is an installation with no plugins, which is why it answers `[]` where
 * {@link listPluginInstallsForProject} throws for one that is present and unreadable.
 *
 * **"As seen from one project" is the pick, not just the switch.** A plugin key the registry
 * carries more than once is answered with this project's OWN record where there is one and the
 * user-scoped record otherwise, which is what {@link listPluginInstallsForProject} does. Returning
 * every recorded install instead would hand a reader another project's install path for a key
 * this project merely has switched on — the reading that was live in `plugin-discovery.ts` before
 * this member existed, and the one it now takes from here.
 */
async function claudeListPlugins(
  projectDir: string,
  options?: ClaudeConfigOptions,
): Promise<HostPlugin[]> {
  const pluginsRoot = claudePluginsRoot(projectDir, options);
  if (pluginsRoot === null) return [];
  if (!(await fileExists(getInstalledPluginsRegistryPath(pluginsRoot)))) return [];

  const [installs, enabled] = await Promise.all([
    listPluginInstallsForProject(pluginsRoot, projectDir),
    getEnabledPluginKeys(projectDir),
  ]);
  const enabledKeys = new Set(enabled);

  return installs.map(({ pluginKey, installPath }) => ({
    pluginKey,
    installPath,
    enabled: enabledKeys.has(pluginKey),
  }));
}

/**
 * Claude Code as a {@link PluginHost}.
 *
 * A factory rather than a shared constant, so no caller holds another's `offeredPlacements` array
 * by identity — the rule `validResult()` in `lib/validation-result.ts` states and `agentCodec` in
 * `install-layout.ts` already follows.
 */
export function claudeHost(): PluginHost {
  return {
    provider: CLAUDE,
    offeredPlacements: claudeOfferedPlacements(),
    installsProjectScopedPlugins: true,
    isAvailable: isClaudeCLIAvailable,
    marketplaceExists: claudePluginMarketplaceExists,
    addMarketplace: claudePluginMarketplaceAdd,
    refreshMarketplace: claudePluginMarketplaceUpdate,
    installPlugin: (pluginRef, scope, projectDir, options) =>
      claudePluginInstall(pluginRef, toClaudePluginScope(scope), projectDir, options),
    uninstallPlugin: (pluginRef, scope, projectDir, options) =>
      claudePluginUninstall(pluginRef, toClaudePluginScope(scope), projectDir, options),
    listPlugins: claudeListPlugins,
  };
}
