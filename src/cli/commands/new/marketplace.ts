import { Args, Flags } from "@oclif/core";
import path from "path";
import { BaseCommand } from "../../base-command.js";
import { writeFile, directoryExists, ensureDir } from "../../utils/fs.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  KEBAB_CASE_PATTERN,
  PLUGIN_MANIFEST_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../../consts.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { FEATURE_FLAGS } from "../../lib/feature-flags.js";
import { LOCAL_DEFAULTS } from "../../lib/metadata-keys.js";
import { compileAllSkillPlugins } from "../../lib/skills/skill-plugin-compiler.js";
import {
  loadConfigTypesDataInBackground,
  regenerateConfigTypes,
} from "../../lib/configuration/config-types-writer.js";
import { generateConfigSource } from "../../lib/configuration/config-writer.js";
import { generateMarketplace, writeMarketplace } from "../../lib/marketplace-generator.js";
import { generateSkillCategoriesTs, generateSkillRulesTs } from "../../lib/skills/generators.js";
import type { Category, SkillId } from "../../types/index.js";
import { resolveAuthorOrDefault, scaffoldSkillFiles } from "./skill.js";

export function validateMarketplaceName(name: string): string | null {
  if (!name || name.trim() === "") {
    return "Marketplace name is required";
  }

  if (!KEBAB_CASE_PATTERN.test(name)) {
    return "Marketplace name must be kebab-case (lowercase letters, numbers, and hyphens, starting with a letter)";
  }

  return null;
}

export function generateStacksTs(name: string): string {
  const data = {
    stacks: [
      {
        id: "dummy-stack",
        name: "Dummy Stack",
        description: `Default stack for ${name}`,
        agents: {
          "web-developer": {
            "dummy-category": "dummy-skill",
          },
        },
        philosophy: "Ship fast, iterate faster",
      },
    ],
  };
  const body = JSON.stringify(data, null, 2);
  return `// Stack definitions for ${name}\nexport default ${body};\n`;
}

export function generateReadme(name: string): string {
  return `# ${name}

Private marketplace for custom skills and stacks.

## Directory Structure

\`\`\`
${STACKS_FILE_PATH}         # Stack definitions (agent groupings with skill mappings)
${SKILLS_DIR_PATH}/                # Custom skill definitions
\`\`\`

## Creating Skills

\`\`\`bash
${CLI_INVOKE_COMMAND} new skill <name> --category <category-name>
\`\`\`

Each skill lives in \`${SKILLS_DIR_PATH}/<skill-name>/\` with:
- \`${STANDARD_FILES.SKILL_MD}\` -- Skill content (what the skill teaches)
- \`${STANDARD_FILES.METADATA_YAML}\` -- Skill metadata (category, author, description, custom: true)

## Using This Marketplace

Point the CLI at this marketplace as a source:

\`\`\`bash
# Local development
${CLI_INVOKE_COMMAND} init --source /path/to/${name}

# From a git repository
${CLI_INVOKE_COMMAND} init --source github:your-org/${name}
\`\`\`

## How It Works

The CLI auto-discovers skills from the \`${SKILLS_DIR_PATH}/\` directory
and stacks from \`${STACKS_FILE_PATH}\`.
Custom categories are discovered from skill \`${STANDARD_FILES.METADATA_YAML}\` files with \`custom: true\`.
Custom skills appear alongside built-in ones in the wizard. No manual registration needed.
`;
}

export default class NewMarketplace extends BaseCommand {
  static summary = "Scaffold a new private marketplace project";
  static description =
    "Create a new private marketplace directory with the required structure " +
    "for custom skills and stacks.";

  static examples = [
    {
      description: "Create a new marketplace",
      command: "<%= config.bin %> <%= command.id %> acme-skills",
    },
    {
      description: "Initialize the current directory as a marketplace",
      command: "<%= config.bin %> <%= command.id %> .",
    },
    {
      description: "Overwrite an existing directory",
      command: "<%= config.bin %> <%= command.id %> acme-skills --force",
    },
  ];

  static args = {
    name: Args.string({
      description:
        'Name of the marketplace directory (kebab-case), or "." to use the current directory',
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing marketplace directory",
      default: false,
    }),
  };

  async run(): Promise<void> {
    if (!FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND) {
      this.error("The `new marketplace` command is currently disabled while being improved.", {
        exit: EXIT_CODES.ERROR,
      });
    }

    const { args, flags } = await this.parse(NewMarketplace);
    const parentDir = process.cwd();
    const useCurrentDir = args.name === ".";

    const marketplaceName = useCurrentDir ? path.basename(parentDir) : args.name;
    const marketplaceDir = useCurrentDir ? parentDir : path.join(parentDir, args.name);

    this.printHeader();
    this.validateName(marketplaceName, useCurrentDir);
    await this.checkExistingDir(marketplaceDir, useCurrentDir, flags.force);

    this.log(`Marketplace: ${marketplaceName}`);
    this.log(`Directory: ${marketplaceDir}`);
    this.log("");

    try {
      const author = await resolveAuthorOrDefault(undefined, parentDir);
      await this.createMarketplaceFiles(marketplaceName, marketplaceDir, author);
      await this.buildMarketplace(marketplaceDir, marketplaceName);
      this.printNextSteps(marketplaceName, useCurrentDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  private printHeader(): void {
    this.log("");
    this.log("Create New Marketplace");
    this.log("");
  }

  private validateName(name: string, useCurrentDir: boolean): void {
    const validationError = validateMarketplaceName(name);
    if (validationError) {
      if (useCurrentDir) {
        this.error(
          `Current directory name '${name}' is not valid kebab-case. Rename it or pass an explicit name.`,
          { exit: EXIT_CODES.INVALID_ARGS },
        );
      }
      this.error(validationError, { exit: EXIT_CODES.INVALID_ARGS });
    }
  }

  private async checkExistingDir(
    dir: string,
    useCurrentDir: boolean,
    force: boolean,
  ): Promise<void> {
    if (!useCurrentDir && (await directoryExists(dir))) {
      if (!force) {
        this.error(`Directory already exists: ${dir}\nUse --force to overwrite.`, {
          exit: EXIT_CODES.ERROR,
        });
      }
      this.warn(`Overwriting existing directory at ${dir}`);
    }
  }

  private async createMarketplaceFiles(
    marketplaceName: string,
    marketplaceDir: string,
    author: string,
  ): Promise<void> {
    const skillName = "dummy-skill";

    this.log("Creating marketplace structure...");

    const stacksContent = generateStacksTs(marketplaceName);
    const stacksPath = path.join(marketplaceDir, STACKS_FILE_PATH);
    await ensureDir(path.dirname(stacksPath));
    await writeFile(stacksPath, stacksContent);

    const categoriesContent = generateSkillCategoriesTs(
      LOCAL_DEFAULTS.CATEGORY,
      LOCAL_DEFAULTS.DOMAIN,
    );
    const categoriesPath = path.join(marketplaceDir, SKILL_CATEGORIES_PATH);
    await writeFile(categoriesPath, categoriesContent);

    const rulesContent = generateSkillRulesTs();
    const rulesPath = path.join(marketplaceDir, SKILL_RULES_PATH);
    await writeFile(rulesPath, rulesContent);

    const skillsDir = path.join(marketplaceDir, SKILLS_DIR_PATH);
    await scaffoldSkillFiles({
      name: skillName,
      author,
      category: LOCAL_DEFAULTS.CATEGORY,
      domain: LOCAL_DEFAULTS.DOMAIN,
      skillDir: path.join(skillsDir, skillName),
    });

    const readmeContent = generateReadme(marketplaceName);
    const readmePath = path.join(marketplaceDir, "README.md");
    await writeFile(readmePath, readmeContent);

    const configDir = path.join(marketplaceDir, CLAUDE_SRC_DIR);
    await ensureDir(configDir);
    // Boundary cast: custom marketplace dummy skill/category not in standard unions
    const configContent = generateConfigSource({
      name: marketplaceName,
      skills: [{ id: skillName as SkillId, scope: "project", source: "eject" }],
      agents: [],
      source: ".",
      marketplace: marketplaceName,
      stack: {
        "web-developer": {
          // Boundary cast: dummy-category is not in the generated Category union
          [LOCAL_DEFAULTS.CATEGORY as Category]: [{ id: skillName as SkillId }],
        },
      },
    });
    const marketplaceComment =
      "// Marketplaces house skills only — agents are defined by consumer projects.\n\n";
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      marketplaceComment + configContent,
    );

    this.log("");
    this.logSuccess(`Created ${STACKS_FILE_PATH}`);
    this.logSuccess(`Created ${SKILL_CATEGORIES_PATH}`);
    this.logSuccess(`Created ${SKILL_RULES_PATH}`);
    this.logSuccess("Created README.md");
    this.logSuccess("Created .claude-src/config.ts");
    this.log("");
  }

  private printNextSteps(marketplaceName: string, useCurrentDir: boolean): void {
    this.log("Marketplace created successfully!");
    this.log("");
    this.log("Next steps:");
    if (!useCurrentDir) {
      this.log(`  1. cd ${marketplaceName}`);
    }
    this.log(
      `  ${useCurrentDir ? "1" : "2"}. ${CLI_INVOKE_COMMAND} new skill <name> --category <category-name>`,
    );
    this.log(`  ${useCurrentDir ? "2" : "3"}. Push to a git repository`);
    this.log(
      `  ${useCurrentDir ? "3" : "4"}. ${CLI_INVOKE_COMMAND} init --source github:your-org/${marketplaceName}`,
    );
    this.log("");
  }

  private async buildMarketplace(marketplaceDir: string, marketplaceName: string): Promise<void> {
    const skillsDir = path.resolve(marketplaceDir, SKILLS_DIR_PATH);
    const pluginsOutputDir = path.resolve(marketplaceDir, "dist/plugins");
    const marketplaceOutputPath = path.resolve(
      marketplaceDir,
      PLUGIN_MANIFEST_DIR,
      "marketplace.json",
    );

    try {
      this.log("Building plugins...");
      const results = await compileAllSkillPlugins(skillsDir, pluginsOutputDir);
      this.logSuccess(`Built ${results.length} skill plugins.`);

      this.log("Generating marketplace.json...");
      const marketplace = await generateMarketplace(pluginsOutputDir, {
        name: marketplaceName,
        ownerName: marketplaceName,
        pluginRoot: "./dist/plugins",
      });
      await writeMarketplace(marketplaceOutputPath, marketplace);
      this.logSuccess(
        `Generated ${PLUGIN_MANIFEST_DIR}/marketplace.json with ${marketplace.plugins.length} plugins.`,
      );

      this.log("Generating config-types.ts...");
      const configTypesData = loadConfigTypesDataInBackground(marketplaceDir, marketplaceDir);
      await regenerateConfigTypes(marketplaceDir, configTypesData);
      this.logSuccess("Generated .claude-src/config-types.ts");
    } catch (error) {
      this.warn(`Build step failed: ${getErrorMessage(error)}`);
      this.warn(
        "The scaffold is still valid. Run 'build plugins' and 'build marketplace' manually.",
      );
    }
  }
}
