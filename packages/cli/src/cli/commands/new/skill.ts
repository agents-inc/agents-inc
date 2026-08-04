import { Args, Flags } from "@oclif/core";
import path from "path";
import { BaseCommand } from "../../base-command.js";
import { resolveAuthor } from "../../lib/configuration/index.js";
import { loadConfig } from "../../lib/configuration/config-loader.js";
import { skillCategoriesFileSchema } from "../../lib/schemas.js";
import { loadConfigTypesDataInBackground } from "../../lib/configuration/config-types-writer.js";
import { writeScaffoldedEntityTypes } from "../../lib/config-gate/index.js";
import { fileExists, writeFile, ensureDir } from "../../utils/fs.js";
import { getErrorMessage } from "../../utils/errors.js";
import { verbose } from "../../utils/logger.js";
import { computeSkillFolderHash } from "../../lib/versioning.js";
import { validateKebabCaseName } from "../../lib/validate-kebab-name.js";
import {
  CLI_INVOKE_COMMAND,
  LOCAL_SKILLS_PATH,
  marketplaceManifestPath,
  SCHEMA_PATHS,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STANDARD_FILES,
} from "../../consts.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { FEATURE_FLAGS, featureDisabledError } from "../../lib/feature-flags.js";
import { yamlSchemaComment } from "../../utils/yaml-schema.js";
import { detectInstallation } from "../../lib/installation/index.js";
import { LOCAL_DEFAULTS } from "../../lib/metadata-keys.js";
import type { CategoryDefinition, CategoryPath } from "../../types/index.js";
import {
  generateSkillCategoriesTs,
  generateSkillRulesTs,
  buildCategoryEntry,
  formatTsExport,
} from "../../lib/skills/generators.js";
import { toTitleCase } from "../../utils/string.js";

export default class NewSkill extends BaseCommand {
  static summary = "Create a new local skill with proper structure";
  static description = "Create a new local skill scaffold with SKILL.md and metadata.yaml files";

  static examples = [
    {
      description: "Scaffold a skill in the local marketplace",
      command: "<%= config.bin %> <%= command.id %> my-skill",
    },
    {
      description: "Scaffold with explicit category and domain",
      command: "<%= config.bin %> <%= command.id %> my-skill --category web/forms --domain web",
    },
    {
      description: "Overwrite an existing skill",
      command: "<%= config.bin %> <%= command.id %> my-skill --force",
    },
  ];

  static args = {
    name: Args.string({
      description: "Name of the skill to create (kebab-case)",
      required: true,
    }),
  };

  // Override parent baseFlags to drop --source (new skill auto-detects marketplace context)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {
    author: Flags.string({
      char: "a",
      description: "Author identifier (e.g., @myhandle)",
      required: false,
    }),
    category: Flags.string({
      char: "c",
      description: "Skill category",
      default: LOCAL_DEFAULTS.CATEGORY,
    }),
    domain: Flags.string({
      char: "d",
      description: "Domain for the skill (e.g., web, api, cli)",
      required: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing skill",
      default: false,
    }),
  };

  async run(): Promise<void> {
    if (!FEATURE_FLAGS.NEW_SKILL_COMMAND) {
      this.error(featureDisabledError("new skill"), {
        exit: EXIT_CODES.ERROR,
      });
    }

    const { args, flags } = await this.parse(NewSkill);
    const projectDir = process.cwd();

    await this.ensureInstallation(projectDir);
    const configTypesReady = loadConfigTypesDataInBackground(undefined, projectDir);

    this.printHeader();
    this.validateName(args.name);

    const author = await resolveAuthorOrDefault(flags.author, projectDir);
    // Boundary cast: CLI flag accepts custom category values not in the generated union
    const category = flags.category as CategoryPath;
    const domain = flags.domain ?? LOCAL_DEFAULTS.DOMAIN;
    const skillsBasePath = await this.resolveSkillsBasePath(projectDir);
    const skillDir = path.join(skillsBasePath, args.name);

    await this.checkExistingDir(skillDir, flags.force);
    this.logSkillInfo(args.name, author, category, skillDir);
    await this.createSkillFiles(
      args.name,
      author,
      category,
      domain,
      skillDir,
      projectDir,
      configTypesReady,
    );
  }

  private async ensureInstallation(projectDir: string): Promise<void> {
    const installation = await detectInstallation(projectDir);
    if (!installation) {
      this.error(`No installation found. Run '${CLI_INVOKE_COMMAND} init' first.`, {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private printHeader(): void {
    this.log("");
    this.log("Create New Skill");
    this.log("");
  }

  private validateName(name: string): void {
    const validationError = validateKebabCaseName(name, "Skill");
    if (validationError) {
      this.error(validationError, { exit: EXIT_CODES.INVALID_ARGS });
    }
  }

  private async resolveSkillsBasePath(projectDir: string): Promise<string> {
    const marketplacePath = marketplaceManifestPath(projectDir);
    if (await fileExists(marketplacePath)) {
      this.log(`Detected marketplace context, creating skill in ${SKILLS_DIR_PATH}/`);
      return path.join(projectDir, SKILLS_DIR_PATH);
    }
    return path.join(projectDir, LOCAL_SKILLS_PATH);
  }

  private async checkExistingDir(skillDir: string, force: boolean): Promise<void> {
    await this.ensureDirOverwritable(skillDir, force, {
      exists: `Skill directory already exists: ${skillDir}`,
      overwriting: `Overwriting existing skill at ${skillDir}`,
    });
  }

  private logSkillInfo(
    name: string,
    author: string,
    category: CategoryPath,
    skillDir: string,
  ): void {
    this.log(`Skill name: ${name}`);
    this.log(`Author: ${author}`);
    this.log(`Category: ${category}`);
    this.log(`Directory: ${skillDir}`);
    this.log("");
  }

  private async createSkillFiles(
    name: string,
    author: string,
    category: CategoryPath,
    domain: string,
    skillDir: string,
    projectDir: string,
    configTypesReady: ReturnType<typeof loadConfigTypesDataInBackground>,
  ): Promise<void> {
    this.log("Creating skill files...");

    try {
      const result = await scaffoldSkillFiles({
        name,
        author,
        category,
        domain,
        skillDir,
      });

      this.log("");
      this.logSuccess(`Created ${STANDARD_FILES.SKILL_MD} at ${result.skillMdPath}`);
      this.logSuccess(`Created ${STANDARD_FILES.METADATA_YAML} at ${result.metadataPath}`);

      const marketplacePath = marketplaceManifestPath(projectDir);
      if (await fileExists(marketplacePath)) {
        try {
          await updateSkillRegistryConfig({ projectRoot: projectDir, category, domain });
        } catch (error) {
          this.warn(`Could not update config files: ${getErrorMessage(error)}`);
        }
      }

      try {
        await writeScaffoldedEntityTypes(projectDir, configTypesReady, {
          extraSkillIds: [name],
          extraDomains: [domain],
          extraCategories: [category],
        });
      } catch (error) {
        this.warn(`Could not update ${STANDARD_FILES.CONFIG_TYPES_TS}: ${getErrorMessage(error)}`);
      }

      this.log("");
      this.log(
        `Skill created successfully! Run '${CLI_INVOKE_COMMAND} compile' to include it in your agents.`,
      );
      this.log("");
    } catch (error) {
      this.handleError(error);
    }
  }
}

type ScaffoldSkillOptions = {
  name: string;
  author: string;
  category: CategoryPath;
  domain: string;
  skillDir: string;
};

type ScaffoldSkillResult = {
  skillMdPath: string;
  metadataPath: string;
  contentHash: string;
};

type RegistryUpdateOptions = {
  projectRoot: string;
  category: CategoryPath;
  domain: string;
};

export async function resolveAuthorOrDefault(
  authorFlag: string | undefined,
  projectDir: string,
): Promise<string> {
  if (authorFlag) return authorFlag;
  return (await resolveAuthor(projectDir)) || LOCAL_DEFAULTS.AUTHOR;
}

export function generateSkillMd(name: string): string {
  const titleName = toTitleCase(name);

  return `---
name: ${name}
description: Brief description of this skill
---

# ${titleName}

> **Quick Guide:** Add a brief summary of what this skill teaches.

---

<critical_requirements>

## CRITICAL: Before Using This Skill

**(Add critical requirements here)**

</critical_requirements>

---

**When to use:**

- Add use cases here

**Key patterns covered:**

- Add patterns here

---

<patterns>

## Core Patterns

### Pattern 1: Example Pattern

Add your patterns here.

</patterns>

---

<critical_reminders>

## CRITICAL REMINDERS

**(Repeat critical requirements here)**

</critical_reminders>
`;
}

export function generateMetadataYaml(
  name: string,
  author: string,
  category: CategoryPath,
  contentHash: string,
  domain: string,
): string {
  const titleName = toTitleCase(name);

  return `${yamlSchemaComment(SCHEMA_PATHS.customMetadata)}
custom: true
domain: ${domain}
category: ${category}
author: "${author}"
displayName: ${titleName}
slug: ${name}
cliDescription: Brief description
usageGuidance: Use when <guidance>.
contentHash: ${contentHash}
`;
}

export async function scaffoldSkillFiles(
  options: ScaffoldSkillOptions,
): Promise<ScaffoldSkillResult> {
  const { name, author, category, domain, skillDir } = options;

  const skillMdContent = generateSkillMd(name);
  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);

  await writeFile(skillMdPath, skillMdContent);

  const contentHash = await computeSkillFolderHash(skillDir);
  const metadataContent = generateMetadataYaml(name, author, category, contentHash, domain);
  await writeFile(metadataPath, metadataContent);

  return { skillMdPath, metadataPath, contentHash };
}

async function updateSkillRegistryConfig(options: RegistryUpdateOptions): Promise<void> {
  const { projectRoot, category, domain } = options;

  const categoriesPath = path.join(projectRoot, SKILL_CATEGORIES_PATH);
  const rulesPath = path.join(projectRoot, SKILL_RULES_PATH);

  if (await fileExists(categoriesPath)) {
    const parsed = await loadConfig(categoriesPath, skillCategoriesFileSchema);
    if (!parsed) {
      throw new Error(
        `Config at ${categoriesPath} has no default export — delete the file or add \`export default { version, categories: {} }\``,
      );
    }
    // Boundary cast: CategoryMap keys are strict Category; CLI flag may introduce custom category IDs
    const categories = parsed.categories as Record<string, CategoryDefinition>;
    if (!categories[category]) {
      const updated = {
        ...parsed,
        categories: { ...categories, [category]: buildCategoryEntry(category, domain) },
      };
      await writeFile(categoriesPath, formatTsExport(CATEGORIES_TS_COMMENT, updated));
      verbose(`Added category '${category}' to ${SKILL_CATEGORIES_PATH}`);
    }
  } else {
    await ensureDir(path.dirname(categoriesPath));
    await writeFile(categoriesPath, generateSkillCategoriesTs(category, domain));
    verbose(`Created ${SKILL_CATEGORIES_PATH}`);
  }

  if (!(await fileExists(rulesPath))) {
    await ensureDir(path.dirname(rulesPath));
    await writeFile(rulesPath, generateSkillRulesTs());
    verbose(`Created ${SKILL_RULES_PATH}`);
  }
}

const CATEGORIES_TS_COMMENT = "// Skill category definitions";
