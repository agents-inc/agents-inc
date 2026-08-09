import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  ensureBinaryExists,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * Install-mode lifecycle E2E tests -- per-skill switching.
 *
 * Tests the full flow of switching ONE skill's install mode mid-lifecycle:
 *   9c: Init local -> edit switch ONE skill to plugin -> verify mixed state
 *
 * These tests require the Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode mid-lifecycle -- per-skill switching", () => {
  let fixture: E2EPluginSource;

  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("per-skill install-mode switching -- mixed local and plugin", () => {
    let editWizard: EditWizard | undefined;

    afterEach(async () => {
      if (editWizard) {
        await editWizard.destroy();
        editWizard = undefined;
      }
    });

    it(
      "should support mixed install modes with per-skill switching in the grid",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        // This test switches ONE skill's install MODE (eject -> plugin) mid-edit.
        // Default-scope skills are GLOBAL, and a project edit renders global
        // skills as locked (readOnly), refusing the toggle. Both phases
        // therefore model editing the GLOBAL install via launchInGlobal: HOME ==
        // cwd == projectDir, the skills are editable, and all content + config
        // collapse onto projectDir (every assertion below reads it).
        // Phase 1: Init in eject mode using page objects
        const initWizard = await InitWizard.launchInGlobal({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
        });

        const initResult = await completeWithLocalSources(initWizard);

        await expectPhaseSuccess(initResult, {
          skillIds: [E2E_SKILL.react.id],
          source: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        });
        await initResult.destroy();

        // Inject marketplace into config (fixture setup for Phase 2)
        await injectMarketplaceIntoConfig(projectDir, fixture.marketplaceName);

        // Phase 2: Edit -- switch ONLY the first skill to plugin mode.
        editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await editWizard.build.passThroughAllDomains();
        await sources.waitForReady();

        // The row is a two-state control: Local or Plugin, captioned in the cells themselves.
        // Asserted before the switch, so the move below is a move between exactly those two.
        const controlFrame = sources.getScreen();
        expect(
          controlFrame,
          `the Sources row must offer a Local cell. Screen:\n${controlFrame}`,
        ).toContain(STEP_TEXT.INSTALL_MODE_LOCAL);
        expect(
          controlFrame,
          `the Sources row must offer a Plugin cell. Screen:\n${controlFrame}`,
        ).toContain(STEP_TEXT.INSTALL_MODE_PLUGIN);
        expect(
          controlFrame,
          `the cells name the install MODE, not the source the mode installs from. Screen:\n${controlFrame}`,
        ).not.toContain(STEP_TEXT.SOURCE_DISPLAY_EJECT);
        expect(
          controlFrame.indexOf(E2E_SKILL.react.display),
          `the captions belong to the cells, so nothing captions them above the grid. Screen:\n${controlFrame}`,
        ).toBeLessThan(controlFrame.indexOf(STEP_TEXT.INSTALL_MODE_LOCAL));

        // Arrow right from Local to Plugin on the first skill's row
        await sources.moveSourceColumnRight();
        // Space to commit plugin mode for this skill only
        await sources.selectFocusedSourceCell();

        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");

        // confirmAwaiting, not confirm(): this test needs EDIT_SUCCESS alone
        // in raw PTY output on the TIMEOUTS.PLUGIN_INSTALL budget a real
        // `claude plugin install` round-trip takes. confirm() would accept
        // EDIT_UNCHANGED too, off the xterm buffer, on half the budget.
        const editResult = await confirm.confirmAwaiting(
          STEP_TEXT.EDIT_SUCCESS,
          TIMEOUTS.PLUGIN_INSTALL,
        );

        expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Which direction the switch went, and how many skills it took. The
        // alternation `/[Ss]witch|[Ii]nstall/` that stood here passed on either
        // word, so it could not tell a switch to plugin mode from a switch back —
        // nor a per-skill switch from the bulk one the sibling spec drives.
        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );

        // Structural, not a substring of the whole config text: `toContain(name)`
        // was satisfied by the `marketplace` field `injectMarketplaceIntoConfig`
        // wrote during SETUP, whether or not any skill's `source` moved.
        const switchedEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
        expect(switchedEntries.map((entry) => entry.source)).toStrictEqual([
          fixture.marketplaceName,
        ]);

        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
