import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../consts";
import type { ProjectConfig, ValidationResult } from "../../types";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { projectConfigLoaderSchema } from "../schemas";
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
    config = result.data as ProjectConfig;
  } catch (error) {
    verbose(`Failed to load project config at ${configPath}: ${getErrorMessage(error)}`);
    return null;
  }

  // Boundary cast: Zod-parsed stack has unnormalized values (bare strings, objects, arrays)
  // that normalizeStackRecord converts to typed SkillAssignment[] values
  if (config.stack) {
    config.stack = normalizeStackRecord(
      config.stack as unknown as Record<string, Record<string, unknown>>,
    );
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

export function validateProjectConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Config must be an object"], warnings: [] };
  }

  // Boundary cast: config validated as object above, narrow to record for field access
  const c = config as Record<string, unknown>;

  if (!c.name || typeof c.name !== "string") {
    errors.push("name is required and must be a string");
  }

  if (!c.agents || !Array.isArray(c.agents)) {
    errors.push("agents is required and must be an array");
  } else {
    for (const agent of c.agents) {
      if (
        typeof agent !== "object" ||
        agent === null ||
        typeof (agent as Record<string, unknown>).name !== "string"
      ) {
        errors.push(`agents must contain objects with name and scope, found: ${typeof agent}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
