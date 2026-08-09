/**
 * Entry point for the TypeScript half of `bun run deps:check`.
 *
 * The check exports a function and runs nothing on import, so argv, the console output and the
 * exit code live here rather than beside it.
 */
import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import {
  check,
  OPT_OUT_KEY,
  SHARED_CONFIG_PACKAGE,
  type WorkspaceVerdict,
} from "./check-shared-tsconfig.ts";

/** `--root <dir>`, so the suite can drive this whole entry point against a fixture repository. */
const ROOT_FLAG = "--root";

function repoRootFromArgv(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf(ROOT_FLAG);
  if (flagIndex === -1) return undefined;

  const value = argv[flagIndex + 1];
  if (value === undefined) {
    console.error(`${ROOT_FLAG} needs a directory`);
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  return value;
}

function reportDiverged(verdicts: WorkspaceVerdict[]): void {
  console.error("Workspaces have diverged from the shared TypeScript config:\n");

  for (const verdict of verdicts) {
    if (verdict.outcome !== "diverged") continue;

    console.error(`  ${verdict.workspace}`);
    for (const problem of verdict.problems) {
      console.error(`    ${problem}`);
    }
  }

  console.error(
    [
      "",
      `Extend one of the configs in packages/typescript-config and declare ${SHARED_CONFIG_PACKAGE},`,
      `or record the decision by adding "${OPT_OUT_KEY}": "<why>" to the workspace's package.json.`,
    ].join("\n"),
  );
}

const { clean, verdicts } = check({ repoRoot: repoRootFromArgv(process.argv) });

if (!clean) {
  reportDiverged(verdicts);
  process.exit(EXIT_CODES.ERROR);
}

const bound = verdicts.filter((verdict) => verdict.outcome === "bound");
const optedOut = verdicts.length - bound.length;

console.log(
  `  ✓ ${bound.length} workspaces extend ${SHARED_CONFIG_PACKAGE}, ${optedOut} record why they do not`,
);
