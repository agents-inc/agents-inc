import { STANDARD_FILES, STANDARD_DIRS } from "../consts";

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
 * What a skill discovered on disk is attributed to.
 *
 * Forced rather than defaulted: the merge writes it over whatever the file says,
 * because a local skill answers to the machine it sits on and not to a handle.
 *
 * It used to have a `CATEGORY` and a `DOMAIN` beside it — `dummy-category` and
 * `dummy`, a taxonomy in no union, placing a skill in a tab nothing draws and a
 * stack no sub-agent reads. They were scaffold placeholders for `new skill` and
 * `import skill`, and both commands were deleted; nothing has read either since.
 */
export const LOCAL_DEFAULTS = {
  AUTHOR: "@dummy-author",
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
