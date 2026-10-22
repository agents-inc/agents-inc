/** `bun scripts/run-mutation-ranges.ts <mutation.json> [Status,Status...]`: prints a `--mutate` argument. */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { DEFAULT_RANGE_STATUSES, mutateRangesOf } from "./mutation-ranges.ts";
import { MUTANT_STATUSES, readMutationReport, type MutantStatus } from "./mutation-report.ts";

const USAGE =
  "Usage: bun scripts/run-mutation-ranges.ts <mutation.json> [Status,Status...] (default: Ignored)";

const STATUS_SEPARATOR = ",";

function statusesFrom(argument: string | undefined): readonly MutantStatus[] {
  if (argument === undefined) return DEFAULT_RANGE_STATUSES;

  return argument.split(STATUS_SEPARATOR).map(statusNamed);
}

function statusNamed(name: string): MutantStatus {
  const status = MUTANT_STATUSES.find((known) => known === name);
  if (status === undefined) refuseUnknownStatus(name);

  return status;
}

function refuseUnknownStatus(name: string): never {
  console.error(
    `Unknown mutant status '${name}'. A status is one of: ${MUTANT_STATUSES.join(", ")}`,
  );
  process.exit(EXIT_CODES.INVALID_ARGS);
}

function refuseNothingToMutate(reportFile: string, statuses: readonly MutantStatus[]): never {
  console.error(
    `No mutant in ${reportFile} has the status ${statuses.join(" or ")}, so there is nothing to mutate. Printing no ranges would turn the Stryker run into a dry run that exits 0.`,
  );
  process.exit(EXIT_CODES.ERROR);
}

const [reportFile, statusArgument] = process.argv.slice(2);
if (reportFile === undefined) {
  console.error(USAGE);
  process.exit(EXIT_CODES.INVALID_ARGS);
}

const statuses = statusesFrom(statusArgument);
const ranges = mutateRangesOf(readMutationReport(reportFile), statuses);
if (ranges.length === 0) refuseNothingToMutate(reportFile, statuses);

// No newline after it, so the output can be pasted or substituted as one argument.
process.stdout.write(ranges);
