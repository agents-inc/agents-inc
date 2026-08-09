import type { Hook } from "@oclif/core";
import { resolveSource } from "../lib/configuration/index.js";
import { runDashboardFlow } from "../commands/init.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import type { ConfigWithSource } from "../base-command.js";

/** oclif's id for the one command that may name a source. */
const INIT_COMMAND_ID = "init";

const hook: Hook<"init"> = async function (options) {
  const projectDir = process.cwd();

  // When no command is given and project is already initialized, show dashboard
  if (options.id === undefined) {
    const shown = await runDashboardFlow(projectDir, options.config, "standalone");
    if (shown) {
      this.exit(EXIT_CODES.SUCCESS);
    }
  }

  // `init` is the one command that may name a source, so it is the one command whose
  // argv can carry `--source` and the one caller the environment rung answers.
  const isInit = options.id === INIT_COMMAND_ID;
  const sourceFlag = isInit ? extractSourceFlag(options.argv) : undefined;

  try {
    const resolvedConfig = await resolveSource({
      caller: isInit ? "init" : "stored",
      flag: sourceFlag,
      projectDir,
    });
    // Boundary cast: oclif Config is a class (not augmentable); read in BaseCommand.sourceConfig
    (options.config as unknown as ConfigWithSource).sourceConfig = resolvedConfig;
  } catch {
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
