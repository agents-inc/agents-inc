import { Args } from "@oclif/core";
import path from "path";

import { BaseCommand } from "../../base-command.js";
import { CLI_INVOKE_COMMAND, EDITOR_URL, SKILLS_DIR_PATH } from "../../consts.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { validateMarketplaceName } from "../../lib/marketplace-generator.js";
import { exampleSkillId, writeMarketplaceScaffold } from "../../lib/marketplace-scaffold.js";
import { validateKebabCaseName } from "../../lib/validate-kebab-name.js";
import { isDirectoryEmpty } from "../../utils/fs.js";

const RESERVED_NAME_WAY_OUT = `run '${CLI_INVOKE_COMMAND} new marketplace <other-name>'`;

/** No `--force` on purpose: it would overwrite work this command did not author. */
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

  /** `build marketplace`'s name rules, enforced at creation rather than at publish. */
  private refuseUnusableName(marketplaceName: string): void {
    const kebabError = validateKebabCaseName(marketplaceName, "Marketplace");
    if (kebabError) {
      this.error(kebabError, { exit: EXIT_CODES.INVALID_ARGS });
    }

    // The scaffolded package.json uses this name, so it is also the package name.
    const reservedError = validateMarketplaceName(
      marketplaceName,
      marketplaceName,
      RESERVED_NAME_WAY_OUT,
    );
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
      `Push it to GitHub, then add it from the Marketplace button at ${EDITOR_URL}`,
      `${CLI_INVOKE_COMMAND} init --from <id> --marketplace ${marketplaceDir}   (from a project — tests your local changes against a configuration built there)`,
    ];

    this.log("");
    this.log("Next steps:");
    for (const [index, step] of steps.entries()) {
      this.log(`  ${index + 1}. ${step}`);
    }
    this.log("");
  }
}
