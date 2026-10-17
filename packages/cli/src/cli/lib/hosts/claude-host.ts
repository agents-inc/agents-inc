/** Claude Code's plugin machinery, behind {@link PluginHost}. */

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

const CLAUDE: PluginHost["provider"] = "claude";

/**
 * Claude's two spellings of "no such plugin". It exits 1 for these and for real failures alike,
 * so the message is what's read; dropping either makes a second uninstall throw.
 */
const NOT_INSTALLED_MESSAGES = ["not installed", "not found"];

function claudeOfferedPlacements(): InstallPlacement[] {
  return [
    { mode: "plugin", scope: "global" },
    { mode: "plugin", scope: "project" },
    { mode: "eject", scope: "global" },
    { mode: "eject", scope: "project" },
  ];
}

/** `global` is Claude's `user` scope; anything else, including absent, is `project`. */
export function toClaudePluginScope(scope: SkillScope | undefined): ClaudePluginScope {
  return scope === "global" ? "user" : "project";
}

/** User-scoped plugins run from home dir so Claude CLI only writes to ~/.claude/settings.json */
function resolvePluginCwd(scope: ClaudePluginScope, projectDir: string): string {
  return scope === "user" ? os.homedir() : projectDir;
}

export type ClaudeConfigOptions = HostCallOptions;

/** `CLAUDE_CONFIG_DIR` beats `HOME` and overrides an exported one. */
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

/** Throws only when `claude` cannot spawn; a non-zero exit is returned for the caller to read. */
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

function whyClaudeFailed(result: ExecResult): string {
  return (result.stderr || result.stdout || "Unknown error").trim();
}

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

function namesAMissingPlugin(message: string): boolean {
  return NOT_INSTALLED_MESSAGES.some((phrase) => message.includes(phrase));
}

function claudePluginsRoot(
  projectDir: string,
  options: ClaudeConfigOptions | undefined,
): string | null {
  if (options?.configDir !== undefined) return path.join(options.configDir, PLUGINS_SUBDIR);
  return pluginsDir(CLAUDE, "global", projectDir);
}

/**
 * Read from files, since Claude has no `plugin list --json`. A key recorded more than once
 * answers with this project's own record, else the user-scoped one.
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

/** A factory so no caller shares another's `offeredPlacements` array by identity. */
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
