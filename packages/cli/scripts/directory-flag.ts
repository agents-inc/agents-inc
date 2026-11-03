import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";

/** The directory after `flag`, or `undefined` without the flag; the flag alone refuses the run. */
export function directoryAfterFlag(argv: readonly string[], flag: string): string | undefined {
  const flagIndex = argv.indexOf(flag);
  if (flagIndex === -1) return undefined;

  const value = argv[flagIndex + 1];
  if (value === undefined) {
    console.error(`${flag} needs a directory`);
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  return value;
}
