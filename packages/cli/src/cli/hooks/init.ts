import type { Hook } from "@oclif/core";
import { resolveSource } from "../lib/configuration/index.js";
import { runDashboardFlow } from "../commands/init.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import type { ConfigWithSource } from "../base-command.js";

/** oclif's id for the one command that may name a marketplace. */
const INIT_COMMAND_ID = "init";

/**
 * `init`'s marketplace flag, in the three spellings raw argv can carry it. The long
 * `=` form is derived rather than spelled again, so the two cannot drift apart.
 */
const MARKETPLACE_FLAG_SHORT = "-m";
const MARKETPLACE_FLAG_LONG = "--marketplace";
const MARKETPLACE_FLAG_LONG_INLINE = `${MARKETPLACE_FLAG_LONG}=`;

const hook: Hook<"init"> = async function (options) {
  const projectDir = process.cwd();

  // When no command is given and project is already initialized, show dashboard
  if (options.id === undefined) {
    const shown = await runDashboardFlow(projectDir, options.config, "standalone");
    if (shown) {
      this.exit(EXIT_CODES.SUCCESS);
    }
  }

  // `init` is the one command that may name a marketplace, so it is the one command whose
  // argv can carry `--marketplace` and the one caller the environment rung answers.
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
 * Extracts the marketplace flag from raw argv (oclif has not parsed flags yet at
 * init-hook time). `-m` wins over both long forms — preserving the historical
 * mutation-order precedence; the `--marketplace=` form is only consulted when the
 * bare `--marketplace` flag is absent.
 *
 * The withdrawn `--source` / `-s` spellings are read by nothing here, exactly as
 * oclif refuses them once it parses: pre-1.0 aliases nothing, so a run that typed
 * the old flag named no marketplace rather than quietly choosing one.
 */
function extractSourceFlag(argv: string[]): string | undefined {
  return (
    separateValueAfter(argv, MARKETPLACE_FLAG_SHORT) ??
    separateValueAfter(argv, MARKETPLACE_FLAG_LONG) ??
    inlineValueAfter(argv, MARKETPLACE_FLAG_LONG_INLINE)
  );
}

/** The argument following `flag`, where the flag is present and something follows it. */
function separateValueAfter(argv: string[], flag: string): string | undefined {
  const flagIndex = argv.indexOf(flag);
  if (flagIndex === -1) return undefined;
  return argv[flagIndex + 1];
}

/** The value welded onto the flag by an `=`, as in `--marketplace=github:org/skills`. */
function inlineValueAfter(argv: string[], flagPrefix: string): string | undefined {
  return argv.find((arg) => arg.startsWith(flagPrefix))?.slice(flagPrefix.length);
}

export default hook;
