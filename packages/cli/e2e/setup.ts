import path from "path";
import { fileURLToPath } from "url";

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import {
  assertDistIsPresent,
  guardAgainstDistReplacement,
} from "../src/cli/lib/testing/dist-staleness.js";

/**
 * Refuses a spec whose `dist/` was replaced while it was running.
 *
 * This suite spawns `node bin/run.js`, and oclif resolves that binary's commands from
 * `./dist/commands`. tsup builds with `clean: true`, so a
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

/**
 * The dist door, asked once per spec FILE — which is what this file's `setupFiles` position makes
 * a top-level `beforeAll` mean.
 *
 * It answers a window `globalSetup` cannot: `assertDistIsFresh` runs once per RUN, before
 * collection, so a `dist/` emptied after that point is invisible to it. Every spec here spawns
 * `node bin/run.js`, and with no build to spawn the reward is a 45-second timeout naming nothing.
 *
 * It lives here rather than in each spec because it was per-file discipline across 251 files and
 * 525 lines with no checker over it — forget the call and nothing said so, and nothing
 * distinguished a spec that omitted it correctly from one that forgot. Registered once, the door
 * costs zero call sites and cannot be forgotten. `spec-gates.test.ts` now asserts the ABSENCE of
 * the call rather than its presence, so the discipline cannot grow back.
 */
beforeAll(() => {
  assertDistIsPresent(CLI_ROOT);
});

beforeEach(assertDistUnchanged);
afterEach(assertDistUnchanged);

/**
 * The same guard once more, at the one position a spec's own `beforeAll` cannot skip.
 *
 * A `dist/` emptied DURING a spec's `beforeAll` — after the door above has already passed — was
 * filed as a window nothing could see, and the first half of that is right: a throwing `beforeAll`
 * skips every `beforeEach` and `afterEach` under it, so the file fails on whatever its setup
 * happened to hit and the error names nothing about a build. It is the SPEC's setup that spawns,
 * installs and waits, so this is not a narrow window — it is most of what a lifecycle spec does.
 *
 * The second half was wrong. **Measured on vitest 4.1.10**: a setup file's `afterAll` runs even
 * when the spec's `beforeAll` threw, and its throw is reported ALONGSIDE that error rather than in
 * place of it. So the misleading failure still stands — nothing can undo it, the spec really did
 * fail there — and the reason is now printed beside it, which is the whole of what was missing.
 *
 * It costs one hook per spec FILE, not per test, and it stats one path.
 */
afterAll(assertDistUnchanged);
