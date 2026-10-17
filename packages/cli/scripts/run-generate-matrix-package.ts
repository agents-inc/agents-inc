/** Entry point for `bun run generate:matrix` and `generate:matrix:check`. */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";
import { BUILT_IN_MATRIX } from "../src/cli/types/generated/matrix.ts";

import { check, generate, matrixShapeIssues } from "./generate-matrix-package.ts";

const CHECK_FLAG = "--check";
const MATRIX_ROOT = path.resolve(import.meta.dirname, "../../matrix");

/** Runs on both branches: the write must not vendor a matrix that fails at import. */
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
