import os from "os";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { WORKER_ORIGIN } from "@workspace/api-mocks/fixtures";
import chalk from "chalk";
import { beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { initializeMatrix } from "./src/cli/lib/matrix/matrix-provider";
import { guardAgainstDistReplacement } from "./src/cli/lib/testing/dist-staleness";
import { BUILT_IN_MATRIX } from "./src/cli/types/generated/matrix";

/** chalk's "every colour off" level — the one that emits a frame with no escapes at all. */
const COLOR_DISABLED_CHALK_LEVEL = 0;

// A second agent's `bun run build` empties dist/ under this run — tsup has `clean: true`, and
// all three `pretest` hooks call it. The `commands` specs resolve oclif through ./dist/commands,
// so one invoked inside that window finds nothing there, and the reader is handed an ordinary
// assertion failure with no mention of a build. The rule and the message are in src/, where they
// have tests of their own; what stays here is the part that cannot move — the guard has to be
// taken where the suite loads, and this file's own location is the package root it is measured
// from. (This file is in `tsconfig.json`'s `include` and in eslint.config.js's `files` as of
// 2026-08-22; it was in neither when the split was made, which used to be a second reason.)
//
// Both hooks, one check. `beforeEach` refuses a test that would run over a build the file did
// not start with; `afterEach` names the cause on the test that was actually in flight when the
// rebuild landed, which is the one whose misleading failure the reader reads first.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));
const assertDistUnchanged = guardAgainstDistReplacement(CLI_ROOT);

beforeEach(assertDistUnchanged);
afterEach(assertDistUnchanged);

// Colour off, PINNED rather than assumed. Ink paints through chalk, and chalk turns
// itself off on vitest's non-TTY stdout — so every component assertion here was written
// against a plain frame, and source-grid.test.tsx's inline layout snapshots were
// recorded as plain frames. That was detection rather than a decision: `FORCE_COLOR` in
// the developer's own shell overrides it, chalk then inserts truecolour escapes BETWEEN
// words, and `toContain("Marketplace Agents Inc")` reports a MISSING STRING — a harness
// problem wearing a regression's clothes, which is the expensive part. It made a gate
// result untrustworthy unless you also knew which shell produced it.
//
// Pinned here rather than worked around per assertion, because the assertions are not
// the defect: which of them break depends only on where the component happens to put a
// style boundary, stripping escapes inside them would owe every future test the same
// parser (CLAUDE.md forbids that helper outright), and a snapshot of a LAYOUT has no
// escape-tolerant form to be rewritten into at all.
//
// The opt-in half is already written down and keeps working unchanged: the three
// `describe` blocks in source-grid.test.tsx that assert ON colour each save chalk.level,
// force truecolor and restore it. Needing colour belongs to the test; the default
// belongs here. Ink and this file resolve one chalk instance, so one assignment covers
// both. The e2e harness states the same rule its own way — `FORCE_COLOR: "0"` in
// e2e/helpers/terminal-session.ts, an env var because that door spawns a child.
chalk.level = COLOR_DISABLED_CHALK_LEVEL;

// Unit tests render Ink components against fake streams, where being "in CI"
// must not exist as a concept — yet Ink consults these variables (`is-in-ci`)
// and changes when frames are written and what unmount appends. That made the
// same test read different output locally and on a runner, and grew per-test
// workarounds. Deleted at module scope, before any test file imports ink,
// because is-in-ci reads the environment once at import. Nothing under src/
// reads either variable itself (checked 2026-08-05). The e2e suite is the
// opposite case — its harness passes CI through on purpose, to prove the CLI
// trusts a real terminal over the CI guess.
delete process.env.CI;
delete process.env.GITHUB_ACTIONS;

// The config store this suite is allowed to talk to, pinned for every file rather than for the
// five that mock it. `SEED_API_URL` in src/cli/lib/seed/fetch-seed.ts is
// `process.env.AGENTS_INC_API_URL ?? "https://api.agentsinc.sh"`, READ ONCE AT MODULE LOAD — so a
// spec that sets the variable in a `beforeEach` has already imported the production URL, and any
// request it fails to intercept leaves the machine. Setup files run before a test file's imports,
// which is what makes this the one place the substitution can be made at all.
//
// The value is `@workspace/api-mocks`'s own origin, because that is what every handler in it is
// anchored on: a mock server listening here and a client addressing anywhere else match nothing
// and answer `unhandled` for every route, which reads as a mock with nothing to say rather than
// as a mistake. A file that installs no mock now gets a refused connection instead of a real
// request to the store, which is the safer half of the same pin.
process.env.AGENTS_INC_API_URL = WORKER_ORIGIN;

// Prevent tests from finding the real ~/.claude-src/config.yaml via global fallback.
// loadProjectConfig() falls back to os.homedir() when no project-level config exists,
// which pollutes test results when a real global install is present.
//
// Tests that explicitly set process.env.HOME (e.g., uninstall tests with fakeHome)
// get their HOME respected; all others get the isolated test home dir.
const realHomedir = os.homedir();
let testHomeDir: string;

beforeAll(async () => {
  testHomeDir = await mkdtemp(path.join(os.tmpdir(), "vitest-home-"));
});

beforeEach(async () => {
  // Installed per TEST, not once per file. From a `beforeAll` a single `vi.restoreAllMocks()`
  // — which twenty-three specs in this package call from an `afterEach` — withdrew this spy for
  // every LATER test in that file, after which os.homedir() answered from the developer's own
  // machine. That is how a unit test came to read a real ~/.claude-src/config.ts and pass on it.
  // `home-dir-read-at-call-time.test.ts` holds the re-installation, paired with a case proving
  // the withdrawal it survives is real.
  vi.spyOn(os, "homedir").mockImplementation(() => {
    // If a test has overridden HOME to something other than the real home, respect it
    if (process.env.HOME && process.env.HOME !== realHomedir) {
      return process.env.HOME;
    }
    return testHomeDir;
  });

  initializeMatrix(BUILT_IN_MATRIX);
  const { useWizardStore } = await import("./src/cli/stores/wizard-store");
  useWizardStore.getState().reset();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(testHomeDir, { recursive: true, force: true }).catch(() => {});
});
