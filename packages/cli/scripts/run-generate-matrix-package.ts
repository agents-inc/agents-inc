/**
 * Entry point for `bun run generate:matrix` and `bun run generate:matrix:check`.
 *
 * The generator exports functions and runs nothing on import, so argv, the console output and
 * the exit code live here rather than beside it.
 */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";
import { BUILT_IN_MATRIX } from "../src/cli/types/generated/matrix.ts";

import { check, generate, matrixShapeIssues } from "./generate-matrix-package.ts";

const CHECK_FLAG = "--check";
const MATRIX_ROOT = path.resolve(import.meta.dirname, "../../matrix");

/**
 * Refuses to vendor — or to pass — a catalogue that is no longer a matrix.
 *
 * It runs on both branches deliberately. On `--check` it is the gate; on the write it stops the
 * generator handing `packages/matrix` an artefact whose read models fail at import, which is a
 * package away from whatever emitted it.
 */
function refuseMalformedMatrix(): void {
  const issues = matrixShapeIssues(BUILT_IN_MATRIX);
  if (issues.length === 0) return;

  console.error("src/cli/types/generated/matrix.ts no longer satisfies the matrix shape:");
  for (const issue of issues) {
    console.error(`  ${issue}`);
  }
  console.error(
    "\nRun `bun run generate:types` in packages/cli, or fix the generator that emitted it — " +
      "packages/matrix parses this artefact at import time and every read model fails on it.",
  );
  process.exit(EXIT_CODES.ERROR);
}

refuseMalformedMatrix();

if (process.argv.includes(CHECK_FLAG)) {
  const { clean, drifted } = check({ matrixRoot: MATRIX_ROOT });

  if (!clean) {
    console.error("packages/matrix is out of date:");
    for (const file of drifted) {
      console.error(`  ${file}`);
    }
    console.error(
      "\nRun `bun run generate:matrix` in packages/cli and commit everything it writes.",
    );
    process.exit(EXIT_CODES.ERROR);
  }

  console.log("  ✓ packages/matrix matches what the generator emits");
} else {
  const { written } = generate({ matrixRoot: MATRIX_ROOT });
  console.log(`  ✓ wrote ${written.length} files to packages/matrix`);
}
