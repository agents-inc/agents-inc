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

export async function loadSkillRules(configPath: string): Promise<SkillRulesConfig> {
  const data = await loadConfig(configPath, skillRulesFileSchema);

  if (!data) {
    throw new Error(`Invalid skill rules at '${configPath}': failed to load or validate`);
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

/** A file describing no usable skill is warned and skipped; it never ends the scan. */
export async function extractAllSkills(skillsDir: string): Promise<ExtractedSkillMetadata[]> {
  const metadataFiles = await glob(`**/${STANDARD_FILES.METADATA_YAML}`, skillsDir);
  const skills: ExtractedSkillMetadata[] = [];

  for (const metadataFile of metadataFiles) {
    const skill = await extractSkill(skillsDir, metadataFile);
    if (skill) skills.push(skill);
  }

  return skills;
}

/** `null` skips this skill, not the scan. */
async function extractSkill(
  skillsDir: string,
  metadataFile: string,
): Promise<ExtractedSkillMetadata | null> {
  const skillDir = path.dirname(metadataFile);
  const skillMdPath = path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD);

  if (!(await fileExists(skillMdPath))) {
    verbose(`Skipping ${metadataFile}: No ${STANDARD_FILES.SKILL_MD} found`);
    return null;
  }

  const metadata = await readMatrixMetadataOrWarn(metadataFile, path.join(skillsDir, metadataFile));
  if (!metadata) return null;

  const frontmatter = parseFrontmatterOrWarn(skillDir, skillMdPath, await readFile(skillMdPath));
  if (!frontmatter) return null;

  if (!metadata.displayName) {
    warn(
      `Skipping '${metadataFile}': invalid ${STANDARD_FILES.METADATA_YAML} — missing required field: ${METADATA_KEYS.DISPLAY_NAME}`,
    );
    return null;
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
  return extracted;
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
