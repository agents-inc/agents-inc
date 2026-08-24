import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { ADDED_MARKER, STEP_TEXT, TIMEOUTS, UNCHANGED_MARKER } from "../pages/constants.js";
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
 *          from global.
 *
 * The deselect this file was written around is UNREACHABLE, and that is a fact
 * about the product rather than about the fixture: `toggleTechnology` refuses
 * any skill with an active global install while the session is at project scope
 * (`isGloballyLockedSkill`), so no skill exists that is both a global
 * preselection and deselectable from here. The scenario was closed by a guard
 * added after D-182. What remains true, and is what these tests now claim, is
 * the confirm step's rendering either side of that guard: an untouched global
 * preselection reaches confirm as one unchanged Global row, and a skill the
 * project really did add reaches it as an added row — the second being the
 * control that stops the first passing merely because the summary painted
 * nothing.
 */
/** The fixture's spare: assigned to no agent by the stack, so an edit can ADD it. */
const SPARE_SKILL = E2E_SKILL["visual-regression"];

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
    "a global preselection the project scope may not deselect reaches confirm unchanged",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase 1: Init from HOME -- create global installation with React
      const globalWizard = await InitWizard.launch({
        source: fixture,
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
        source: fixture,
        env: { HOME: fakeHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const build = await dashboard.selectEdit();

      // Press Space on React (pre-selected from global) on the Web domain, WHICH THE
      // WIZARD REFUSES: React is installed at global scope and this is a project-scope
      // edit, so `toggleTechnology`'s global lock declines the toggle and toasts. That
      // refusal is the subject here, not an obstacle to it — see the file docblock for
      // why the deselect it used to claim cannot be reached at all.
      await build.selectSkillAwaiting(E2E_SKILL.react.display, STEP_TEXT.GLOBAL_SKILLS_BLOCKED);

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

  // The control, and the reason it shares this file: the assertion above reads
  // the same whether the confirm summary painted an unchanged Global row or the
  // wizard refused every keystroke it was given and painted a summary of a
  // session that did nothing. A skill the project may genuinely add separates
  // the two — same key, same grid, same summary, opposite outcome.
  it(
    "a skill the project may add reaches confirm as an added row",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const globalWizard = await InitWizard.launch({
        source: fixture,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      await expectPhaseSuccess(globalResult, { skillIds: [E2E_SKILL.react.id] });
      await globalResult.destroy();

      const dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: fixture,
        env: { HOME: fakeHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const build = await dashboard.selectEdit();

      // The fixture's spare — assigned to no agent by the stack, so nothing has
      // installed it at either scope and the global lock has nothing to hold.
      // `selectSkill` is closed-loop, so reaching the next line means it LANDED.
      await build.selectSkill(SPARE_SKILL.display);

      const sources = await build.passThroughAllDomainsGeneric();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      await confirm.waitForReady();

      // Under GLOBAL, and that is what makes this a control rather than merely a
      // second assertion: an edit opened over a global installation adds at global
      // scope unless the user presses `s`, so this row and React's sit in the same
      // scope band. The only thing separating them is the marker — which is exactly
      // the claim the test above makes and could not otherwise isolate.
      expect(
        await confirm.getSummaryDiffEntries(SPARE_SKILL.display),
        `an added skill must reach confirm as one added row.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([{ scope: "Global", prefix: ADDED_MARKER }]);

      await dashboard.destroy();
    },
  );
});
