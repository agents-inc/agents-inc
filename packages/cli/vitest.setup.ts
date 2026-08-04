import os from "os";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { beforeAll, beforeEach, afterAll, vi } from "vitest";
import { initializeMatrix } from "./src/cli/lib/matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "./src/cli/types/generated/matrix";

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
  vi.spyOn(os, "homedir").mockImplementation(() => {
    // If a test has overridden HOME to something other than the real home, respect it
    if (process.env.HOME && process.env.HOME !== realHomedir) {
      return process.env.HOME;
    }
    return testHomeDir;
  });
});

beforeEach(async () => {
  initializeMatrix(BUILT_IN_MATRIX);
  const { useWizardStore } = await import("./src/cli/stores/wizard-store");
  useWizardStore.getState().reset();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(testHomeDir, { recursive: true, force: true }).catch(() => {});
});
