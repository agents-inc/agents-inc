import { CLI } from "../fixtures/cli.js";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, DIRS, EXIT_CODES } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
} from "../helpers/test-utils.js";

/**
 * Plugin scope lifecycle E2E test: Init with mixed scopes -> Verify agent content -> Edit -> Verify preservation.
 *
 * Requires Claude CLI (plugin mode). Skipped when not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "plugin scope lifecycle: init with mixed scopes -> verify agent content -> edit -> verify preservation",
  () => {
    let fixture: E2EPluginSource;
    let tempDir: string;
    let fakeHome: string;
    let projectDir: string;
    let wizard: InitWizard | undefined;

    beforeAll(async () => {
      await ensureBinaryExists();
      fixture = await createE2EPluginSource();

      tempDir = await createTempDir();
      fakeHome = path.join(tempDir, "fake-home");
      projectDir = path.join(fakeHome, "project");

      await mkdir(fakeHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
    }, TIMEOUTS.SETUP * 2);

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    afterAll(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      if (fixture) await cleanupTempDir(fixture.tempDir);
    });

    it.fails(
      "should init with mixed scopes, verify agent content, and verify preservation (expected fail -- scope routing bugs)",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Init wizard with scope toggling
        // ================================================================

        await createPermissionsFile(fakeHome);
        await createPermissionsFile(projectDir);

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          env: { HOME: fakeHome },
          rows: 60,
          cols: 120,
        });

        // Stack -> Domain -> Build
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Web domain -- toggle web-framework-react to global scope
        await build.toggleScopeOnFocusedSkill();
        await build.advanceDomain();

        // API domain (pass through)
        await build.advanceDomain();

        // Shared domain (pass through)
        const sources = await build.advanceToSources();

        // Sources -- accept recommended
        await sources.waitForReady();
        const agents = await sources.advance();

        // Agents step -- toggle web-developer to global scope
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("init");

        // Confirm
        const initResultObj = await confirm.confirm();
        const initExitCode = await initResultObj.exitCode;

        const initOutput = initResultObj.output;
        const initRaw = initResultObj.rawOutput;

        // P1-A: Init exited successfully
        expect(initExitCode).toBe(EXIT_CODES.SUCCESS);

        // P1-B: No errors in output
        expect(initRaw).not.toContain("ENOENT");
        expect(initOutput).not.toContain("Failed to");

        await initResultObj.destroy();

        // ================================================================
        // Phase 2: Verify initial state
        // ================================================================

        // P2-A+B: Config scope split — global has web-developer, project has api-developer
        await expect({ dir: fakeHome }).toHaveConfig({ agents: ["web-developer"] });
        await expect({ dir: projectDir }).toHaveConfig({ agents: ["api-developer"] });

        // --- Scope routing ---
        await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
        await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");

        await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
        await expect({ dir: fakeHome }).not.toHaveCompiledAgent("api-developer");

        // --- Agent content assertions ---
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          notContains: ["api-framework-hono"],
        });

        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: ["api-framework-hono", "meta-reviewing"],
          notContains: ["web-framework-react"],
        });

        // ================================================================
        // Phase 3: Run compile and verify scope preserved
        // ================================================================

        const compileResult = await CLI.run(
          ["compile", "--source", fixture.sourceDir],
          { dir: projectDir },
          { env: { HOME: fakeHome } },
        );
        expect(compileResult.exitCode, `compile failed: ${compileResult.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );

        // Re-verify scope routing after recompilation
        await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
        await expect({ dir: projectDir }).not.toHaveCompiledAgent("web-developer");
        await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
        await expect({ dir: fakeHome }).not.toHaveCompiledAgent("api-developer");

        // Re-verify content after recompilation
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["web-framework-react"],
          notContains: ["api-framework-hono"],
        });
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: ["api-framework-hono"],
          notContains: ["web-framework-react"],
        });
      },
    );
  },
);
