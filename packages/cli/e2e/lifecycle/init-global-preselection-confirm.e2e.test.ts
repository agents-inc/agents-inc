import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { cleanupTempDir, ensureBinaryExists, isClaudeCLIAvailable } from "../helpers/test-utils.js";

/**
 * D-182: Deselected global skills should NOT show as removed on the confirm
 * step. Global skills that the user simply chose not to add to the project
 * are "not selected", not "removed".
 *
 * Phase 1: Init from HOME to create a global installation with React.
 * Phase 2: Run `cc init` from a project subdirectory. Because a global install
 *          exists, the CLI shows the dashboard; the user selects "Edit" which
 *          opens the edit wizard on the build step with React pre-selected
 *          from global. Deselect React, navigate to confirm step, verify no
 *          removal marker.
 */
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init global preselection confirm step", () => {
  let tempDir: string | undefined;
  let fixture: E2EPluginSource;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
  });

  it(
    "should not show deselected global skills as removed on confirm step during project init",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase 1: Init from HOME -- create global installation with React
      const globalWizard = await InitWizard.launch({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      await expectPhaseSuccess(globalResult, { skillIds: [E2E_SKILL.react.id] });
      await globalResult.destroy();

      // Phase 2: `cc init` from project dir -- global install exists, so the
      // CLI shows the dashboard. Select "Edit" to open the edit wizard on the
      // build step with React pre-selected from global.
      const dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        env: { HOME: fakeHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const build = await dashboard.selectEdit();

      // Deselect React (pre-selected from global) on the Web domain
      await build.selectSkill(E2E_SKILL.react.display);

      // Advance through remaining domains to the sources step
      const sources = await build.passThroughAllDomainsGeneric();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      await confirm.waitForReady();
      const output = confirm.getOutput();

      // Deselected global React should NOT appear with a removal marker.
      // Deselecting a global pre-selection in a project-scoped edit means
      // "don't add to project" -- not "remove from global installation".
      // No "- " prefix should appear for React. React WILL still appear in
      // the confirm output (dimmed, under Global) because it remains part of
      // the global installation. The key assertion is that it does NOT have
      // a removal marker ("- " prefix).
      const lines = output.split("\n");
      const removalLines = lines.filter(
        (l) => l.includes("- ") && (l.includes("react") || l.includes("React")),
      );
      expect(removalLines).toStrictEqual([]);

      await dashboard.destroy();
    },
  );
});
