import path from "path";
import { sortBy } from "remeda";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { fileExists, readFile, writeFile, listDirectories } from "../../utils/fs";
import { computeFileHash } from "../versioning";
import { getCurrentDate } from "../versioning";
import {
  LOCAL_SKILLS_PATH,
  SCHEMA_PATHS,
  STANDARD_FILES,
  YAML_FORMATTING,
  yamlSchemaComment,
  stripYamlSchemaComment,
} from "../../consts";
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
 * Result of comparing a local skill against its source repository version.
 *
 * Produced by {@link compareLocalSkillsWithSource} for each skill in the local
 * `.claude/skills/` directory. Used by `agentsinc outdated` to display update status.
 */
export type SkillComparisonResult = {
  /** Canonical skill ID (from forkedFrom metadata, or directory name if no metadata) */
  id: SkillId;
  /** SHA-256 hash of the local SKILL.md content at install time, null if no forkedFrom metadata */
  localHash: string | null;
  /** SHA-256 hash of the current source SKILL.md, null if source skill no longer exists */
  sourceHash: string | null;
  /** "current" if hashes match, "outdated" if they differ, "local-only" if no source link */
  status: "current" | "outdated" | "local-only";
  /** Directory name under `.claude/skills/` (may differ from skill ID for aliased skills) */
  dirName: string;
  /** Relative path within the source repository, present only when the source skill exists */
  sourcePath?: string;
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
 * Scans all local skill directories and reads their forked-from metadata.
 *
 * Enumerates every subdirectory under `{projectDir}/.claude/skills/` and reads
 * the `forkedFrom` field from each skill's metadata.yaml. The returned Map is
 * keyed by skill ID (from `forkedFrom.skillId` if available, otherwise the
 * directory name).
 *
 * @param projectDir - Absolute path to the project root containing `.claude/skills/`
 * @returns Map from skill identifier to its directory name and forked-from metadata.
 *          Returns an empty Map if the skills directory doesn't exist.
 *
 * @example
 * ```ts
 * const skills = await getLocalSkillsWithMetadata("/project");
 * for (const [id, { dirName, forkedFrom }] of skills) {
 *   console.log(`${id} in ${dirName}, forked: ${forkedFrom !== null}`);
 * }
 * ```
 */
export async function getLocalSkillsWithMetadata(
  projectDir: string,
): Promise<Map<string, { dirName: string; forkedFrom: ForkedFromMetadata | null }>> {
  const localSkillsPath = path.join(projectDir, LOCAL_SKILLS_PATH);

  if (!(await fileExists(localSkillsPath))) {
    return new Map();
  }

  const skillDirs = await listDirectories(localSkillsPath);
  // Parallel reads; Map insertion order (and last-wins on duplicate ids) follows dir order
  const entries = await Promise.all(
    skillDirs.map(async (dirName) => {
      const forkedFrom = await readForkedFromMetadata(path.join(localSkillsPath, dirName));
      return { skillId: forkedFrom?.skillId ?? dirName, dirName, forkedFrom };
    }),
  );
  return new Map(
    entries.map(({ skillId, dirName, forkedFrom }) => [skillId, { dirName, forkedFrom }]),
  );
}

/**
 * Computes the SHA-256 content hash of a skill's SKILL.md in a source repository.
 *
 * Used to compare the current source version against the locally-installed version's
 * `contentHash` to detect whether updates are available.
 *
 * @param sourcePath - Absolute path to the source repository root
 * @param skillPath - Relative path to the skill within `src/` (e.g., "web/react/react-hook-form")
 * @returns SHA-256 hash string of the source SKILL.md, or `null` if the file doesn't exist
 */
export async function computeSourceHash(
  sourcePath: string,
  skillPath: string,
): Promise<string | null> {
  const skillMdPath = path.join(sourcePath, "src", skillPath, STANDARD_FILES.SKILL_MD);

  if (!(await fileExists(skillMdPath))) {
    return null;
  }

  return computeFileHash(skillMdPath);
}

/**
 * Compares all local skills against their source repository versions.
 *
 * For each skill in `{projectDir}/.claude/skills/`, reads its `forkedFrom` metadata
 * and computes the current source hash. Skills are classified as:
 * - **"current"** -- local content hash matches the source (no update available)
 * - **"outdated"** -- hashes differ (source has been updated since installation)
 * - **"local-only"** -- no `forkedFrom` metadata, or the source skill no longer exists
 *
 * Results are sorted alphabetically by skill ID.
 *
 * @param projectDir - Absolute path to the project root containing `.claude/skills/`
 * @param sourcePath - Absolute path to the source repository root (used to locate SKILL.md files)
 * @param sourceSkills - Map of skill IDs to their relative paths within the source repository.
 *                       Typically built from the skills matrix. Keys are skill IDs, values have
 *                       a `path` field (e.g., `{ path: "web/react/react-hook-form" }`)
 * @returns Array of comparison results, one per local skill, sorted by skill ID
 *
 * @example
 * ```ts
 * const results = await compareLocalSkillsWithSource(
 *   "/project",
 *   "/tmp/source-repo",
 *   { "cc-ts-react-hook-form": { path: "web/react/react-hook-form" } },
 * );
 * const outdated = results.filter((r) => r.status === "outdated");
 * ```
 */
export async function compareLocalSkillsWithSource(
  projectDir: string,
  sourcePath: string,
  sourceSkills: Record<string, { path: string }>,
): Promise<SkillComparisonResult[]> {
  const localSkills = await getLocalSkillsWithMetadata(projectDir);

  const results = await Promise.all(
    [...localSkills].map(([skillId, { dirName, forkedFrom }]) =>
      classifyLocalSkill(skillId, dirName, forkedFrom, sourcePath, sourceSkills),
    ),
  );
  return sortBy(results, (r) => r.id);
}

/** Classifies one local skill against the source: local-only, current, or outdated. */
async function classifyLocalSkill(
  skillId: string,
  dirName: string,
  forkedFrom: ForkedFromMetadata | null,
  sourcePath: string,
  sourceSkills: Record<string, { path: string }>,
): Promise<SkillComparisonResult> {
  if (!forkedFrom) {
    // Boundary cast: skillId comes from Map<string, ...> keys (directory names or forkedFrom.skillId)
    return {
      id: skillId as SkillId,
      localHash: null,
      sourceHash: null,
      status: "local-only",
      dirName,
    };
  }

  const localHash = forkedFrom.contentHash;
  const sourceSkill = sourceSkills[forkedFrom.skillId];
  if (!sourceSkill) {
    return { id: forkedFrom.skillId, localHash, sourceHash: null, status: "local-only", dirName };
  }

  const sourceHash = await computeSourceHash(sourcePath, sourceSkill.path);
  if (sourceHash === null) {
    return { id: forkedFrom.skillId, localHash, sourceHash: null, status: "local-only", dirName };
  }

  return {
    id: forkedFrom.skillId,
    localHash,
    sourceHash,
    status: localHash === sourceHash ? "current" : "outdated",
    dirName,
    sourcePath: sourceSkill.path,
  };
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
 * @param source - Source URL the skill was installed from (e.g., "github:agents-inc/skills")
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
  source?: string,
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
      skillId: skillId,
      contentHash: contentHash,
      date: getCurrentDate(),
      ...(source ? { source } : {}),
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
