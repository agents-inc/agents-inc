import path from "path";
import { directoryExists, listDirectories, fileExists, readFile } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { LOCAL_PSEUDO_CATEGORY, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts";
import { parseFrontmatter, readSkillMetadata } from "../loading";
import type { CategoryPath, Domain, ExtractedSkillMetadata, SkillSlug } from "../../types";
import { LOCAL_DEFAULTS, METADATA_KEYS } from "../metadata-keys";

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

  // One file that describes no skill must skip its own skill, not abort discovery
  // for every command that loads the catalog. `compile` refuses the same judgment's
  // verdict outright, which is what keeps the two passes from disagreeing.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    warn(
      `Skipping local skill '${skillDirName}': ${STANDARD_FILES.METADATA_YAML} at ${metadataPath} does not describe it — ${read.reason}`,
    );
    return null;
  }

  const metadata = read.metadata;

  // `local` is a trapdoor, not a category: it belongs to no domain, so a skill wearing it
  // renders in no tab and is dropped from every sub-agent's stack. Refusing it here is
  // what keeps that from happening silently — the skill is unusable either way, and this
  // way the user is told which field to fix.
  if (metadata.category === LOCAL_PSEUDO_CATEGORY) {
    warn(
      `Skipping local skill '${skillDirName}': ${METADATA_KEYS.CATEGORY} '${LOCAL_PSEUDO_CATEGORY}' is a placeholder, not a real category, so no sub-agent can be given this skill. Set ${METADATA_KEYS.CATEGORY} in ${metadataPath} to a real one.`,
    );
    return null;
  }

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
    ...(metadata.usageGuidance !== undefined && { usageGuidance: metadata.usageGuidance }),
    category: metadata.category,
    author: LOCAL_DEFAULTS.AUTHOR,
    path: relativePath,
    local: true,
    localPath: absolutePath,
    domain: metadata.domain,
    ...(metadata.custom !== undefined && { custom: metadata.custom }),
    slug: metadata.slug,
    displayName: metadata.displayName,
  };

  verbose(`Extracted local skill: ${skillId}`);
  return extracted;
}
