import path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { fileExists, readFile, writeFile } from "../../utils/fs";
import { getCurrentDate } from "../versioning";
import { SCHEMA_PATHS, STANDARD_FILES, YAML_FORMATTING } from "../../consts";
import { yamlSchemaComment, stripYamlSchemaComment } from "../../utils/yaml-schema";
import type { SkillId } from "../../types";
import { formatZodIssues, localSkillMetadataSchema } from "../schemas";
import { warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";

/** Provenance written under `forkedFrom` when a skill is copied locally. */
export type ForkedFromMetadata = {
  skillId: SkillId;
  /** SHA-256 hash of the source SKILL.md content at the time of installation */
  contentHash: string;
  /** ISO date string (YYYY-MM-DD) when the skill was installed or last updated */
  date: string;
  source?: string;
  /**
   * The skill's directory inside `source`; recorded only for a skill no catalogue resolves by id.
   */
  path?: string;
};

/** The index signature preserves fields written by other tools. */
export type LocalSkillMetadata = {
  forkedFrom?: ForkedFromMetadata;
  [key: string]: unknown;
};

/** `null` when absent, without `forkedFrom`, or invalid (warned). */
export async function readForkedFromMetadata(skillDir: string): Promise<ForkedFromMetadata | null> {
  const metadata = await readLocalSkillMetadata(skillDir);
  return metadata?.forkedFrom ?? null;
}

/** `null` when absent or invalid; uninstall uses it to tell CLI-installed skills apart. */
export async function readLocalSkillMetadata(skillDir: string): Promise<LocalSkillMetadata | null> {
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);

  if (!(await fileExists(metadataPath))) {
    return null;
  }

  const content = await readFile(metadataPath);
  const read = readYaml(content);

  if (!read.parsed) {
    warn(`Invalid metadata.yaml at ${metadataPath}: ${read.reason}`);
    return null;
  }

  const result = localSkillMetadataSchema.safeParse(read.value);

  if (!result.success) {
    warn(`Invalid metadata.yaml at ${metadataPath}: ${formatZodIssues(result.error.issues)}`);
    return null;
  }

  return result.data;
}

/**
 * Overwrites `{destPath}/metadata.yaml` with `forkedFrom` set, keeping existing fields when the
 * file parses; otherwise writes only `forkedFrom`, with a warning. `origin` is a bag so its two
 * strings cannot be swapped silently.
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

  const metadata: LocalSkillMetadata = {
    ...existingMetadataFields(yamlContent, metadataPath),
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

export async function writeMetadataYaml(
  filePath: string,
  metadata: unknown,
  schemaComment = "",
): Promise<void> {
  const yamlContent = stringifyYaml(metadata, { lineWidth: YAML_FORMATTING.LINE_WIDTH_NONE });
  await writeFile(filePath, schemaComment + yamlContent);
}

type YamlRead =
  | { readonly parsed: true; readonly value: unknown }
  | { readonly parsed: false; readonly reason: string };

/** Catches a syntax error, which throws before any schema `safeParse` runs. */
function readYaml(content: string): YamlRead {
  try {
    return { parsed: true, value: parseYaml(content) };
  } catch (error) {
    return { parsed: false, reason: getErrorMessage(error) };
  }
}

/** Empty, with one warning, for either failure: the author's fields are about to be replaced. */
function existingMetadataFields(
  yamlContent: string,
  metadataPath: string,
): Partial<LocalSkillMetadata> {
  const read = readYaml(yamlContent);

  if (read.parsed) {
    const result = localSkillMetadataSchema.safeParse(read.value);
    if (result.success) return result.data;
  }

  warn(`Malformed metadata.yaml at '${metadataPath}' — existing fields may be lost`);
  return {};
}
