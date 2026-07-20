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
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  injectMarketplaceIntoConfig,
  readTestFile,
} from "../helpers/test-utils.js";

/**
 * Source switching lifecycle E2E tests -- per-skill switching.
 *
 * Tests the full flow of switching ONE skill source mid-lifecycle:
 *   9c: Init local -> edit switch ONE skill to plugin -> verify mixed state
 *
 * These tests require the Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("source switching mid-lifecycle -- per-skill switching", () => {
  let fixture: E2EPluginSource;

  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("per-skill source switching -- mixed local and plugin", () => {
    let editWizard: EditWizard | undefined;

    afterEach(async () => {
      if (editWizard) {
        await editWizard.destroy();
        editWizard = undefined;
      }
    });

    it(
      "should support mixed source modes with per-skill switching via customize view",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        // Phase 1: Init in eject mode using page objects
        const initWizard = await InitWizard.launch({
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
        editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await editWizard.build.passThroughAllDomains();
        await sources.waitForReady();

        // Arrow right to marketplace source column for the first skill
        await sources.moveSourceColumnRight();
        // Space to select the marketplace source for this skill only
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

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toMatch(/[Ss]witch|[Ii]nstall/);

        const configPath = configTsPath(projectDir);
        expect(await fileExists(configPath)).toBe(true);
        const configContent = await readTestFile(configPath);
        expect(configContent).toContain(fixture.marketplaceName);

        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
