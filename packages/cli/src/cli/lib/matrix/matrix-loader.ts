import { parse as parseYaml } from "yaml";
import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { unreadableFrontmatter } from "../../utils/frontmatter";
import { glob, readFile, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { STANDARD_DIRS, STANDARD_FILES } from "../../consts";
import { loadConfig } from "../configuration/config-loader";
import { METADATA_KEYS } from "../metadata-keys";
import { parseFrontmatter } from "../loading";
import {
  skillCategoriesFileSchema,
  skillRulesFileSchema,
  formatZodIssues,
  matrixRawMetadataSchema,
} from "../schemas";
import type {
  CategoryMap,
  ExtractedSkillMetadata,
  SkillFrontmatter,
  SkillId,
  SkillRulesConfig,
} from "../../types";
import type { z } from "zod";

type MatrixRawMetadata = z.infer<typeof matrixRawMetadataSchema>;

export async function loadSkillCategories(configPath: string): Promise<CategoryMap> {
  const data = await loadConfig(configPath, skillCategoriesFileSchema);

  if (!data) {
    throw new Error(`Invalid skill categories at '${configPath}': failed to load or validate`);
  }

  verbose(`Loaded skill categories: ${configPath}`);
  return data.categories;
}

/** A rules file `loadConfig` answers `null` for: absent, or exporting nothing. */
export class NoSkillRulesError extends Error {
  constructor(readonly configPath: string) {
    super(`Invalid skill rules at '${configPath}': failed to load or validate`);
    this.name = "NoSkillRulesError";
  }
}

export async function loadSkillRules(configPath: string): Promise<SkillRulesConfig> {
  const data = await loadConfig(configPath, skillRulesFileSchema);

  if (!data) {
    throw new NoSkillRulesError(configPath);
  }

  const config: SkillRulesConfig = {
    version: data.version,
    relationships: data.relationships ?? {
      conflicts: [],
      discourages: [],
      requires: [],
      alternatives: [],
    },
  };

  verbose(`Loaded skill rules: ${configPath}`);
  return config;
}

/** A skills folder as read: the skills it loaded, and the ids of those it could not. */
export type ExtractedSkills = {
  skills: ExtractedSkillMetadata[];
  /** Each named by its SKILL.md; a folder whose SKILL.md names nothing is in neither list. */
  unloadedSkillIds: SkillId[];
};

/** `unnamed`: skipped before any SKILL.md named it, so the skip carries no id. */
type SkillFolderRead =
  | { kind: "loaded"; skill: ExtractedSkillMetadata }
  | { kind: "unloaded"; skillId: SkillId }
  | { kind: "unnamed" };

/** A file describing no usable skill is warned and skipped; it never ends the scan. */
export async function extractAllSkills(skillsDir: string): Promise<ExtractedSkills> {
  const metadataFiles = await glob(`**/${STANDARD_FILES.METADATA_YAML}`, skillsDir);
  const folders: SkillFolderRead[] = [];

  // One at a time, so the warnings come in the order the folders do.
  for (const metadataFile of metadataFiles) {
    folders.push(await readSkillFolder(skillsDir, metadataFile));
  }

  return {
    skills: folders.flatMap((folder) => (folder.kind === "loaded" ? [folder.skill] : [])),
    unloadedSkillIds: folders.flatMap((folder) =>
      folder.kind === "unloaded" ? [folder.skillId] : [],
    ),
  };
}

/** Each skip is warned here or by a reader it calls, and names its skill where a SKILL.md can. */
async function readSkillFolder(skillsDir: string, metadataFile: string): Promise<SkillFolderRead> {
  const skillDir = path.dirname(metadataFile);
  const skillMdPath = path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD);

  if (!(await fileExists(skillMdPath))) {
    warn(`Skipping '${metadataFile}': No ${STANDARD_FILES.SKILL_MD} found`);
    return { kind: "unnamed" };
  }

  const metadata = await readMatrixMetadataOrWarn(metadataFile, path.join(skillsDir, metadataFile));
  if (!metadata) return unloadedSkillNamedBy(skillMdPath);

  const frontmatter = parseFrontmatterOrWarn(skillDir, skillMdPath, await readFile(skillMdPath));
  if (!frontmatter) return { kind: "unnamed" };

  if (!metadata.displayName) {
    warn(
      `Skipping '${metadataFile}': invalid ${STANDARD_FILES.METADATA_YAML} — missing required field: ${METADATA_KEYS.DISPLAY_NAME}`,
    );
    return { kind: "unloaded", skillId: frontmatter.name };
  }

  const skillId = frontmatter.name;

  const extracted: ExtractedSkillMetadata = {
    id: skillId,
    directoryPath: skillDir,
    description: metadata.cliDescription || frontmatter.description,
    ...(frontmatter.description && { activationDescription: frontmatter.description }),
    ...(metadata.usageGuidance !== undefined && { usageGuidance: metadata.usageGuidance }),
    category: metadata.category,
    author: metadata.author,
    path: `${STANDARD_DIRS.SKILLS}/${skillDir}/`,
    domain: metadata.domain,
    displayName: metadata.displayName,
    slug: metadata.slug,
    ...(metadata.custom === true ? { custom: true } : {}),
  };

  verbose(`Extracted skill: ${skillId}`);
  return { kind: "loaded", skill: extracted };
}

/**
 * Which skill a refused metadata.yaml cost, read off its SKILL.md. The skip is already warned, so a
 * SKILL.md that cannot say leaves it unnamed rather than ending the scan.
 */
async function unloadedSkillNamedBy(skillMdPath: string): Promise<SkillFolderRead> {
  try {
    const frontmatter = parseFrontmatter(await readFile(skillMdPath), skillMdPath);
    return frontmatter ? { kind: "unloaded", skillId: frontmatter.name } : { kind: "unnamed" };
  } catch (error) {
    verbose(`No skill named by '${skillMdPath}' — ${getErrorMessage(error)}`);
    return { kind: "unnamed" };
  }
}

async function readMatrixMetadataOrWarn(
  metadataFile: string,
  metadataPath: string,
): Promise<MatrixRawMetadata | null> {
  const metadataContent = await readFile(metadataPath);

  // safeParse cannot catch a file nothing parses; both skip this skill, not the scan.
  let rawMetadata: unknown;
  try {
    rawMetadata = parseYaml(metadataContent);
  } catch (error) {
    warn(
      `Skipping '${metadataFile}': unparseable ${STANDARD_FILES.METADATA_YAML} at ${metadataPath} — ${getErrorMessage(error)}`,
    );
    return null;
  }

  const metadataResult = matrixRawMetadataSchema.safeParse(rawMetadata);

  if (!metadataResult.success) {
    warn(
      `Skipping '${metadataFile}': invalid metadata.yaml — ${formatZodIssues(metadataResult.error.issues)}`,
    );
    return null;
  }

  return metadataResult.data;
}

/** A frontmatter that read but failed its schema was already named by `parseFrontmatter`. */
function parseFrontmatterOrWarn(
  skillDir: string,
  skillMdPath: string,
  skillMdContent: string,
): SkillFrontmatter | null {
  const frontmatter = parseFrontmatter(skillMdContent, skillMdPath);
  if (frontmatter) return frontmatter;

  const unreadable = unreadableFrontmatter(skillMdContent);
  if (unreadable !== undefined) {
    warn(
      `Skipping '${path.join(skillDir, STANDARD_FILES.SKILL_MD)}': unparseable ${STANDARD_FILES.SKILL_MD} frontmatter at ${skillMdPath} — ${unreadable}`,
    );
  }
  return null;
}
