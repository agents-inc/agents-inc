import { STANDARD_FILES, STANDARD_DIRS } from "../consts";

export const METADATA_KEYS = {
  DISPLAY_NAME: "displayName",
  CLI_DESCRIPTION: "cliDescription",
  CATEGORY: "category",
  FORKED_FROM: "forkedFrom",
  CONTENT_HASH: "contentHash",
  USAGE_GUIDANCE: "usageGuidance",
  CUSTOM: "custom",
} as const;

/** Forced over whatever the file says: a local skill answers to its machine, not a handle. */
export const LOCAL_DEFAULTS = {
  AUTHOR: "@dummy-author",
} as const;

export const SKILL_CONTENT_FILES = [STANDARD_FILES.SKILL_MD, STANDARD_FILES.REFERENCE_MD] as const;

export const SKILL_CONTENT_DIRS = [STANDARD_DIRS.EXAMPLES, STANDARD_DIRS.SCRIPTS] as const;
