import os from "os";
import path from "path";
import { rm } from "fs/promises";
import { fileURLToPath } from "url";
import { WORKER_ORIGIN } from "@workspace/api-mocks/fixtures";
import chalk from "chalk";
import { beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { initializeMatrix } from "./src/cli/lib/matrix/matrix-provider";
import { guardAgainstDistReplacement } from "./src/cli/lib/testing/dist-staleness";
import { SPEC_TERMINAL_COLUMNS, SPEC_TERMINAL_ROWS } from "./src/cli/lib/__tests__/test-constants";
import { createTempDir } from "./src/cli/lib/__tests__/test-fs-utils";
import { BUILT_IN_MATRIX } from "./src/cli/types/generated/matrix";

const COLOR_DISABLED_CHALK_LEVEL = 0;

// Refuses a test run over a dist/ rebuilt mid-run; afterEach names the test in flight.
const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));
const assertDistUnchanged = guardAgainstDistReplacement(CLI_ROOT);

beforeEach(assertDistUnchanged);
afterEach(assertDistUnchanged);

// Pinned so FORCE_COLOR in the developer's shell cannot put escapes into rendered frames.
chalk.level = COLOR_DISABLED_CHALK_LEVEL;

// Ink reads these via is-in-ci at import and changes its output under CI.
delete process.env.CI;
delete process.env.GITHUB_ACTIONS;

// A worker's stdout is a pipe, so Ink sizes it by the terminal around it: terminal-size reads these,
// then /dev/tty, so a spec drew wider at a developer's terminal than headless. The stream stays
// sizeless, as a pipe is; @oclif/table reads that.
process.env.COLUMNS = String(SPEC_TERMINAL_COLUMNS);
process.env.LINES = String(SPEC_TERMINAL_ROWS);

// SEED_API_URL reads this once at module load, so it is set before any test file imports. It is on
// this machine, so every printed editor address is the local editor's.
process.env.AGENTS_INC_API_URL = WORKER_ORIGIN;

// Otherwise oclif's update check spawns a detached child that hits npm and writes into test homes.
process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK = "1";

// Isolates tests from the developer's real global config; an overridden HOME is respected.
const realHomedir = os.homedir();
let testHomeDir: string;

beforeAll(async () => {
  testHomeDir = await createTempDir("vitest-home-");
});

beforeEach(() => {
  // Per test, because a vi.restoreAllMocks() in any afterEach would withdraw a per-file spy.
  vi.spyOn(os, "homedir").mockImplementation(() => {
    if (process.env.HOME && process.env.HOME !== realHomedir) {
      return process.env.HOME;
    }
    return testHomeDir;
  });

  initializeMatrix(BUILT_IN_MATRIX);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(testHomeDir, { recursive: true, force: true }).catch(() => {});
});
