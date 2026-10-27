import type { z } from "zod";
import { STANDARD_FILES, STANDARD_DIRS } from "../consts";
import type { metadataValidationSchema } from "./schemas";

/** Messages tell an author to set these, so a field the schema renames reddens here. */
type MetadataField = keyof z.infer<typeof metadataValidationSchema>;

export const METADATA_KEYS = {
  DISPLAY_NAME: "displayName",
  CATEGORY: "category",
  CUSTOM: "custom",
} as const satisfies Record<string, MetadataField>;

/** Forced over whatever the file says: a local skill answers to its machine, not a handle. */
export const LOCAL_DEFAULTS = {
  AUTHOR: "@dummy-author",
} as const;

export const SKILL_CONTENT_FILES = [STANDARD_FILES.SKILL_MD, STANDARD_FILES.REFERENCE_MD] as const;

export const SKILL_CONTENT_DIRS = [STANDARD_DIRS.EXAMPLES, STANDARD_DIRS.SCRIPTS] as const;
