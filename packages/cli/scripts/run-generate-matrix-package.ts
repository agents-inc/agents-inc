/**
 * Entry point for `bun run generate:matrix` and `bun run generate:matrix:check`.
 *
 * The generator exports functions and runs nothing on import, so argv, the console output and
 * the exit code live here rather than beside it.
 */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-matrix-package.ts";

const CHECK_FLAG = "--check";
const MATRIX_ROOT = path.resolve(import.meta.dirname, "../../matrix");

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
