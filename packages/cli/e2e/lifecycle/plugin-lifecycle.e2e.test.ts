import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { CLI } from "../fixtures/cli.js";
import {
  isClaudeCLIAvailable,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
} from "../helpers/test-utils.js";

/**
 * Full lifecycle E2E test for plugin mode: Init -> Uninstall.
 *
 * Phase 1: Init wizard installs skills as Claude CLI plugins
 * Phase 2: Uninstall --yes removes agents and cleans up
 *
 * The entire suite is skipped when the Claude CLI is not available.
 *
 * Note: isClaudeCLIAvailable is re-exported from test-utils for skip detection.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin mode lifecycle: init -> uninstall", () => {
  let fixture: E2EPluginSource;
  let tempDir: string;
  let projectDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();

    tempDir = await createTempDir();
    projectDir = tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (fixture) await cleanupTempDir(fixture.tempDir);
  });

  it(
    "should complete full plugin lifecycle: init -> uninstall",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Plugin Init -- install skills as Claude CLI plugins
      // ================================================================

      // A default plugin-mode init installs to the global scope. Model it as the
      // GLOBAL install (HOME === cwd === projectDir) so the plugin registry,
      // settings.json and compiled agents collapse onto projectDir and the
      // follow-up uninstall command (which resolves its target from cwd) finds
      // the same content.
      const wizard = await InitWizard.launchInGlobal({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        projectDir,
      });
      const initResult = await wizard.completeWithDefaults();

      // --- Phase 1 Verification ---

      await expectPhaseSuccess(initResult, {
        skillIds: [
          "web-framework-react",
          "web-testing-vitest",
          "web-state-zustand",
          "api-framework-hono",
        ],
        agents: ["web-developer", "api-developer"],
        source: fixture.marketplaceName,
      });

      const initOutput = initResult.output;
      expect(initOutput).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
      expect(initOutput).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(initOutput).toContain(`Installed web-framework-react@${fixture.marketplaceName}`);
      expect(initOutput).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);

      // Settings file exists with permissions
      await expect({ dir: projectDir }).toHaveSettings({ hasKey: "permissions" });

      expect(initOutput).not.toContain("Failed to");

      await initResult.destroy();

      // ================================================================
      // Phase 2: Uninstall --yes -- remove agents and clean up
      // ================================================================

      const uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { AGENTSINC_SOURCE: undefined },
        },
      );

      expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(uninstallResult.stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expectCleanUninstall(projectDir, { removeConfig: true });
    },
  );
});
