import { Flags } from "@oclif/core";
import path from "path";
import { sortBy } from "remeda";
import { z } from "zod";

import { BaseCommand } from "../../base-command";
import { setVerbose, warn } from "../../utils/logger";
import { readFile } from "../../utils/fs";
import { getErrorMessage } from "../../utils/errors";
import { EXIT_CODES } from "../../lib/exit-codes";
import {
  generateMarketplace,
  writeMarketplace,
  getMarketplaceStats,
} from "../../lib/marketplace-generator";
import { MARKETPLACE_JSON, PLUGIN_MANIFEST_DIR, PLUGINS_DIST_PATH } from "../../consts";
import type { Marketplace } from "../../types/plugins";
import { validateKebabCaseName } from "../../lib/validate-kebab-name.js";

const DEFAULT_OUTPUT_FILE = `${PLUGIN_MANIFEST_DIR}/${MARKETPLACE_JSON}`;

const AUTHOR_STRING_PATTERN = /^(.*?)\s*<([^>]+)>\s*(?:\(([^)]+)\))?\s*$/;

const packageAuthorObjectSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
});

const packageJsonSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    author: z.union([z.string(), packageAuthorObjectSchema]).optional(),
  })
  .passthrough();

type PackageJson = z.infer<typeof packageJsonSchema>;
type MarketplaceIdentity = Pick<PackageJson, "name" | "version" | "description"> & {
  ownerName: string;
  ownerEmail?: string;
};

export default class BuildMarketplace extends BaseCommand {
  static summary = "Generate marketplace.json from built plugins (requires skills repo)";

  static description =
    "Generate marketplace.json from built plugins. This command scans the plugins directory and generates a marketplace manifest file. Reads marketplace identity (name, version, description, author) from package.json in the current working directory. Use --name to override the marketplace name when package.json uses an npm scoped name (e.g. @scope/pkg), which is not a valid marketplace name.";

  static examples = [
    {
      description: "Generate marketplace.json from the default plugins directory",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Generate marketplace.json from a custom plugins directory",
      command: "<%= config.bin %> <%= command.id %> --plugins-dir dist/stacks",
    },
    {
      description: "Write marketplace.json to a custom output path",
      command: "<%= config.bin %> <%= command.id %> --output .claude-plugin/market.json",
    },
    {
      description:
        "Override the marketplace name (use when package.json has an npm scoped name like @scope/pkg)",
      command: "<%= config.bin %> <%= command.id %> --name my-marketplace",
    },
  ];

  // Override parent baseFlags to drop --source (marketplace reads identity from package.json)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {
    name: Flags.string({
      description:
        "Override the marketplace name (defaults to package.json 'name'). Must be kebab-case.",
    }),
    "plugins-dir": Flags.string({
      char: "p",
      description: "Plugins directory",
      default: PLUGINS_DIST_PATH,
    }),
    output: Flags.string({
      char: "o",
      description: "Output file",
      default: DEFAULT_OUTPUT_FILE,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose logging",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BuildMarketplace);
    setVerbose(flags.verbose);

    const projectRoot = process.cwd();
    const pluginsDir = path.resolve(projectRoot, flags["plugins-dir"]);
    const outputPath = path.resolve(projectRoot, flags.output);
    const identity = await this.loadMarketplaceIdentity(projectRoot, flags.name);

    this.printHeader(pluginsDir, outputPath);

    try {
      const marketplace = await this.generateAndWrite(
        pluginsDir,
        outputPath,
        flags["plugins-dir"],
        identity,
      );
      this.printStats(marketplace);
      this.printSample(marketplace);

      this.log("");
      this.logSuccess(
        `Marketplace generated with ${getMarketplaceStats(marketplace).total} plugins!`,
      );
      this.log("");
    } catch (error) {
      this.log("Generation failed");
      this.handleError(error);
    }
  }

  private async loadMarketplaceIdentity(
    projectRoot: string,
    nameOverride?: string,
  ): Promise<MarketplaceIdentity> {
    const packageJsonPath = path.join(projectRoot, "package.json");

    let rawContent: string;
    try {
      rawContent = await readFile(packageJsonPath);
    } catch {
      this.error(
        `Missing package.json at ${projectRoot}. build marketplace reads marketplace identity from package.json.`,
        { exit: EXIT_CODES.ERROR },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (error) {
      this.error(`Failed to parse package.json at ${packageJsonPath}: ${getErrorMessage(error)}`, {
        exit: EXIT_CODES.ERROR,
      });
    }

    const parseResult = packageJsonSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      const missingFields = parseResult.error.issues.map((i) => i.path.join(".")).join(", ");
      this.error(
        `package.json at ${packageJsonPath} is missing required fields: ${missingFields}. build marketplace reads marketplace identity from package.json.`,
        { exit: EXIT_CODES.ERROR },
      );
    }

    const { name, version, description, author } = parseResult.data;
    const owner = parseAuthor(author);

    let resolvedName = name;
    if (nameOverride !== undefined) {
      const validationError = validateKebabCaseName(nameOverride, "Marketplace");
      if (validationError) {
        this.error(`Invalid --name '${nameOverride}': ${validationError}`, {
          exit: EXIT_CODES.INVALID_ARGS,
        });
      }
      resolvedName = nameOverride;
    }

    return {
      name: resolvedName,
      version,
      description,
      ownerName: owner.name,
      ownerEmail: owner.email,
    };
  }

  private printHeader(pluginsDir: string, outputPath: string): void {
    this.log("");
    this.log("Generating marketplace.json");
    this.log(`  Plugins directory: ${pluginsDir}`);
    this.log(`  Output file: ${outputPath}`);
    this.log("");
  }

  private async generateAndWrite(
    pluginsDir: string,
    outputPath: string,
    pluginsDirFlag: string,
    identity: MarketplaceIdentity,
  ): Promise<Marketplace> {
    this.log("Scanning plugins...");

    const marketplace = await generateMarketplace(pluginsDir, {
      name: identity.name,
      version: identity.version,
      description: identity.description,
      ownerName: identity.ownerName,
      ownerEmail: identity.ownerEmail,
      pluginRoot: `./${pluginsDirFlag}`,
    });

    const stats = getMarketplaceStats(marketplace);
    this.log(`Found ${stats.total} plugins`);

    this.log("Writing marketplace.json...");
    await writeMarketplace(outputPath, marketplace);
    this.log(`Wrote ${outputPath}`);

    return marketplace;
  }

  private printStats(marketplace: Marketplace): void {
    this.log("");
    this.log("Category breakdown:");
    const sortedCategories = sortBy(
      Object.entries(getMarketplaceStats(marketplace).byCategory),
      ([, count]) => -count,
    );
    for (const [category, count] of sortedCategories) {
      this.log(`  ${category}: ${count}`);
    }
  }

  private printSample(marketplace: Marketplace): void {
    this.log("");
    this.log("Sample plugins:");
    const sampleSize = 5;
    for (const plugin of marketplace.plugins.slice(0, sampleSize)) {
      const version = plugin.version ? `v${plugin.version}` : "";
      const category = plugin.category ? `[${plugin.category}]` : "";
      this.log(`  ${plugin.name} ${version} ${category}`);
      if (plugin.description) {
        this.log(`    ${plugin.description}`);
      }
    }
    if (marketplace.plugins.length > sampleSize) {
      this.log(`  ... and ${marketplace.plugins.length - sampleSize} more`);
    }
  }
}

type ParsedAuthor = {
  name: string;
  email?: string;
};

/**
 * Parses a package.json `author` field into name + optional email.
 *
 * npm supports both shorthand strings `"Name <email> (url)"` and object form
 * `{ name, email, url }`. We emit a warning when a string author has no
 * parseable email so the caller knows the marketplace owner.email will be absent.
 */
function parseAuthor(author: string | { name: string; email?: string } | undefined): ParsedAuthor {
  if (!author) {
    warn("package.json is missing 'author' field — marketplace owner.email will be empty");
    return { name: "" };
  }

  if (typeof author === "object") {
    return { name: author.name, email: author.email };
  }

  const match = author.match(AUTHOR_STRING_PATTERN);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (name === "") {
      warn(
        `package.json 'author' field "${author}" has no parseable name — marketplace owner.name will be empty`,
      );
    }
    return { name, email };
  }

  warn(
    `package.json 'author' field "${author}" has no parseable email — marketplace owner.email will be empty`,
  );
  return { name: author.trim() };
}
