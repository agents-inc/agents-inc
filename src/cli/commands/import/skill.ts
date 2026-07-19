import { Args, Flags } from "@oclif/core";
import path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { BaseCommand } from "../../base-command.js";
import { getErrorMessage } from "../../utils/errors.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { fetchFromSource } from "../../lib/loading/index.js";
import { importedSkillMetadataSchema } from "../../lib/schemas.js";
import { writeMetadataYaml } from "../../lib/skills/skill-metadata.js";
import { toTitleCase } from "../../lib/skills/generators.js";
import { getCurrentDate, computeFileHash } from "../../lib/versioning.js";
import {
  copy,
  directoryExists,
  fileExists,
  listDirectories,
  readFile,
  writeFile,
  ensureDir,
} from "../../utils/fs.js";
import { warn } from "../../utils/logger.js";
import {
  DEFAULT_SKILLS_SUBDIR,
  GITHUB_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
  YAML_FORMATTING,
  stripYamlSchemaComment,
} from "../../consts.js";
import { IMPORT_DEFAULTS } from "../../lib/metadata-keys.js";
import { STATUS_MESSAGES, INFO_MESSAGES } from "../../utils/messages.js";

export default class ImportSkill extends BaseCommand {
  static summary = "Import a skill from a third-party GitHub repository";
  static description =
    "Download and import skills from external GitHub repositories into your local " +
    ".claude/skills/ directory. Supports importing specific skills or listing available skills.";

  static examples = [
    {
      description: "List available skills from a repository",
      command: "<%= config.bin %> import skill github:vercel-labs/agent-skills --list",
    },
    {
      description: "Import a specific skill",
      command:
        "<%= config.bin %> import skill github:vercel-labs/agent-skills --skill react-best-practices",
    },
    {
      description: "Import all skills from a repository",
      command: "<%= config.bin %> import skill github:vercel-labs/agent-skills --all",
    },
  ];

  static args = {
    source: Args.string({
      description:
        "GitHub repository source (github:owner/repo, https://github.com/owner/repo, or owner/repo)",
      required: true,
    }),
  };

  // Override parent baseFlags to drop --source (positional source arg IS the source)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {
    skill: Flags.string({
      char: "n",
      description: "Name of the specific skill to import",
      required: false,
    }),
    all: Flags.boolean({
      char: "a",
      description: "Import all skills from the repository",
      default: false,
    }),
    list: Flags.boolean({
      char: "l",
      description: "List available skills without importing",
      default: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing skills",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ImportSkill);
    const projectDir = process.cwd();

    this.printHeader();
    this.validateFlags(flags);

    const { gigetSource, displaySource } = parseGitHubSource(args.source);
    this.log(`Source: ${displaySource}`);

    const repoPath = await this.fetchRepository(gigetSource, args.source);
    const skillsDir = this.resolveSkillsDir(repoPath);
    const availableSkills = await this.discoverAndValidate(skillsDir);

    if (flags.list) {
      this.listAvailableSkills(availableSkills);
      return;
    }

    const skillsToImport = this.resolveSkillsToImport(flags, availableSkills);
    await this.importSkills(skillsToImport, skillsDir, projectDir, displaySource, flags.force);
  }

  private printHeader(): void {
    this.log("");
    this.log("Import Third-Party Skill");
    this.log("");
  }

  private validateFlags(flags: { list: boolean; skill?: string; all: boolean }): void {
    if (!flags.list && !flags.skill && !flags.all) {
      this.error("Please specify --skill <name>, --all, or --list to list available skills", {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }

    if (flags.skill && flags.all) {
      this.error("Cannot use --skill and --all together", {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }
  }

  private async fetchRepository(gigetSource: string, sourceArg: string): Promise<string> {
    this.log(STATUS_MESSAGES.FETCHING_REPOSITORY);

    try {
      const result = await fetchSkillSource({ gigetSource });
      this.log(result.fromCache ? "Using cached source" : "Downloaded fresh copy");
      return result.path;
    } catch (error) {
      this.error(`Failed to fetch ${sourceArg}: ${getErrorMessage(error)}`, {
        exit: EXIT_CODES.NETWORK_ERROR,
      });
    }
  }

  private resolveSkillsDir(repoPath: string): string {
    return path.resolve(path.join(repoPath, DEFAULT_SKILLS_SUBDIR));
  }

  private async discoverAndValidate(skillsDir: string): Promise<string[]> {
    if (!(await directoryExists(skillsDir))) {
      this.error(
        `Skills directory not found: ${DEFAULT_SKILLS_SUBDIR}\n` +
          `The repository doesn't have a '${DEFAULT_SKILLS_SUBDIR}' directory.`,
        { exit: EXIT_CODES.INVALID_ARGS },
      );
    }

    const availableSkills = await discoverValidSkills(skillsDir);

    if (availableSkills.length === 0) {
      this.error(
        `No valid skills found in ${DEFAULT_SKILLS_SUBDIR}/\nSkills must have a SKILL.md file.`,
        { exit: EXIT_CODES.ERROR },
      );
    }

    return availableSkills;
  }

  private listAvailableSkills(skills: string[]): void {
    this.log("");
    this.log(`Available skills (${skills.length}):`);
    this.log("");
    for (const skill of skills) {
      this.log(`  - ${skill}`);
    }
    this.log("");
    this.log("Use --skill <name> to import a specific skill, or --all to import all.");
  }

  private resolveSkillsToImport(
    flags: { all: boolean; skill?: string },
    availableSkills: string[],
  ): string[] {
    if (flags.all) {
      return availableSkills;
    }

    if (flags.skill) {
      if (!availableSkills.includes(flags.skill)) {
        this.error(
          `Skill '${flags.skill}' not found in repository.\n` +
            `Available skills: ${availableSkills.join(", ")}\n` +
            `Use --list to see all available skills.`,
          { exit: EXIT_CODES.INVALID_ARGS },
        );
      }
      return [flags.skill];
    }

    return [];
  }

  private async importSkills(
    skillsToImport: string[],
    skillsDir: string,
    projectDir: string,
    displaySource: string,
    force: boolean,
  ): Promise<void> {
    const destDir = path.join(projectDir, LOCAL_SKILLS_PATH);

    this.log("");
    this.log(`Importing ${skillsToImport.length} skill(s)...`);

    let imported = 0;
    let skipped = 0;

    for (const skillName of skillsToImport) {
      const sourcePath = path.join(skillsDir, skillName);
      const destPath = path.join(destDir, skillName);

      if (await directoryExists(destPath)) {
        if (!force) {
          this.warn(`Skipping '${skillName}': already exists. Use --force to overwrite.`);
          skipped++;
          continue;
        }
      }

      try {
        await importSkillFromSource({ sourcePath, destPath, skillName, displaySource });
        this.logSuccess(`Imported: ${skillName}`);
        imported++;
      } catch (error) {
        this.warn(`Failed to import '${skillName}': ${getErrorMessage(error)}`);
        skipped++;
      }
    }

    this.log("");
    this.logSuccess(`Import complete: ${imported} imported, ${skipped} skipped`);
    this.log(`Skills location: ${destDir}`);
    this.log("");
    this.log(INFO_MESSAGES.RUN_COMPILE);
    this.log("");
  }
}

type ImportedForkedFromMetadata = {
  source: string;
  skillName: string;
  contentHash: string;
  date: string;
};

type SkillMetadata = {
  forkedFrom?: ImportedForkedFromMetadata;
  [key: string]: unknown;
};

type ParsedGitHubSource = {
  gigetSource: string;
  displaySource: string;
};

type FetchSourceOptions = {
  gigetSource: string;
};

type FetchedSource = {
  path: string;
  fromCache: boolean;
};

type ImportSkillOptions = {
  sourcePath: string;
  destPath: string;
  skillName: string;
  displaySource: string;
};

/**
 * Parses various GitHub URL formats into a normalized giget source string
 * and a human-readable display URL.
 *
 * Supports: `https://github.com/owner/repo`, `github:owner/repo`,
 * `gh:owner/repo`, and bare `owner/repo` formats.
 */
function parseGitHubSource(source: string): ParsedGitHubSource {
  if (source.startsWith(GITHUB_SOURCE.HTTPS_PREFIX)) {
    const path = source.replace(GITHUB_SOURCE.HTTPS_PREFIX, "");
    return {
      gigetSource: `${GITHUB_SOURCE.GITHUB_PREFIX}${path}`,
      displaySource: source,
    };
  }

  if (
    source.startsWith(GITHUB_SOURCE.GITHUB_PREFIX) ||
    source.startsWith(GITHUB_SOURCE.GH_PREFIX)
  ) {
    const normalized = source.startsWith(GITHUB_SOURCE.GH_PREFIX)
      ? GITHUB_SOURCE.GITHUB_PREFIX + source.slice(GITHUB_SOURCE.GH_PREFIX.length)
      : source;
    return {
      gigetSource: normalized,
      displaySource: `${GITHUB_SOURCE.HTTPS_PREFIX}${normalized.replace(GITHUB_SOURCE.GITHUB_PREFIX, "")}`,
    };
  }

  if (source.includes("/") && !source.includes(":")) {
    return {
      gigetSource: `${GITHUB_SOURCE.GITHUB_PREFIX}${source}`,
      displaySource: `${GITHUB_SOURCE.HTTPS_PREFIX}${source}`,
    };
  }

  return {
    gigetSource: source,
    displaySource: source,
  };
}

/**
 * Fetches a source repository using giget. Wraps `fetchFromSource` from the
 * loading layer.
 */
async function fetchSkillSource(options: FetchSourceOptions): Promise<FetchedSource> {
  const result = await fetchFromSource(options.gigetSource);
  return { path: result.path, fromCache: result.fromCache };
}

/**
 * Discovers valid skill directories within a source path by checking
 * for the presence of SKILL.md files.
 *
 * @returns Sorted list of directory names that contain a SKILL.md file.
 */
async function discoverValidSkills(skillsDir: string): Promise<string[]> {
  const skillDirs = await listDirectories(skillsDir);
  const checks = await Promise.all(
    skillDirs.map(async (skillDir) => ({
      skillDir,
      hasSkillMd: await fileExists(path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD)),
    })),
  );
  return checks
    .filter((c) => c.hasSkillMd)
    .map((c) => c.skillDir)
    .sort();
}

/**
 * Imports a single skill from a source directory into the destination.
 *
 * Validates that the source skill has a SKILL.md file, copies the directory,
 * and injects `forkedFrom` metadata into the destination's metadata.yaml.
 *
 * @throws {Error} If the source skill is missing a SKILL.md file.
 */
async function importSkillFromSource(options: ImportSkillOptions): Promise<void> {
  const { sourcePath, destPath, skillName, displaySource } = options;
  const skillMdPath = path.join(sourcePath, STANDARD_FILES.SKILL_MD);

  if (!(await fileExists(skillMdPath))) {
    throw new Error(
      `Missing required SKILL.md file at ${skillMdPath}\n` +
        `Every skill must have a SKILL.md file containing the skill's prompt content.\n` +
        `Create one with:\n` +
        `  echo "# ${skillName}" > ${path.join(sourcePath, STANDARD_FILES.SKILL_MD)}`,
    );
  }

  const contentHash = await computeFileHash(skillMdPath);

  await ensureDir(path.dirname(destPath));
  await copy(sourcePath, destPath);

  await injectImportedForkedFromMetadata(destPath, skillName, displaySource, contentHash);
}

/**
 * Injects `forkedFrom` metadata into a third-party imported skill's metadata.yaml.
 *
 * Handles three cases:
 * 1. Existing metadata.yaml -- preserves fields, adds/overwrites forkedFrom
 * 2. Existing metadata.json -- converts to YAML, adds forkedFrom
 * 3. No metadata file -- creates minimal metadata.yaml with forkedFrom
 *
 * Different from `injectForkedFromMetadata` in `skill-metadata.ts` which tracks
 * internal marketplace fork lineage using `skillId`. This function tracks
 * third-party imports using `source` + `skillName`.
 */
async function injectImportedForkedFromMetadata(
  destPath: string,
  skillName: string,
  source: string,
  contentHash: string,
): Promise<void> {
  const forkedFrom: ImportedForkedFromMetadata = {
    source,
    skillName,
    contentHash,
    date: getCurrentDate(),
  };

  const yamlPath = path.join(destPath, STANDARD_FILES.METADATA_YAML);
  const jsonPath = path.join(destPath, STANDARD_FILES.METADATA_JSON);

  if (await fileExists(yamlPath)) {
    return mergeForkedFromIntoYaml(yamlPath, forkedFrom);
  }
  if (await fileExists(jsonPath)) {
    return convertJsonToYamlWithForkedFrom(jsonPath, yamlPath, forkedFrom);
  }
  return createMinimalMetadata(yamlPath, skillName, forkedFrom);
}

async function mergeForkedFromIntoYaml(
  yamlPath: string,
  forkedFrom: ImportedForkedFromMetadata,
): Promise<void> {
  const rawContent = await readFile(yamlPath);
  const { schemaComment, yamlContent } = stripYamlSchemaComment(rawContent);

  const raw = parseYaml(yamlContent);
  const parseResult = importedSkillMetadataSchema.safeParse(raw);
  if (!parseResult.success) {
    warn(
      `Malformed metadata.yaml at ${yamlPath} — existing fields may be lost\n` +
        `  Validation errors: ${parseResult.error.issues.map((i) => i.message).join(", ")}\n` +
        `  Expected fields: displayName (string), cliDescription (string), category (string)\n` +
        `  Validate your YAML syntax at https://yamllint.com`,
    );
  }
  const metadata: SkillMetadata = {
    ...(parseResult.success ? parseResult.data : {}),
    forkedFrom,
  };

  await writeMetadataYaml(yamlPath, metadata, schemaComment);
}

async function convertJsonToYamlWithForkedFrom(
  jsonPath: string,
  yamlPath: string,
  forkedFrom: ImportedForkedFromMetadata,
): Promise<void> {
  const rawContent = await readFile(jsonPath);
  let jsonParsed: unknown;
  try {
    jsonParsed = JSON.parse(rawContent);
  } catch {
    warn(
      `Malformed JSON in ${jsonPath} — skipping metadata injection\n` +
        `  Common issues: trailing commas, unquoted keys, single quotes instead of double quotes\n` +
        `  Validate your JSON at https://jsonlint.com`,
    );
    return;
  }
  const jsonResult = importedSkillMetadataSchema.safeParse(jsonParsed);
  const metadata: SkillMetadata = {
    ...(jsonResult.success ? jsonResult.data : {}),
    forkedFrom,
  };

  await writeMetadataYaml(yamlPath, metadata);
}

async function createMinimalMetadata(
  yamlPath: string,
  skillName: string,
  forkedFrom: ImportedForkedFromMetadata,
): Promise<void> {
  const minimalMetadata: SkillMetadata = {
    displayName: toTitleCase(skillName),
    cliDescription: "Imported from third-party repository",
    category: IMPORT_DEFAULTS.CATEGORY,
    author: IMPORT_DEFAULTS.AUTHOR,
    forkedFrom,
  };

  await writeMetadataYaml(yamlPath, minimalMetadata);
}
