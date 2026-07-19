import { STANDARD_FILES, STANDARD_DIRS } from "../consts";
import type { CategoryPath } from "../types";

/**
 * YAML field names used in skill metadata.yaml files.
 * Centralized to avoid string duplication across loaders and compilers.
 */
export const METADATA_KEYS = {
  DISPLAY_NAME: "displayName",
  CLI_DESCRIPTION: "cliDescription",
  CATEGORY: "category",
  FORKED_FROM: "forkedFrom",
  CONTENT_HASH: "contentHash",
  USAGE_GUIDANCE: "usageGuidance",
} as const;

/**
 * Default values used when importing third-party skills (no existing metadata).
 */
export const IMPORT_DEFAULTS = {
  // Boundary cast: deliberately outside the generated Category union — external
  // skills have no marketplace category; "imported" is a display-only placeholder
  CATEGORY: "imported" as CategoryPath,
  AUTHOR: "@imported",
  DOMAIN: "shared" as const,
} as const;

/**
 * Default values used for local skills (created via `agentsinc new skill` or discovered locally).
 */
export const LOCAL_DEFAULTS = {
  // Boundary cast: deliberately outside the generated Category union — scaffold
  // placeholder written into starter files for the user to replace
  CATEGORY: "dummy-category" as CategoryPath,
  AUTHOR: "@dummy-author",
  DOMAIN: "dummy" as const,
} as const;

/**
 * Files included when computing a skill's content hash.
 * Shared by versioning.ts (for plugin version bumps) and
 * skill-plugin-compiler.ts (for plugin compilation).
 */
export const SKILL_CONTENT_FILES = [STANDARD_FILES.SKILL_MD, STANDARD_FILES.REFERENCE_MD] as const;

/**
 * Directories included when computing a skill's content hash.
 * Shared by versioning.ts and skill-plugin-compiler.ts.
 */
export const SKILL_CONTENT_DIRS = [STANDARD_DIRS.EXAMPLES, STANDARD_DIRS.SCRIPTS] as const;
