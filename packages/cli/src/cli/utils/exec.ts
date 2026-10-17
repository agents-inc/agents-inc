import { spawn } from "child_process";
import path from "path";

const MAX_PLUGIN_PATH_LENGTH = 1024;
const MAX_PLUGIN_NAME_LENGTH = 256;
const MAX_MARKETPLACE_SOURCE_LENGTH = 1024;

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9._@/-]+$/;

const SAFE_PLUGIN_PATH_PATTERN = /^[a-zA-Z0-9._@/:~-]+$/;

const OPENS_A_RELATIVE_PATH = /^\.\.?[/\\]/;

// Mirrors `isLocalSource` in lib/configuration/config.ts without its traversal throw.
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
 * A directory source skips the name pattern: the filesystem may name it with spaces, and the
 * argv-array spawn has no shell to re-read it.
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

/** The only place in the package that forwards the whole environment to a child. */
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
