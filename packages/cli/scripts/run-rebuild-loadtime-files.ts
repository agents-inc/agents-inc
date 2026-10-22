/**
 * `bun scripts/run-rebuild-loadtime-files.ts <mutation.json> [--output <file>]`, on the report of a
 * first pass of `stryker.cli-commands.config.mjs`: rewrites `vitest.loadtime.files.json` before the
 * loaded-dist pass.
 */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { LOADTIME_FILES_LIST, rebuildLoadTimeFiles } from "./loadtime-files.ts";

const USAGE = "Usage: bun scripts/run-rebuild-loadtime-files.ts <mutation.json> [--output <file>]";

/** Lets the suite drive this entry point's success path against a list outside the tree. */
const OUTPUT_FLAG = "--output";

/** The flag and the file after it. */
const OUTPUT_OPTION_LENGTH = 2;

type RebuildArguments = { reportFile: string | undefined; listFile: string };

function rebuildArgumentsFrom(args: readonly string[]): RebuildArguments {
  const flagIndex = args.indexOf(OUTPUT_FLAG);
  if (flagIndex === -1) return { reportFile: args[0], listFile: LOADTIME_FILES_LIST };

  const listFile = args[flagIndex + 1];
  if (listFile === undefined) refuseOutputWithoutFile();

  const [reportFile] = args.toSpliced(flagIndex, OUTPUT_OPTION_LENGTH);
  return { reportFile, listFile };
}

/** Rather than fall back to the committed list, which a run asking for another file must not touch. */
function refuseOutputWithoutFile(): never {
  console.error(`${OUTPUT_FLAG} needs a file`);
  process.exit(EXIT_CODES.INVALID_ARGS);
}

const { reportFile, listFile } = rebuildArgumentsFrom(process.argv.slice(2));
if (reportFile === undefined) {
  console.error(USAGE);
  process.exit(EXIT_CODES.INVALID_ARGS);
}

console.log(rebuildLoadTimeFiles(reportFile, listFile));
