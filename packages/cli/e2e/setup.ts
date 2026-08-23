import path from "path";
import { fileURLToPath } from "url";

import { afterEach, beforeEach } from "vitest";

import { guardAgainstDistReplacement } from "../src/cli/lib/testing/dist-staleness.js";

/**
 * Refuses a spec whose `dist/` was replaced while it was running.
 *
 * This suite spawns `node bin/run.js`, and oclif resolves that binary's commands from
 * `./dist/commands`. tsup builds with `clean: true` and all three `pretest` hooks call it, so a
 * second agent running `bun run test` in the same checkout empties the directory this suite is
 * executing out of. A command invoked in that window exits 127 or reports itself unknown, which reaches
 * a spec as a screen that never showed what it waited for — an ordinary assertion failure naming
 * nothing about a build, and indistinguishable from a regression the change under test caused.
 *
 * The unit suite states the same rule from `vitest.setup.ts`; the check itself, and the message
 * it throws, are in `src/cli/lib/testing/dist-staleness.ts` so that one definition covers both.
 *
 * Deliberately separate from `global-setup.ts`, which runs in vitest's own process: a throw from
 * a globalSetup teardown is caught and logged as `error during close`, and the run still exits 0
 * (measured on vitest 4.1.10). A hook runs inside the worker, where a throw fails the test.
 */
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assertDistUnchanged = guardAgainstDistReplacement(CLI_ROOT);

beforeEach(assertDistUnchanged);
afterEach(assertDistUnchanged);
