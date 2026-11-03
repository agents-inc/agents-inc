/** Entry point for `bun run generate:compile` and `generate:compile:check`. */
import path from "path";

import { directoryAfterFlag } from "./directory-flag.ts";
import { reportCheck } from "./emitted-files.ts";
import { check, generate } from "./generate-compile-package.ts";

const CHECK_FLAG = "--check";
const COMPILE_ROOT = path.resolve(import.meta.dirname, "../../compile");
const COMPILE_ROOT_LABEL = "packages/compile";

/** Lets the suite drive both branches against a directory outside the tree. */
const COMPILE_ROOT_FLAG = "--compile-root";

type Target = { compileRoot: string; label: string };

/** A flag naming no directory refuses, rather than fall back to packages/compile. */
function targetFrom(args: readonly string[]): Target {
  const compileRoot = directoryAfterFlag(args, COMPILE_ROOT_FLAG);

  return compileRoot === undefined
    ? { compileRoot: COMPILE_ROOT, label: COMPILE_ROOT_LABEL }
    : { compileRoot, label: compileRoot };
}

const { compileRoot, label } = targetFrom(process.argv.slice(2));

if (process.argv.includes(CHECK_FLAG)) {
  reportCheck(check({ compileRoot }), { label, script: "generate:compile" });
} else {
  const { written } = generate({ compileRoot });
  console.log(`  ✓ wrote ${written.length} files to ${label}`);
}
