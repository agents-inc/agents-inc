import { parse as parseYaml } from "yaml";
import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { unreadableFrontmatter } from "../../utils/frontmatter";
import { glob, readFile, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { STANDARD_FILES } from "../../consts";
import { loadConfig } from "../configuration/config-loader";
import { METADATA_KEYS } from "../metadata-keys";
import { parseFrontmatter } from "../loading";
import {
  skillCategoriesFileSchema,
  skillRulesFileSchema,
  formatZodIssues,
  matrixRawMetadataSchema,
} from "../schemas";
import type { CategoryMap, ExtractedSkillMetadata, SkillRulesConfig } from "../../types";

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

/** Files describing no skill are warned and skipped; a missing `displayName` throws. */
export async function extractAllSkills(skillsDir: string): Promise<ExtractedSkillMetadata[]> {
  const skills: ExtractedSkillMetadata[] = [];
  const metadataFiles = await glob(`**/${STANDARD_FILES.METADATA_YAML}`, skillsDir);

  for (const metadataFile of metadataFiles) {
    const skillDir = path.dirname(metadataFile);
    const skillMdPath = path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD);
    const metadataPath = path.join(skillsDir, metadataFile);

    if (!(await fileExists(skillMdPath))) {
      verbose(`Skipping ${metadataFile}: No ${STANDARD_FILES.SKILL_MD} found`);
      continue;
    }

    const metadataContent = await readFile(metadataPath);

    // safeParse cannot catch a file nothing parses; both skip this skill, not the scan.
    let rawMetadata: unknown;
    try {
      rawMetadata = parseYaml(metadataContent);
    } catch (error) {
      warn(
        `Skipping '${metadataFile}': unparseable ${STANDARD_FILES.METADATA_YAML} at ${metadataPath} — ${getErrorMessage(error)}`,
      );
      continue;
    }

    const metadataResult = matrixRawMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      warn(
        `Skipping '${metadataFile}': invalid metadata.yaml — ${formatZodIssues(metadataResult.error.issues)}`,
      );
      continue;
    }

    const metadata = metadataResult.data;
    const skillMdContent = await readFile(skillMdPath);
    const frontmatter = parseFrontmatter(skillMdContent, skillMdPath);

    // A frontmatter that read but failed its schema was already named by `parseFrontmatter`.
    if (!frontmatter) {
      const unreadable = unreadableFrontmatter(skillMdContent);
      if (unreadable !== undefined) {
        warn(
          `Skipping '${path.join(skillDir, STANDARD_FILES.SKILL_MD)}': unparseable ${STANDARD_FILES.SKILL_MD} frontmatter at ${skillMdPath} — ${unreadable}`,
        );
      }
      continue;
    }

    if (!metadata.displayName) {
      throw new Error(
        `Skill at ${metadataFile} is missing required '${METADATA_KEYS.DISPLAY_NAME}' field in metadata.yaml`,
      );
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
      path: `skills/${skillDir}/`,
      domain: metadata.domain,
      displayName: metadata.displayName,
      slug: metadata.slug,
      ...(metadata.custom === true ? { custom: true } : {}),
    };

    skills.push(extracted);
    verbose(`Extracted skill: ${skillId}`);
  }

  return skills;
}
