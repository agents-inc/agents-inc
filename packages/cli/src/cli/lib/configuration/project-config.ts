import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import type { ProjectConfig, ValidationResult } from "../../types";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { projectConfigLoaderSchema } from "../schemas";
import { formatZodErrors } from "../schema-validator";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { isHomeDirectory } from "../installation/is-home-directory";
import { loadConfig } from "./config-loader";

export type LoadedProjectConfig = {
  config: ProjectConfig;
  configPath: string;
};

/**
 * Thrown when a project config file exists on disk but cannot be loaded into a
 * usable config — a syntax/evaluation error, no default export, or a shape the
 * loader schema rejects. This is deliberately distinct from a MISSING file
 * (which is a legitimate `null`): a corrupt config is an error that callers must
 * surface, never swallow into `null`. Collapsing both into `null` let a broken
 * install pass as absent (e.g. `compile` treating it as config-less and
 * resurrecting every built-in agent).
 */
export class ConfigLoadError extends Error {
  constructor(
    readonly configPath: string,
    readonly reason: string,
  ) {
    super(`Config at '${configPath}' could not be loaded: ${reason}`);
    this.name = "ConfigLoadError";
  }
}

/**
 * Load project config from a specific directory only (no global fallback).
 *
 * Returns `null` only when the config file does not exist. When the file exists
 * but cannot be parsed into a usable config, throws {@link ConfigLoadError} —
 * the caller decides how to report it.
 */
export async function loadProjectConfigFromDir(
  projectDir: string,
): Promise<LoadedProjectConfig | null> {
  const configPath = getProjectConfigPath(projectDir);

  if (!(await fileExists(configPath))) {
    verbose(`Project config not found at ${configPath}`);
    return null;
  }

  // The file exists. From here, any failure to produce a usable config means the
  // file is corrupt — surface it as ConfigLoadError rather than returning `null`,
  // which is indistinguishable from "missing".
  let raw: unknown;
  try {
    // Load raw object and validate with Zod (lenient schema accepts custom values via z.string() casts)
    raw = await loadConfig<ProjectConfig>(configPath);
  } catch (error) {
    throw new ConfigLoadError(configPath, getErrorMessage(error));
  }

  if (!raw || typeof raw !== "object") {
    throw new ConfigLoadError(configPath, "the file has no valid default export");
  }

  const result = projectConfigLoaderSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigLoadError(configPath, formatZodErrors(result.error).join("; "));
  }

  // Normalize the loose stack values (bare strings, objects, arrays) BEFORE claiming
  // ProjectConfig, so the boundary cast below is the only one on this path.
  const parsed = result.data;
  const normalizedStack = parsed.stack ? normalizeStackRecord(parsed.stack) : undefined;
  // Boundary cast: loader schema is lenient (optional name, loose strings);
  // validateProjectConfig enforces the strict shape after load
  const config = {
    ...parsed,
    ...(normalizedStack && { stack: normalizedStack }),
  } as ProjectConfig;

  if (!config.name) {
    warn(
      `Project config at '${configPath}' is missing required 'name' field — defaulting to directory name`,
    );
    config.name = path.basename(projectDir);
  }
  if (!config.skills) {
    warn(`Project config at '${configPath}' is missing 'skills' array — defaulting to empty`);
    config.skills = [];
  }

  verbose(`Loaded project config from ${configPath}`);
  return {
    config,
    configPath,
  };
}

/**
 * Load project config with global fallback.
 * Checks the given projectDir first, then falls back to the home directory.
 */
export async function loadProjectConfig(projectDir: string): Promise<LoadedProjectConfig | null> {
  const projectResult = await loadProjectConfigFromDir(projectDir);
  if (projectResult) return projectResult;

  // Global fallback: try home directory
  const homeDir = os.homedir();
  if (!isHomeDirectory(projectDir)) {
    return loadProjectConfigFromDir(homeDir);
  }

  return null;
}

/**
 * Validates a loaded config value. Shape validity is defined by
 * `projectConfigLoaderSchema` (the single definition); on top of the schema's
 * lenient shape, a usable project config additionally requires `name` and
 * `agents` to be present.
 */
export function validateProjectConfig(config: unknown): ValidationResult {
  const result = projectConfigLoaderSchema.safeParse(config);
  if (!result.success) {
    return { valid: false, errors: formatZodErrors(result.error), warnings: [] };
  }

  const errors = [
    ...(result.data.name ? [] : ["name is required and must be a string"]),
    ...(result.data.agents ? [] : ["agents is required and must be an array"]),
  ];
  return { valid: errors.length === 0, errors, warnings: [] };
}
