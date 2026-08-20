/**
 * Entry point for `bun run generate:types [skills-source-path]` and
 * `bun run generate:types:check`.
 *
 * The generator exports functions and runs nothing on import, so argv, the console output and
 * the exit code live here rather than beside it.
 */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-source-types.ts";

const CHECK_FLAG = "--check";
const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(CLI_ROOT, "src/cli/types/generated");

/** The marketplace checkout, a sibling of the monorepo root — the local layout, not CI's. */
const DEFAULT_SKILLS_SOURCE = path.resolve(CLI_ROOT, "../../../skills");

/** The one positional argument: where to read the marketplace from. */
function skillsSourceFromArgv(): string {
  const positional = process.argv.slice(2).find((arg) => arg !== CHECK_FLAG);
  return positional ?? DEFAULT_SKILLS_SOURCE;
}

const skillsSource = skillsSourceFromArgv();

if (process.argv.includes(CHECK_FLAG)) {
  const { clean, drifted } = await check({ outDir: OUT_DIR, skillsSource });

  if (!clean) {
    console.error(`src/cli/types/generated is out of date against ${skillsSource}:`);
    for (const file of drifted) {
      console.error(`  ${file}`);
    }
    console.error(
      "\nRun `bun run generate:types` in packages/cli and commit everything it writes.",
    );
    process.exit(EXIT_CODES.ERROR);
  }

  console.log("  ✓ src/cli/types/generated matches what the generator emits");
} else {
  console.log(`Generating source types from ${skillsSource}\n`);

  const { written, counts } = await generate({ outDir: OUT_DIR, skillsSource });

  for (const file of written) {
    console.log(`  ✓ ${file}`);
  }
  console.log(
    `\n  Generated: ${counts.skills} skills, ${counts.categories} categories, ` +
      `${counts.domains} domains, ${counts.agents} agents\n`,
  );
}
