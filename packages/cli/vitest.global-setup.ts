import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDistIsFresh } from "./src/cli/lib/testing/dist-staleness.js";

// The rule this enforces is in src/, not here (CLI-460). A file at this level
// sits in no tsconfig of this package and matches no `files` block in
// eslint.config.js, so nothing type-checked or linted the scan that stands
// between the whole suite and a false green. What is left here is the part that
// cannot move: vitest resolves `globalSetup` to a file and calls its `setup`
// export, and this file's own location is the package root every path is
// measured from. It runs before dist/ freshness is known, so the module it
// imports stays dependency-free — see the note on assertDistIsFresh.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  await assertDistIsFresh(CLI_ROOT);
}
