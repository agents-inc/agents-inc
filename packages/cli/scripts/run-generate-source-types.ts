/** Entry point for `bun run generate:types [skills-source-path]` and `generate:types:check`. */
import { existsSync } from "fs";
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-source-types.ts";

const CHECK_FLAG = "--check";
const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(CLI_ROOT, "src/cli/types/generated");

/** The marketplace checkout beside the monorepo root (local layout). */
const DEFAULT_SKILLS_SOURCE = path.resolve(CLI_ROOT, "../../../skills");

/** What `extractSkills` reads inside a checkout. */
const SKILLS_DIR = "src/skills";

function skillsSourceFromArgv(): string {
  const positional = process.argv.slice(2).find((arg) => arg !== CHECK_FLAG);
  return positional ?? DEFAULT_SKILLS_SOURCE;
}

/** Rather than the stack trace the generator throws on a checkout that was never copied in. */
function refuseMissingSkillsCheckout(skillsSource: string): void {
  if (existsSync(path.join(skillsSource, SKILLS_DIR))) return;

  console.error(
    `No skills repository at ${skillsSource}: generate:types:check reads its ${SKILLS_DIR}. ` +
      "Put a checkout there, or pass its path: `bun run generate:types:check <path>`.",
  );
  process.exit(EXIT_CODES.ERROR);
}

const skillsSource = skillsSourceFromArgv();

if (process.argv.includes(CHECK_FLAG)) {
  refuseMissingSkillsCheckout(skillsSource);

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
