import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../consts";
import type { ProjectConfig, ValidationResult } from "../../types";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { projectConfigLoaderSchema } from "../schemas";
import { formatZodErrors } from "../schema-validator";
import { loadConfig } from "./config-loader";

export type LoadedProjectConfig = {
  config: ProjectConfig;
  configPath: string;
};

/** Load project config from a specific directory only (no global fallback). */
export async function loadProjectConfigFromDir(
  projectDir: string,
): Promise<LoadedProjectConfig | null> {
  const configPath = path.join(projectDir, `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);

  if (!(await fileExists(configPath))) {
    verbose(`Project config not found at ${configPath}`);
    return null;
  }

  let config: ProjectConfig | null;
  try {
    // Load raw object and validate with Zod (lenient schema accepts custom values via z.string() casts)
    const raw = await loadConfig<ProjectConfig>(configPath);
    if (!raw || typeof raw !== "object") return null;

    const result = projectConfigLoaderSchema.safeParse(raw);
    if (!result.success) {
      verbose(`Config validation failed at ${configPath}: ${JSON.stringify(result.error)}`);
      return null;
    }
    // Normalize the loose stack values (bare strings, objects, arrays) BEFORE claiming
    // ProjectConfig, so the boundary cast below is the only one on this path.
    const parsed = result.data;
    const normalizedStack = parsed.stack ? normalizeStackRecord(parsed.stack) : undefined;
    // Boundary cast: loader schema is lenient (optional name, loose strings);
    // validateProjectConfig enforces the strict shape after load
    config = {
      ...parsed,
      ...(normalizedStack && { stack: normalizedStack }),
    } as ProjectConfig;
  } catch (error) {
    verbose(`Failed to load project config at ${configPath}: ${getErrorMessage(error)}`);
    return null;
  }

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
  if (projectDir !== homeDir) {
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
