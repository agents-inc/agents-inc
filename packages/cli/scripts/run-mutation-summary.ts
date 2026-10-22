/** `bun scripts/run-mutation-summary.ts <mutation.json> [--list]`: prints the report's counts. */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { readMutationReport } from "./mutation-report.ts";
import { summaryOf } from "./mutation-summary.ts";

const USAGE = "Usage: bun scripts/run-mutation-summary.ts <mutation.json> [--list]";

const LIST_FLAG = "--list";

const [reportFile, ...flags] = process.argv.slice(2);
if (reportFile === undefined) {
  console.error(USAGE);
  process.exit(EXIT_CODES.INVALID_ARGS);
}

for (const line of summaryOf(readMutationReport(reportFile), { list: flags.includes(LIST_FLAG) })) {
  console.log(line);
}
