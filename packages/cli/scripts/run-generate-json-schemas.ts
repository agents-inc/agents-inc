/**
 * Entry point for `bun run generate:schemas` and `bun run generate:schemas:check`.
 *
 * The generator exports functions and runs nothing on import, so argv, the console output and
 * the exit code live here rather than beside it.
 */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-json-schemas.ts";

const CHECK_FLAG = "--check";
const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../src/schemas");

if (process.argv.includes(CHECK_FLAG)) {
  const { clean, drifted } = await check({ schemasDir: SCHEMAS_DIR });

  if (!clean) {
    console.error("src/schemas is out of date:");
    for (const file of drifted) {
      console.error(`  ${file}`);
    }
    console.error(
      "\nRun `bun run generate:schemas` in packages/cli and commit everything it writes.",
    );
    process.exit(EXIT_CODES.ERROR);
  }

  console.log("  ✓ src/schemas matches what the generator emits");
} else {
  const { written } = await generate({ schemasDir: SCHEMAS_DIR });

  for (const file of written) {
    console.log(`  ✓ ${file}`);
  }
  console.log(`\n  ✓ wrote ${written.length} files to src/schemas`);
}
