import path from "path";
import { directoryExists, listDirectories, fileExists, readFile } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { plural } from "../../utils/string";
import { LOCAL_PSEUDO_CATEGORY, STANDARD_FILES } from "../../consts";
import { namesPlaceholderCategory, parseFrontmatter, readSkillMetadata } from "../loading";
import { isHomeDirectory } from "../installation/is-home-directory";
import { providerInUse, skillsDir, skillsPathPrefix } from "../installation/install-layout";
import type {
  CategoryPath,
  Domain,
  ExtractedSkillMetadata,
  SkillScope,
  SkillSlug,
} from "../../types";
import { LOCAL_DEFAULTS, METADATA_KEYS } from "../metadata-keys";

export type LocalRawMetadata = {
  displayName: string;
  slug: SkillSlug;
  cliDescription?: string;
  category: CategoryPath;
  usageGuidance?: string;
  tags?: string[];
  domain: Domain;
  custom?: boolean;
};

export type LocalSkillDiscoveryResult = {
  skills: ExtractedSkillMetadata[];
  localSkillsPath: string;
};

type CopiedInSkills = { dir: string; pathPrefix: string };

/** Where the provider installed at `root` copies skills in; home is the global installation. */
function copiedInSkillsAt(root: string): CopiedInSkills {
  const scope: SkillScope = isHomeDirectory(root) ? "global" : "project";
  const provider = providerInUse(root);

  return {
    dir: skillsDir(provider, scope, root),
    pathPrefix: skillsPathPrefix(provider, scope, root),
  };
}

export async function discoverLocalSkills(root: string): Promise<LocalSkillDiscoveryResult | null> {
  const { dir: localSkillsPath, pathPrefix } = copiedInSkillsAt(root);

  if (!(await directoryExists(localSkillsPath))) {
    verbose(`Local skills directory not found: ${localSkillsPath}`);
    return null;
  }

  const skillDirs = await listDirectories(localSkillsPath);
  const extracted = await Promise.all(
    skillDirs.map((skillDirName) => extractLocalSkill(localSkillsPath, pathPrefix, skillDirName)),
  );
  const skills = extracted.filter((skill) => skill !== null);

  verbose(`Discovered ${plural(skills.length, "local skill")} from ${localSkillsPath}`);

  return {
    skills,
    localSkillsPath,
  };
}

async function extractLocalSkill(
  localSkillsPath: string,
  pathPrefix: string,
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

  // One file that describes no skill skips its own skill, not the whole discovery.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    warn(
      `Skipping local skill '${skillDirName}': ${STANDARD_FILES.METADATA_YAML} at ${metadataPath} does not describe it — ${read.reason}`,
    );
    return null;
  }

  const metadata = read.metadata;

  // Warned here only: this pass reaches every command, so it is said once per run.
  if (namesPlaceholderCategory(metadata)) {
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

  const relativePath = `${pathPrefix}/${skillDirName}/`;
  const absolutePath = path.join(localSkillsPath, skillDirName) + path.sep;
  const skillId = frontmatter.name;

  const extracted: ExtractedSkillMetadata = {
    id: skillId,
    directoryPath: skillDirName,
    description: metadata.cliDescription || frontmatter.description,
    ...(frontmatter.description && { activationDescription: frontmatter.description }),
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
