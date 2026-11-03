/** Entry point for `bun run generate:schemas` and `generate:schemas:check`. */
import path from "path";

import { reportCheck } from "./emitted-files.ts";
import { check, generate } from "./generate-json-schemas.ts";

const CHECK_FLAG = "--check";
const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../src/schemas");

if (process.argv.includes(CHECK_FLAG)) {
  reportCheck(await check({ schemasDir: SCHEMAS_DIR }), {
    label: "src/schemas",
    script: "generate:schemas",
  });
} else {
  const { written } = await generate({ schemasDir: SCHEMAS_DIR });

  for (const file of written) {
    console.log(`  ✓ ${file}`);
  }
  console.log(`\n  ✓ wrote ${written.length} files to src/schemas`);
}
