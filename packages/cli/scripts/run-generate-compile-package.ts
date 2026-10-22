/** Entry point for `bun run generate:compile` and `generate:compile:check`. */
import path from "path";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.ts";

import { check, generate } from "./generate-compile-package.ts";

const CHECK_FLAG = "--check";
const COMPILE_ROOT = path.resolve(import.meta.dirname, "../../compile");
const COMPILE_ROOT_LABEL = "packages/compile";

/** Lets the suite drive both branches against a directory outside the tree. */
const COMPILE_ROOT_FLAG = "--compile-root";

type Target = { compileRoot: string; label: string };

function targetFrom(args: readonly string[]): Target {
  const flagIndex = args.indexOf(COMPILE_ROOT_FLAG);
  if (flagIndex === -1) return { compileRoot: COMPILE_ROOT, label: COMPILE_ROOT_LABEL };

  const compileRoot = args[flagIndex + 1];
  if (compileRoot === undefined) refuseCompileRootWithoutDirectory();

  return { compileRoot, label: compileRoot };
}

/** Rather than fall back to packages/compile, which a run naming another directory must not touch. */
function refuseCompileRootWithoutDirectory(): never {
  console.error(`${COMPILE_ROOT_FLAG} needs a directory`);
  process.exit(EXIT_CODES.INVALID_ARGS);
}

const { compileRoot, label } = targetFrom(process.argv.slice(2));

if (process.argv.includes(CHECK_FLAG)) {
  const { clean, drifted } = check({ compileRoot });

  if (!clean) {
    console.error(`${label} is out of date:`);
    for (const file of drifted) {
      console.error(`  ${file}`);
    }
    console.error(
      "\nRun `bun run generate:compile` in packages/cli and commit everything it writes.",
    );
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(`  ✓ ${label} matches what the generator emits`);
} else {
  const { written } = generate({ compileRoot });
  console.log(`  ✓ wrote ${written.length} files to ${label}`);
}
