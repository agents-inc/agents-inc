import { parse as parseYaml } from "yaml";
import path from "path";
import { directoryExists, listDirectories, fileExists, readFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts";
import { parseFrontmatter } from "../loading";
import type { CategoryPath, Domain, ExtractedSkillMetadata, SkillSlug } from "../../types";
import { formatZodIssues, localRawMetadataSchema } from "../schemas";
import { LOCAL_DEFAULTS } from "../metadata-keys";

export type LocalRawMetadata = {
  displayName: string;
  /** Kebab-case short key for alias resolution */
  slug: SkillSlug;
  cliDescription?: string;
  /** Skill category (e.g., "web-framework", "web-styling", "api-api") */
  category: CategoryPath;
  usageGuidance?: string;
  tags?: string[];
  /** Domain this skill belongs to (e.g., "web", "api", "cli") */
  domain: Domain;
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

export type LocalSkillDiscoveryResult = {
  skills: ExtractedSkillMetadata[];
  localSkillsPath: string;
};

export async function discoverLocalSkills(
  projectDir: string,
): Promise<LocalSkillDiscoveryResult | null> {
  const localSkillsPath = path.join(projectDir, LOCAL_SKILLS_PATH);

  if (!(await directoryExists(localSkillsPath))) {
    verbose(`Local skills directory not found: ${localSkillsPath}`);
    return null;
  }

  const skillDirs = await listDirectories(localSkillsPath);
  const extracted = await Promise.all(
    skillDirs.map((skillDirName) => extractLocalSkill(localSkillsPath, skillDirName)),
  );
  const skills = extracted.filter((skill) => skill !== null);

  verbose(`Discovered ${skills.length} local skills from ${localSkillsPath}`);

  return {
    skills,
    localSkillsPath,
  };
}

async function extractLocalSkill(
  localSkillsPath: string,
  skillDirName: string,
): Promise<ExtractedSkillMetadata | null> {
  const skillDir = path.join(localSkillsPath, skillDirName);
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);

  if (!(await fileExists(metadataPath))) {
    verbose(`Skipping local skill '${skillDirName}': No metadata.yaml found`);
    return null;
  }

  if (!(await fileExists(skillMdPath))) {
    verbose(`Skipping local skill '${skillDirName}': No SKILL.md found`);
    return null;
  }

  const metadataContent = await readFile(metadataPath);
  const parsed = localRawMetadataSchema.safeParse(parseYaml(metadataContent));

  if (!parsed.success) {
    verbose(
      `Skipping local skill '${skillDirName}': invalid metadata.yaml — ${formatZodIssues(parsed.error.issues)}`,
    );
    return null;
  }

  const metadata = parsed.data;

  const skillMdContent = await readFile(skillMdPath);
  const frontmatter = parseFrontmatter(skillMdContent, skillMdPath);

  if (!frontmatter) {
    verbose(`Skipping local skill '${skillDirName}': invalid SKILL.md frontmatter`);
    return null;
  }

  const relativePath = `${LOCAL_SKILLS_PATH}/${skillDirName}/`;
  const absolutePath = path.join(localSkillsPath, skillDirName) + path.sep;
  const skillId = frontmatter.name;

  const extracted: ExtractedSkillMetadata = {
    id: skillId,
    directoryPath: skillDirName,
    description: metadata.cliDescription || frontmatter.description,
    usageGuidance: metadata.usageGuidance,
    category: metadata.category,
    author: LOCAL_DEFAULTS.AUTHOR,
    path: relativePath,
    local: true,
    localPath: absolutePath,
    domain: metadata.domain,
    custom: metadata.custom,
    slug: metadata.slug,
    displayName: metadata.displayName,
  };

  verbose(`Extracted local skill: ${skillId}`);
  return extracted;
}
