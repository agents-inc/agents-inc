import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, initGlobalWithEject } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Edit global fallback E2E tests.
 *
 * Verifies that `cc edit` works correctly when launched from a project
 * directory that has NO project config (.claude-src/config.ts), falling
 * back to the global installation.
 */

describe("edit with global-only installation (no project config)", () => {
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    if (testTempDir) await cleanupTempDir(testTempDir);
  });

  it(
    "edit launches from project dir with global-only installation",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global install only -- NO initProject
      const env = await createTestEnvironment();
      testTempDir = env.tempDir;
      fakeHome = env.fakeHome;
      projectDir = env.projectDir;

      const phaseA = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(phaseA.exitCode, `Global init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Verify: no project config exists before edit
      const projectConfigPath = configTsPath(projectDir);
      expect(
        await fileExists(projectConfigPath),
        "Project config must NOT exist before edit (global-only setup)",
      ).toBe(false);

      // Launch edit wizard from project dir (falls back to global installation)
      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Pass through all steps without changes
      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // A no-changes passthrough from global fallback produces "No changes made"
      // and does NOT create a project config. The edit command returns early.
      // This verifies the global fallback path completes without error.

      // Assertion: global config still exists and is unchanged
      const globalConfigPath = configTsPath(fakeHome);
      expect(
        await fileExists(globalConfigPath),
        "Global config must still exist after project edit",
      ).toBe(true);

      await expect({ dir: fakeHome }).toHaveConfig({
        agents: ["web-developer"],
      });

      await result.destroy();
    },
  );

  it(
    "edit with global fallback preserves global skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global install only -- NO initProject
      const env = await createTestEnvironment();
      testTempDir = env.tempDir;
      fakeHome = env.fakeHome;
      projectDir = env.projectDir;

      const phaseA = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(phaseA.exitCode, `Global init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Snapshot global state before edit
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Launch edit wizard from project dir (falls back to global installation)
      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Pass through all steps without changes
      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assertion: global config is unchanged
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toStrictEqual(globalConfigBefore);

      // Assertion: global skills directory still exists with skill files
      expect(
        await directoryExists(globalSkillsDir),
        "Global skills directory must still exist after project edit",
      ).toBe(true);

      // Assertion: global agents directory still exists with agent files
      expect(
        await directoryExists(globalAgentsDir),
        "Global agents directory must still exist after project edit",
      ).toBe(true);

      // Assertion: specific global skill still present
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

      // Assertion: global agent still compiled
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      await result.destroy();
    },
  );
});
