import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { STEP_TEXT, TIMEOUTS, UNCHANGED_MARKER } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

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
    await cleanupFixture(fixture);
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

      // Deselecting a global pre-selection during a project-scoped edit means "do not add to
      // the project" -- never "remove from the global installation". So React reaches confirm
      // as the global installation's own untouched row, and the whole claim is that shape:
      // exactly one row, under Global, carrying the unchanged bullet.
      //
      // Asserting the row rather than the absence of a removal marker is what makes it a
      // claim at all. A scan for lines carrying both "- " and "react" is answered by "found
      // nothing" — and an empty result is what a run that painted no React row at all
      // produces too, so the removal this test is named for was never the reason it passed.
      expect(
        await confirm.getSummaryDiffEntries(E2E_SKILL.react.display),
        `a deselected global preselection must reach confirm as one unchanged Global row.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([{ scope: "Global", prefix: UNCHANGED_MARKER }]);

      await dashboard.destroy();
    },
  );
});
