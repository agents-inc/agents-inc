import { Flags } from "@oclif/core";
import path from "path";
import { sortBy } from "remeda";
import { z } from "zod";

import { BaseCommand } from "../../base-command";
import { setVerbose, warn } from "../../utils/logger";
import {
  marketplaceHasNoVersion,
  marketplaceNameNotPublishable,
  marketplaceOwnerHasNoName,
} from "../../utils/messages";
import { readFile, writeFile } from "../../utils/fs";
import { getErrorMessage } from "../../utils/errors";
import { EXIT_CODES } from "../../lib/exit-codes";
import { loadMarketplaceMatrix } from "../../lib/loading";
import {
  generateMarketplace,
  writeMarketplace,
  getMarketplaceStats,
  validateMarketplaceName,
  validateSkillIdNamespace,
} from "../../lib/marketplace-generator";
import {
  CATALOG_JSON,
  CLI_INVOKE_COMMAND,
  GENERATED_AT_BUILD,
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
  PLUGINS_DIST_PATH,
  STANDARD_FILES,
} from "../../consts";
import type { Marketplace } from "../../types/plugins";
import { validateKebabCaseName } from "../../lib/validate-kebab-name.js";

const DEFAULT_OUTPUT_FILE = `${PLUGIN_MANIFEST_DIR}/${MARKETPLACE_JSON}`;

const AUTHOR_STRING_PATTERN = /^(.*?)\s*<([^>]+)>\s*(?:\(([^)]+)\))?\s*$/;

/** The entity {@link validateKebabCaseName} names in this command's refusals. */
const MARKETPLACE_NOUN = "Marketplace";

const packageAuthorObjectSchema = z.object({
  name: z.string(),
  email: z.string().exactOptional(),
  url: z.string().exactOptional(),
});

const packageJsonSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    author: z.union([z.string(), packageAuthorObjectSchema]).exactOptional(),
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
      await this.writeCatalog(projectRoot, outputPath);
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
    const packageJsonPath = path.join(projectRoot, STANDARD_FILES.PACKAGE_JSON);

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

    if (version.trim() === "") {
      this.error(marketplaceHasNoVersion(packageJsonPath), { exit: EXIT_CODES.ERROR });
    }

    const owner = parseAuthor(author);
    if (owner.name.trim() === "") {
      this.error(marketplaceOwnerHasNoName(packageJsonPath), { exit: EXIT_CODES.ERROR });
    }

    const resolvedName = this.resolvePublishableName(name, nameOverride, packageJsonPath);

    const reservedError = validateMarketplaceName(resolvedName, name);
    if (reservedError) {
      this.error(reservedError, { exit: EXIT_CODES.ERROR });
    }

    return {
      name: resolvedName,
      version,
      description,
      ownerName: owner.name,
      ...(owner.email !== undefined && { ownerEmail: owner.email }),
    };
  }

  /**
   * The name this marketplace publishes under, refused before anything is written when
   * it is not one `claude plugin marketplace add` will accept.
   *
   * Both halves are judged by the same rule and refused with different sentences: a
   * `--name` the author typed is an argument they can retype, while a name derived from
   * package.json is a fact about their package — an npm scoped name is legitimate there
   * and illegitimate here — so its way out is the flag rather than a package rename.
   */
  private resolvePublishableName(
    packageName: string,
    nameOverride: string | undefined,
    packageJsonPath: string,
  ): string {
    if (nameOverride !== undefined) {
      const invalidOverride = validateKebabCaseName(nameOverride, MARKETPLACE_NOUN);
      if (invalidOverride) {
        this.error(`Invalid --name '${nameOverride}': ${invalidOverride}`, {
          exit: EXIT_CODES.INVALID_ARGS,
        });
      }
      return nameOverride;
    }

    if (validateKebabCaseName(packageName, MARKETPLACE_NOUN)) {
      this.error(marketplaceNameNotPublishable(packageName, packageJsonPath), {
        exit: EXIT_CODES.ERROR,
      });
    }
    return packageName;
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
      ...(identity.ownerEmail !== undefined && { ownerEmail: identity.ownerEmail }),
      pluginRoot: `./${pluginsDirFlag}`,
    });

    const stats = getMarketplaceStats(marketplace);
    this.log(`Found ${stats.total} plugins`);

    if (marketplace.plugins.length === 0) {
      this.error(noPluginsToPublish(pluginsDir, pluginsDirFlag), { exit: EXIT_CODES.ERROR });
    }

    const namespaceError = validateSkillIdNamespace(marketplace);
    if (namespaceError) {
      this.error(namespaceError, { exit: EXIT_CODES.ERROR });
    }

    this.log("Writing marketplace.json...");
    await writeMarketplace(outputPath, marketplace);
    this.log(`Wrote ${outputPath}`);

    return marketplace;
  }

  /**
   * Writes the marketplace's catalogue beside its manifest.
   *
   * Unconditional, and there is no flag to make it otherwise: a consumer
   * fetching a marketplace cannot tell an author who omitted a flag from a
   * marketplace that is broken, so an absent catalogue has to mean the second.
   *
   * `generatedAt` is stamped rather than carried: see {@link GENERATED_AT_BUILD}
   * for why a published artefact records a build and not a moment.
   */
  private async writeCatalog(projectRoot: string, outputPath: string): Promise<void> {
    const catalogPath = path.join(path.dirname(outputPath), CATALOG_JSON);

    this.log(`Writing ${CATALOG_JSON}...`);
    const matrix = await loadMarketplaceMatrix(projectRoot);
    const catalog = { ...matrix, generatedAt: GENERATED_AT_BUILD };
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    this.log(`Wrote ${catalogPath}`);
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
 * Refuses a manifest with no plugins in it, which the reader in this same package will not accept:
 * `marketplaceSchema.plugins` is `z.array(...).min(1)`, so `fetchMarketplace` throws
 * `plugins: Too small` on a file this command wrote and called a success. Every field that schema
 * constrains is a condition this command refuses before writing — `name`, `version` and
 * `owner.name` are the other three, all guarded off package.json. `version` was the one this
 * sentence claimed and did not have: `packageJsonSchema` types it as a bare string and the
 * generator defaults it with `??`, so `""` reached the manifest untouched. This one is only
 * knowable after the scan, which is why it sits here rather than beside them.
 *
 * The two ways in are running before `build plugins` and pointing `--plugins-dir` somewhere else, so
 * the sentence names the directory it scanned and both ways out. Written here rather than in
 * `utils/messages.ts` for the reason the `Missing package.json` refusal above it is: it has one
 * caller and composes nothing another surface has to agree with.
 */
function noPluginsToPublish(pluginsDir: string, pluginsDirFlag: string): string {
  return (
    `No plugins found in ${pluginsDir}. A marketplace with no plugins is refused when it is read ` +
    `back, so none was written. Run '${CLI_INVOKE_COMMAND} build plugins' first, or point ` +
    `--plugins-dir at the directory holding them (it is '${pluginsDirFlag}' for this run).`
  );
}

/**
 * Parses a package.json `author` field into name + optional email.
 *
 * npm supports both shorthand strings `"Name <email> (url)"` and object form
 * `{ name, email, url }`. An absent author and one that yields no name both come back
 * with an empty `name`, and the caller refuses on that — one condition, one sentence,
 * written where the refusal is. A missing EMAIL is warned about and carried on from,
 * because `owner.email` is the half the manifest schema leaves optional.
 */
function parseAuthor(author: string | { name: string; email?: string } | undefined): ParsedAuthor {
  if (!author) return { name: "" };

  if (typeof author === "object") {
    return { name: author.name, ...(author.email !== undefined && { email: author.email }) };
  }

  const [, matchedName, matchedEmail] = author.match(AUTHOR_STRING_PATTERN) ?? [];
  if (matchedName !== undefined && matchedEmail !== undefined) {
    return { name: matchedName.trim(), email: matchedEmail.trim() };
  }

  warn(
    `package.json 'author' field "${author}" has no parseable email — marketplace owner.email will be empty`,
  );
  return { name: author.trim() };
}
