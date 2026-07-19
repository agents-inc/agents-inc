import { Hook } from "@oclif/core";
import { resolveSource } from "../lib/configuration/index.js";
import { detectInstallation } from "../lib/installation/installation.js";
import { showDashboard } from "../commands/init.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import type { ConfigWithSource } from "../base-command.js";

const hook: Hook<"init"> = async function (options) {
  const projectDir = process.cwd();

  // When no command is given and project is already initialized, show dashboard
  if (options.id === undefined) {
    const installation = await detectInstallation(projectDir);

    if (installation) {
      const selectedCommand = await showDashboard(projectDir);
      if (selectedCommand) {
        await options.config.runCommand(selectedCommand);
      }
      this.exit(EXIT_CODES.SUCCESS);
    }
  }

  const sourceFlag = extractSourceFlag(options.argv);

  try {
    const resolvedConfig = await resolveSource(sourceFlag, projectDir);
    // Boundary cast: oclif Config is a class (not augmentable); read in BaseCommand.sourceConfig
    (options.config as unknown as ConfigWithSource).sourceConfig = resolvedConfig;
  } catch (error) {
    // Let the command handle config failures - commands can check if sourceConfig is undefined
  }
};

/**
 * Extracts the source flag from raw argv (oclif has not parsed flags yet at
 * init-hook time). `-s` wins over both long forms — preserving the historical
 * mutation-order precedence; the `--source=` form is only consulted when the
 * bare `--source` flag is absent.
 */
function extractSourceFlag(argv: string[]): string | undefined {
  const shortIndex = argv.indexOf("-s");
  if (shortIndex !== -1 && shortIndex + 1 < argv.length) return argv[shortIndex + 1];

  const longIndex = argv.indexOf("--source");
  if (longIndex !== -1 && longIndex + 1 < argv.length) return argv[longIndex + 1];

  return argv.find((arg) => arg.startsWith("--source="))?.split("=")[1];
}

export default hook;
