import { parse as parseYaml } from "yaml";
import path from "path";
import { z } from "zod";
import { glob, readFile, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { DIRS, STANDARD_FILES } from "../../consts";
import { loadConfig } from "../configuration/config-loader";
import { METADATA_KEYS } from "../metadata-keys";
import { parseFrontmatter } from "../loading";
import {
  skillCategoriesFileSchema,
  skillRulesFileSchema,
  formatZodIssues,
  categoryPathSchema,
} from "../schemas";
import { mergeMatrixWithSkills } from "./skill-resolution";
import type {
  CategoryMap,
  Domain,
  ExtractedSkillMetadata,
  MergedSkillsMatrix,
  SkillRulesConfig,
  SkillSlug,
} from "../../types";

const rawMetadataSchema = z.object({
  category: categoryPathSchema,
  author: z.string(),
  displayName: z.string().optional(),
  slug: z.string() as z.ZodType<SkillSlug>,
  cliDescription: z.string().optional(),
  usageGuidance: z.string().optional(),
  // Boundary cast: domain is a string at the YAML parse boundary; narrowed to Domain type
  domain: z.string() as z.ZodType<Domain>,
  custom: z.boolean().optional(),
});

/**
 * Loads and validates a skill-categories.ts configuration file.
 *
 * @param configPath - Absolute path to the skill-categories.ts file
 * @returns Parsed and validated categories map
 * @throws When the file cannot be read or fails Zod schema validation
 */
export async function loadSkillCategories(configPath: string): Promise<CategoryMap> {
  const data = await loadConfig<{ version: string; categories: CategoryMap }>(
    configPath,
    skillCategoriesFileSchema,
  );

  if (!data) {
    throw new Error(`Invalid skill categories at '${configPath}': failed to load or validate`);
  }

  verbose(`Loaded skill categories: ${configPath}`);
  return data.categories;
}

/**
 * Loads and validates a skill-rules.ts configuration file.
 *
 * @param configPath - Absolute path to the skill-rules.ts file
 * @returns Parsed and validated skill rules config
 * @throws When the file cannot be read or fails Zod schema validation
 */
export async function loadSkillRules(configPath: string): Promise<SkillRulesConfig> {
  const data = await loadConfig<{
    version: string;
    relationships?: SkillRulesConfig["relationships"];
  }>(configPath, skillRulesFileSchema);

  if (!data) {
    throw new Error(`Invalid skill rules at '${configPath}': failed to load or validate`);
  }

  const config: SkillRulesConfig = {
    version: data.version,
    relationships: data.relationships ?? {
      conflicts: [],
      discourages: [],
      recommends: [],
      requires: [],
      alternatives: [],
    },
  };

  verbose(`Loaded skill rules: ${configPath}`);
  return config;
}

/**
 * Scans a skills directory and extracts metadata from all valid skills.
 *
 * Discovers skills by globbing for `metadata.yaml` files, then for each:
 * 1. Validates a corresponding SKILL.md exists (skips if missing)
 * 2. Parses and validates metadata.yaml against the raw metadata schema
 * 3. Parses SKILL.md frontmatter for the canonical skill ID
 * 4. Merges metadata fields into an ExtractedSkillMetadata object
 *
 * Skills with invalid metadata are warned and skipped. Skills missing
 * the required `displayName` field in metadata.yaml cause a hard error.
 *
 * @param skillsDir - Absolute path to the skills root directory (e.g., `{root}/src/skills`)
 * @returns Array of extracted skill metadata, one per valid skill found
 * @throws When a skill's metadata.yaml is missing the required `displayName` field
 */
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
    const rawMetadata = parseYaml(metadataContent);
    const metadataResult = rawMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      warn(
        `Skipping '${metadataFile}': invalid metadata.yaml — ${formatZodIssues(metadataResult.error.issues)}`,
      );
      continue;
    }

    const metadata = metadataResult.data;
    const skillMdContent = await readFile(skillMdPath);
    const frontmatter = parseFrontmatter(skillMdContent, skillMdPath);

    if (!frontmatter) {
      verbose(`Skipping ${metadataFile}: Invalid SKILL.md frontmatter`);
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
      usageGuidance: metadata.usageGuidance,
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

/**
 * Convenience function that loads categories and rules from standalone files,
 * extracts all skills from the project's skills directory, and merges them
 * into a MergedSkillsMatrix.
 *
 * @param categoriesPath - Path to the skill-categories.ts config file
 * @param rulesPath - Path to the skill-rules.ts config file
 * @param projectRoot - Project root directory (skills are scanned from `{root}/src/skills`)
 * @returns Fully resolved and merged skills matrix
 */
export async function loadAndMergeSkillsMatrix(
  categoriesPath: string,
  rulesPath: string,
  projectRoot: string,
): Promise<MergedSkillsMatrix> {
  const skillsDir = path.join(projectRoot, DIRS.skills);
  const [categories, rules, skills] = await Promise.all([
    loadSkillCategories(categoriesPath),
    loadSkillRules(rulesPath),
    extractAllSkills(skillsDir),
  ]);
  return mergeMatrixWithSkills(categories, rules.relationships, skills);
}
