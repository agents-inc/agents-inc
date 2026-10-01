/**
 * Spawning a child process, and the argument checks every host's plugin commands owe.
 *
 * The `claude*` functions this module used to carry moved into `lib/hosts/claude-host.ts` in C3,
 * where one host's vocabulary belongs. What stays is what is not any one host's: the `spawn`
 * wrapper itself, and three validators that refuse a name, a path or a marketplace source before
 * it reaches an argument vector. Codex's plugin verbs differ from Claude's word for word, so a
 * shared argv builder was never on offer — these checks are the part both hosts do share.
 */

import { spawn } from "child_process";
import path from "path";

// Argument length limits to prevent oversized CLI arguments
const MAX_PLUGIN_PATH_LENGTH = 1024;
const MAX_PLUGIN_NAME_LENGTH = 256;
const MAX_MARKETPLACE_SOURCE_LENGTH = 1024;

// Marketplace/plugin names: alphanumeric, dashes, underscores, dots, @
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9._@/-]+$/;

// Plugin path/ref: alphanumeric, dashes, underscores, dots, slashes, @, colons (for marketplace refs like skill@marketplace)
const SAFE_PLUGIN_PATH_PATTERN = /^[a-zA-Z0-9._@/:~-]+$/;

/** A source that opens with `./` or `../` — the relative half of a directory on this machine. */
const OPENS_A_RELATIVE_PATH = /^\.\.?[/\\]/;

/**
 * Whether a marketplace source names a DIRECTORY on this machine rather than a reference to fetch.
 *
 * The same split `isLocalSource` in `lib/configuration/config.ts` makes for the fetcher, spelled
 * again here rather than imported: `utils/` sits under `lib/`, and that function THROWS on a
 * traversal pattern, which is a refusal this check has no standing to make on another program's
 * behalf.
 */
function namesADirectoryOnThisMachine(source: string): boolean {
  return path.isAbsolute(source) || OPENS_A_RELATIVE_PATH.test(source);
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0E-\x1F\x7F]/u;

export function validatePluginPath(pluginPath: string): void {
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

/**
 * Refuses a marketplace source before it reaches an argument vector — a reference by its shape, a
 * directory by nothing but its length and its bytes.
 *
 * **A DIRECTORY'S NAME IS THE FILESYSTEM'S TO DECIDE, and holding one to the reference pattern
 * refused a directory the host accepts.** A marketplace named as a directory on this machine — an
 * absolute path, or one opening `./` or `../` — carries whatever the filesystem called it, and
 * under `/Users/My Name` that includes a space the reference pattern has no room for. Codex itself
 * has no objection: measured on the pinned 0.155.1, 2026-09-23, with `HOME` and `CODEX_HOME`
 * pinned to a scratch tree whose path contains a space and the global `config.toml` deleted first,
 * `codex plugin marketplace add '<…>/My Home/…' --json` exits 0 and `plugin add` then installs a
 * plugin from it.
 *
 * **What the pattern was ever protecting against is not reachable from here.** {@link execCommand}
 * spawns with an argv array and never passes `shell`, so a source is handed to the binary as data
 * and there is no shell to re-read it. The pattern stays on for a REFERENCE, where it does real
 * work — it refuses a value that is not a reference at all — and
 * `hosts/__tests__/a-marketplace-directory-with-a-space-reaches-the-host.test.ts` pins both halves
 * together, because an admitted directory on its own reads exactly like a check that was deleted.
 *
 * The length bound and the control-character refusal apply to both: a NUL byte is not a filename
 * on any host this runs on, and `spawn` throws on one rather than saying which argument it was.
 */
export function validateMarketplaceSource(source: string): void {
  if (!source || source.trim().length === 0) {
    throw new Error("Marketplace must not be empty.");
  }

  if (source.length > MAX_MARKETPLACE_SOURCE_LENGTH) {
    throw new Error(
      `Marketplace is too long (${source.length} characters, max ${MAX_MARKETPLACE_SOURCE_LENGTH}).`,
    );
  }

  if (CONTROL_CHAR_PATTERN.test(source)) {
    throw new Error("Marketplace contains invalid control characters.");
  }

  if (namesADirectoryOnThisMachine(source)) return;

  if (!SAFE_PLUGIN_PATH_PATTERN.test(source)) {
    throw new Error(
      `Marketplace contains invalid characters: "${source}"\n` +
        "Marketplaces may only contain alphanumeric characters, dashes, underscores, dots, slashes, @, and colons.",
    );
  }
}

export function validatePluginName(pluginName: string): void {
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

/**
 * One child process run to completion, with the environment forwarded and `options.env` over it.
 *
 * **This module is the one place in the package that forwards the whole environment**, and
 * `__tests__/e2e-runner-environment.test.ts` is what holds it to exactly one: a spread anywhere
 * else hands every variable to a child that nothing named it for.
 */
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

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
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
