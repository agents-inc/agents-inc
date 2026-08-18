import { Args } from "@oclif/core";
import path from "path";

import { BaseCommand } from "../../base-command.js";
import { CLI_INVOKE_COMMAND, SKILLS_DIR_PATH } from "../../consts.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { validateMarketplaceName } from "../../lib/marketplace-generator.js";
import { exampleSkillId, writeMarketplaceScaffold } from "../../lib/marketplace-scaffold.js";
import { validateKebabCaseName } from "../../lib/validate-kebab-name.js";
import { isDirectoryEmpty } from "../../utils/fs.js";

/**
 * The refusal over a target directory that already holds something.
 *
 * A scaffold writes a whole marketplace, so writing into an occupied directory
 * would mean merging with — or overwriting — work this command did not author.
 * Both ways out are one step, which is why there is no `--force`: a flag that
 * overwrites an author's own files is the destructive half of a silent fallback.
 */
function occupiedDirectoryError(marketplaceDir: string): string {
  return (
    `${marketplaceDir} already holds files. A scaffold writes a whole marketplace, ` +
    `so it will not write into a directory that already has contents. Choose another ` +
    `name, or empty that directory first.`
  );
}

export default class NewMarketplace extends BaseCommand {
  static summary = "Scaffold a marketplace of your own";

  static description =
    "Create a directory holding everything the CLI needs to read a marketplace: a package.json " +
    "carrying its identity, the three config files, and one example skill already named in the " +
    "marketplace's own namespace. It scaffolds only — run 'build plugins' and 'build marketplace' " +
    "to publish what you have written.";

  static examples = [
    {
      description: "Scaffold a marketplace named acme into ./acme",
      command: "<%= config.bin %> <%= command.id %> acme",
    },
  ];

  static args = {
    name: Args.string({
      description:
        "Name of the marketplace (kebab-case). Becomes the directory, the package.json name, " +
        "and the prefix every skill id must carry.",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(NewMarketplace);
    const marketplaceName = args.name;
    const marketplaceDir = path.join(process.cwd(), marketplaceName);

    this.refuseUnusableName(marketplaceName);
    await this.refuseOccupiedDirectory(marketplaceDir);

    try {
      const written = await writeMarketplaceScaffold(marketplaceDir, marketplaceName);
      this.reportCreated(marketplaceName, marketplaceDir, written);
      this.reportNextSteps(marketplaceName, marketplaceDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Both name rules `build marketplace` enforces, enforced here instead — failing
   * at creation beats failing at publish, when the name is already the directory,
   * the package name and the prefix on every id.
   */
  private refuseUnusableName(marketplaceName: string): void {
    const kebabError = validateKebabCaseName(marketplaceName, "Marketplace");
    if (kebabError) {
      this.error(kebabError, { exit: EXIT_CODES.INVALID_ARGS });
    }

    // The package.json this command is about to write names the marketplace after
    // itself, so the marketplace name IS the package name. That is what keeps the
    // public catalogue's exemption out of reach: it belongs to one npm package, and
    // nobody scaffolds that package from here.
    const reservedError = validateMarketplaceName(marketplaceName, marketplaceName);
    if (reservedError) {
      this.error(reservedError, { exit: EXIT_CODES.ERROR });
    }
  }

  private async refuseOccupiedDirectory(marketplaceDir: string): Promise<void> {
    if (await isDirectoryEmpty(marketplaceDir)) return;

    this.error(occupiedDirectoryError(marketplaceDir), { exit: EXIT_CODES.ERROR });
  }

  private reportCreated(
    marketplaceName: string,
    marketplaceDir: string,
    written: readonly string[],
  ): void {
    this.log("");
    this.logSuccess(`Created marketplace '${marketplaceName}' at ${marketplaceDir}`);
    for (const relPath of written) {
      this.log(`  ${relPath}`);
    }
  }

  private reportNextSteps(marketplaceName: string, marketplaceDir: string): void {
    const skillDir = path.join(SKILLS_DIR_PATH, exampleSkillId(marketplaceName));
    const steps = [
      `cd ${marketplaceName}`,
      "Replace the placeholder 'author' in package.json with your own handle — it is what 'build marketplace' records as this marketplace's owner",
      `Replace ${skillDir}/ with a skill of your own. Every skill id must begin with '${marketplaceName}-'`,
      `${CLI_INVOKE_COMMAND} build plugins`,
      `${CLI_INVOKE_COMMAND} build marketplace`,
      `${CLI_INVOKE_COMMAND} init --marketplace ${marketplaceDir}   (from a project)`,
    ];

    this.log("");
    this.log("Next steps:");
    for (const [index, step] of steps.entries()) {
      this.log(`  ${index + 1}. ${step}`);
    }
    this.log("");
  }
}
