import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  pollUntil,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * Cancelling `cc init` must not make the setup wizard unreachable.
 *
 * Running init from a project directory (a directory that is NOT the home
 * directory) auto-creates a blank global config before the wizard renders.
 * A blank config declares no skills and no agents, so it represents no
 * installation — it must not route the next `cc init` to the dashboard.
 *
 * Scope: this pins ONLY the empty-config case. Routing init to the dashboard
 * when a REAL global installation exists is deliberate product behaviour and
 * is covered by init-wizard-existing.e2e.test.ts.
 */

let sourceDir: string;
let sourceTempDir: string;

beforeAll(async () => {
  await ensureBinaryExists();
  const source = await createE2ESource();
  sourceDir = source.sourceDir;
  sourceTempDir = source.tempDir;
}, TIMEOUTS.SETUP);

afterAll(async () => {
  if (sourceTempDir) await cleanupTempDir(sourceTempDir);
});

describe("init cancelled from a project directory", () => {
  let tempDir: string | undefined;
  let firstRun: InitWizard | undefined;
  let secondRun: InitWizard | undefined;

  afterEach(async () => {
    await firstRun?.destroy();
    firstRun = undefined;
    await secondRun?.destroy();
    secondRun = undefined;

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "leaves the setup wizard reachable on the next run",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A: launch init from the project dir with a distinct HOME, then
      // abort on the very first (stack) step.
      const cancelled = await InitWizard.launch({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir,
        env: { HOME: fakeHome },
      });
      firstRun = cancelled;

      cancelled.abort();
      const cancelledExitCode = await cancelled.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(cancelledExitCode, "aborting the stack step must exit as cancelled").toBe(
        EXIT_CODES.CANCELLED,
      );

      // A cancelled init installs nothing — assert config AND filesystem at
      // both scopes.
      expect(
        await fileExists(configTsPath(projectDir)),
        "cancelled init must not write a project config.ts",
      ).toBe(false);
      expect(
        await directoryExists(skillsPath(projectDir)),
        "cancelled init must not create project skills",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(projectDir)),
        "cancelled init must not create project agents",
      ).toBe(false);
      expect(
        await directoryExists(skillsPath(fakeHome)),
        "cancelled init must not create global skills",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(fakeHome)),
        "cancelled init must not create global agents",
      ).toBe(false);

      // Phase B: re-run init in the same project. Nothing is installed at
      // either scope, so the setup wizard must render — not the dashboard.
      const reopened = await InitWizard.launchRaw({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir,
        env: { HOME: fakeHome },
      });
      secondRun = reopened;

      await pollUntil(
        () => {
          const output = reopened.getOutput();
          return output.includes(STEP_TEXT.STACK) || output.includes(STEP_TEXT.DASHBOARD);
        },
        TIMEOUTS.WIZARD_LOAD,
        () =>
          new Error(
            `Re-run of init reached neither the stack step nor the dashboard.\n${reopened.getOutput()}`,
          ),
      );

      const reopenedOutput = reopened.getOutput();
      expect(reopenedOutput, "re-running init after a cancel must reach stack selection").toContain(
        STEP_TEXT.STACK,
      );
      expect(
        reopenedOutput,
        "an empty global config must not count as an installation",
      ).not.toContain(STEP_TEXT.DASHBOARD);
    },
  );
});
