import path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { fileExists, readFile, writeFile } from "../../utils/fs";
import { getCurrentDate } from "../versioning";
import { SCHEMA_PATHS, STANDARD_FILES, YAML_FORMATTING } from "../../consts";
import { yamlSchemaComment, stripYamlSchemaComment } from "../../utils/yaml-schema";
import type { SkillId } from "../../types";
import { formatZodIssues, localSkillMetadataSchema } from "../schemas";
import { warn } from "../../utils/logger";

/**
 * Tracks the original marketplace source of a locally-installed skill.
 *
 * Written into each skill's metadata.yaml under the `forkedFrom` key when a skill
 * is copied from a source repository to the local `.claude/skills/` directory.
 * Used for version comparison, update detection, and provenance tracking.
 */
export type ForkedFromMetadata = {
  /** Canonical skill ID from the source repository (e.g., "cc-ts-react-hook-form") */
  skillId: SkillId;
  /** SHA-256 hash of the source SKILL.md content at the time of installation */
  contentHash: string;
  /** ISO date string (YYYY-MM-DD) when the skill was installed or last updated */
  date: string;
  /** Source URL the skill was installed from (e.g., "github:agents-inc/skills") */
  source?: string;
  /**
   * The skill's own DIRECTORY inside the repository `source` names — `skills/brainstorming`,
   * never the SKILL.md.
   *
   * Recorded only where it is the whole address. A marketplace resolves every id it serves, so a
   * skill ejected from one is installed again by its id and where inside that repository it lived
   * is nobody else's business. A skill a shared configuration CARRIED answers to no catalogue at
   * all, and this pair — repository and directory — is the only address it has: without it, the
   * producer that shares this installation can name the id and not the content behind it.
   */
  path?: string;
};

/**
 * Full metadata.yaml content for a locally-installed skill.
 *
 * Parsed from the `metadata.yaml` file in each skill directory under `.claude/skills/`.
 * Uses an index signature to preserve unknown fields written by other tools.
 */
export type LocalSkillMetadata = {
  /** Provenance metadata linking back to the original source skill, if any */
  forkedFrom?: ForkedFromMetadata;
  [key: string]: unknown;
};

/**
 * Reads forkedFrom metadata from a skill's metadata.yaml file.
 *
 * This metadata tracks the original marketplace source of a locally-installed skill,
 * enabling version comparison and update detection via content hash matching.
 *
 * @param skillDir - Absolute path to the skill directory (e.g., `/project/.claude/skills/react-hook-form`)
 * @returns The `forkedFrom` metadata if present and valid, `null` if the file doesn't exist,
 *          has no `forkedFrom` field, or fails Zod validation (warns on invalid metadata)
 *
 * @example
 * ```ts
 * const metadata = await readForkedFromMetadata("/project/.claude/skills/react-hook-form");
 * if (metadata) {
 *   console.log(`Installed from ${metadata.skillId} on ${metadata.date}`);
 * }
 * ```
 */
export async function readForkedFromMetadata(skillDir: string): Promise<ForkedFromMetadata | null> {
  const metadata = await readLocalSkillMetadata(skillDir);
  return metadata?.forkedFrom ?? null;
}

/**
 * Reads the full local skill metadata from a skill's metadata.yaml file.
 *
 * Returns the parsed metadata including `forkedFrom` field.
 * Used by the uninstall command to determine whether a skill was installed by the CLI.
 *
 * @param skillDir - Absolute path to the skill directory
 * @returns The parsed metadata if valid, `null` if the file doesn't exist or is invalid
 */
export async function readLocalSkillMetadata(skillDir: string): Promise<LocalSkillMetadata | null> {
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);

  if (!(await fileExists(metadataPath))) {
    return null;
  }

  const content = await readFile(metadataPath);
  const result = localSkillMetadataSchema.safeParse(parseYaml(content));

  if (!result.success) {
    warn(`Invalid metadata.yaml at ${metadataPath}: ${formatZodIssues(result.error.issues)}`);
    return null;
  }

  return result.data;
}

/**
 * Writes forked-from provenance metadata into a skill's metadata.yaml.
 *
 * Reads the existing metadata.yaml (preserving any extra fields), sets the
 * `forkedFrom` block with the given skill ID, content hash, and current date,
 * then writes the file back with a YAML language server schema comment.
 *
 * Called during skill installation (by the skill copier) to record where a
 * locally-installed skill originated from.
 *
 * @param destPath - Absolute path to the skill directory containing metadata.yaml.
 *                   The file must already exist (created during skill copy).
 * @param skillId - Canonical skill ID from the source repository (e.g., "cc-ts-react-hook-form")
 * @param contentHash - SHA-256 hash of the source SKILL.md content at install time
 * @param origin - Where the bytes came from: the repository ref, and the directory inside it for
 *                 a skill nothing but that directory can install again. A bag rather than two
 *                 positional strings, because two adjacent optional strings can be swapped
 *                 silently and these two mean entirely different things.
 *
 * @remarks
 * **Side effect:** Overwrites `{destPath}/metadata.yaml` on disk. Existing fields
 * are preserved if the file parses successfully; if parsing fails, only `forkedFrom`
 * is written (with a warning logged).
 */
export async function injectForkedFromMetadata(
  destPath: string,
  skillId: SkillId,
  contentHash: string,
  origin: Pick<ForkedFromMetadata, "source" | "path"> = {},
): Promise<void> {
  const metadataPath = path.join(destPath, STANDARD_FILES.METADATA_YAML);
  const rawContent = await readFile(metadataPath);
  const { yamlContent } = stripYamlSchemaComment(rawContent);

  const parseResult = localSkillMetadataSchema.safeParse(parseYaml(yamlContent));
  if (!parseResult.success) {
    warn(`Malformed metadata.yaml at '${metadataPath}' — existing fields may be lost`);
  }
  const metadata: LocalSkillMetadata = {
    ...(parseResult.success ? parseResult.data : {}),
    forkedFrom: {
      skillId,
      contentHash,
      date: getCurrentDate(),
      ...(origin.source !== undefined && { source: origin.source }),
      ...(origin.path !== undefined && { path: origin.path }),
    },
  };

  await writeMetadataYaml(metadataPath, metadata, `${yamlSchemaComment(SCHEMA_PATHS.metadata)}\n`);
}

/**
 * Serializes skill metadata with the standard line-width policy and writes it,
 * optionally prefixed by a yaml-language-server schema comment.
 */
export async function writeMetadataYaml(
  filePath: string,
  metadata: unknown,
  schemaComment = "",
): Promise<void> {
  const yamlContent = stringifyYaml(metadata, { lineWidth: YAML_FORMATTING.LINE_WIDTH_NONE });
  await writeFile(filePath, schemaComment + yamlContent);
}
