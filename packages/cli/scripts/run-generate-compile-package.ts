/**
 * Entry point for `bun run generate:compile` and `bun run generate:compile:check`.
 *
 * The generator exports functions and runs nothing on import, so argv, the console output and
 * the exit code live here rather than beside it.
 */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-compile-package.ts";

const CHECK_FLAG = "--check";
const COMPILE_ROOT = path.resolve(import.meta.dirname, "../../compile");

if (process.argv.includes(CHECK_FLAG)) {
  const { clean, drifted } = check({ compileRoot: COMPILE_ROOT });

  if (!clean) {
    console.error("packages/compile is out of date:");
    for (const file of drifted) {
      console.error(`  ${file}`);
    }
    console.error(
      "\nRun `bun run generate:compile` in packages/cli and commit everything it writes.",
    );
    process.exit(EXIT_CODES.ERROR);
  }

  console.log("  ✓ packages/compile matches what the generator emits");
} else {
  const { written } = generate({ compileRoot: COMPILE_ROOT });
  console.log(`  ✓ wrote ${written.length} files to packages/compile`);
}
