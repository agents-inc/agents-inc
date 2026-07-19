import { spawn } from "child_process";
import { z } from "zod";
import os from "os";
import { getErrorMessage } from "./errors";
import { warn } from "./logger";

// Argument length limits to prevent oversized CLI arguments
const MAX_PLUGIN_PATH_LENGTH = 1024;
const MAX_PLUGIN_NAME_LENGTH = 256;
const MAX_MARKETPLACE_SOURCE_LENGTH = 1024;

// Marketplace/plugin names: alphanumeric, dashes, underscores, dots, @
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9._@/-]+$/;

// Plugin path/ref: alphanumeric, dashes, underscores, dots, slashes, @, colons (for marketplace refs like skill@marketplace)
const SAFE_PLUGIN_PATH_PATTERN = /^[a-zA-Z0-9._@/:~-]+$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0E-\x1F\x7F]/u;

function validatePluginPath(pluginPath: string): void {
  if (!pluginPath || pluginPath.trim().length === 0) {
    throw new Error("Plugin path must not be empty.");
  }

  if (pluginPath.length > MAX_PLUGIN_PATH_LENGTH) {
    throw new Error(
      `Plugin path is too long (${pluginPath.length} characters, max ${MAX_PLUGIN_PATH_LENGTH}).`,
    );
  }

  if (CONTROL_CHAR_PATTERN.test(pluginPath)) {
    throw new Error("Plugin path contains invalid control characters.");
  }

  if (!SAFE_PLUGIN_PATH_PATTERN.test(pluginPath)) {
    throw new Error(
      `Plugin path contains invalid characters: "${pluginPath}"\n` +
        "Plugin paths may only contain alphanumeric characters, dashes, underscores, dots, slashes, @, and colons.",
    );
  }
}

function validateMarketplaceSource(source: string): void {
  if (!source || source.trim().length === 0) {
    throw new Error("Marketplace source must not be empty.");
  }

  if (source.length > MAX_MARKETPLACE_SOURCE_LENGTH) {
    throw new Error(
      `Marketplace source is too long (${source.length} characters, max ${MAX_MARKETPLACE_SOURCE_LENGTH}).`,
    );
  }

  if (CONTROL_CHAR_PATTERN.test(source)) {
    throw new Error("Marketplace source contains invalid control characters.");
  }

  if (!SAFE_PLUGIN_PATH_PATTERN.test(source)) {
    throw new Error(
      `Marketplace source contains invalid characters: "${source}"\n` +
        "Source may only contain alphanumeric characters, dashes, underscores, dots, slashes, @, and colons.",
    );
  }
}

function validatePluginName(pluginName: string): void {
  if (!pluginName || pluginName.trim().length === 0) {
    throw new Error("Plugin name must not be empty.");
  }

  if (pluginName.length > MAX_PLUGIN_NAME_LENGTH) {
    throw new Error(
      `Plugin name is too long (${pluginName.length} characters, max ${MAX_PLUGIN_NAME_LENGTH}).`,
    );
  }

  if (CONTROL_CHAR_PATTERN.test(pluginName)) {
    throw new Error("Plugin name contains invalid control characters.");
  }

  if (!SAFE_NAME_PATTERN.test(pluginName)) {
    throw new Error(
      `Plugin name contains invalid characters: "${pluginName}"\n` +
        "Names may only contain alphanumeric characters, dashes, underscores, dots, @, and slashes.",
    );
  }
}

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function execCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/** User-scoped plugins run from home dir so Claude CLI only writes to ~/.claude/settings.json */
function resolvePluginCwd(scope: "project" | "user", projectDir: string): string {
  return scope === "user" ? os.homedir() : projectDir;
}

export async function claudePluginInstall(
  pluginPath: string,
  scope: "project" | "user",
  projectDir: string,
): Promise<void> {
  validatePluginPath(pluginPath);

  const cwd = resolvePluginCwd(scope, projectDir);
  const args = ["plugin", "install", pluginPath, "--scope", scope];
  const result = await execCommand("claude", args, { cwd });

  if (result.exitCode !== 0) {
    const errorMessage = result.stderr || result.stdout || "Unknown error";
    throw new Error(`Plugin installation failed: ${errorMessage.trim()}`);
  }
}

export async function isClaudeCLIAvailable(): Promise<boolean> {
  try {
    const result = await execCommand("claude", ["--version"], {});
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
    repo: z.string().optional(),
    path: z.string().optional(),
  }),
);

export async function claudePluginMarketplaceList(): Promise<MarketplaceInfo[]> {
  try {
    const result = await execCommand("claude", ["plugin", "marketplace", "list", "--json"], {});

    if (result.exitCode !== 0) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
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
  } catch {
    return [];
  }
}

export async function claudePluginMarketplaceExists(name: string): Promise<boolean> {
  const marketplaces = await claudePluginMarketplaceList();
  return marketplaces.some((m) => m.name === name);
}

export async function claudePluginMarketplaceAdd(source: string): Promise<void> {
  validateMarketplaceSource(source);

  const args = ["plugin", "marketplace", "add", source];
  let result;
  try {
    result = await execCommand("claude", args, {});
  } catch (err) {
    throw new Error(`Failed to add marketplace: ${getErrorMessage(err)}`);
  }

  if (result.exitCode !== 0) {
    const errorMessage = result.stderr || result.stdout || "Unknown error";
    if (errorMessage.includes("already installed")) {
      return;
    }
    throw new Error(`Failed to add marketplace: ${errorMessage.trim()}`);
  }
}

export async function claudePluginMarketplaceRemove(name: string): Promise<void> {
  validatePluginName(name);

  const args = ["plugin", "marketplace", "remove", name];
  let result;
  try {
    result = await execCommand("claude", args, {});
  } catch (err) {
    throw new Error(`Failed to remove marketplace: ${getErrorMessage(err)}`);
  }

  if (result.exitCode !== 0) {
    const errorMessage = result.stderr || result.stdout || "Unknown error";
    if (errorMessage.includes("not found") || errorMessage.includes("not installed")) {
      return;
    }
    throw new Error(`Failed to remove marketplace: ${errorMessage.trim()}`);
  }
}

export async function claudePluginMarketplaceUpdate(name: string): Promise<void> {
  validatePluginName(name);

  const args = ["plugin", "marketplace", "update", name];
  let result;
  try {
    result = await execCommand("claude", args, {});
  } catch (err) {
    throw new Error(`Failed to update marketplace: ${getErrorMessage(err)}`);
  }

  if (result.exitCode !== 0) {
    const errorMessage = result.stderr || result.stdout || "Unknown error";
    throw new Error(`Failed to update marketplace: ${errorMessage.trim()}`);
  }
}

export async function claudePluginUninstall(
  pluginName: string,
  scope: "project" | "user",
  projectDir: string,
): Promise<void> {
  validatePluginName(pluginName);

  const cwd = resolvePluginCwd(scope, projectDir);
  const args = ["plugin", "uninstall", pluginName, "--scope", scope];
  const result = await execCommand("claude", args, { cwd });

  if (result.exitCode !== 0) {
    const errorMessage = result.stderr || result.stdout || "Unknown error";
    // Ignore "not installed" errors - plugin may already be removed
    if (errorMessage.includes("not installed") || errorMessage.includes("not found")) {
      return;
    }
    throw new Error(`Plugin uninstall failed: ${errorMessage.trim()}`);
  }
}

/**
 * Best-effort plugin uninstall that tries both scopes.
 *
 * Use when the plugin's actual registered scope is ambiguous — e.g., a skill
 * was re-scoped after install, or we're cleaning up on uninstall and the config
 * scope may not match the registry entry. Tries the primary scope first, then
 * the fallback, silently swallowing errors from each attempt.
 *
 * The plugin reference must be qualified (e.g., `skill-id@marketplace`), matching
 * the form used at install time — bare skill IDs will not match the registry.
 */
export async function claudePluginUninstallBestEffort(
  pluginRef: string,
  primaryScope: "project" | "user",
  projectDir: string,
): Promise<void> {
  const fallbackScope = primaryScope === "project" ? "user" : "project";
  try {
    await claudePluginUninstall(pluginRef, primaryScope, projectDir);
  } catch {
    // Best-effort: plugin may not be registered with primary scope
  }
  try {
    await claudePluginUninstall(pluginRef, fallbackScope, projectDir);
  } catch {
    // Best-effort: plugin may not be registered with fallback scope either
  }
}
