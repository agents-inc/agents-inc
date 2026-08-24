import { CLI } from "../fixtures/cli.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createPermissionsFile,
  ensureBinaryExists,
  isClaudeCLIAvailable,
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

      ({ tempDir, fakeHome, projectDir } = await createTestEnvironment({ permissions: false }));
    }, TIMEOUTS.SETUP_DUAL);

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    afterAll(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      await cleanupFixture(fixture);
    });

    /**
     * CURRENTLY RED, deliberately. The assertion that carries the red is the first
     * config check in Phase 2:
     *
     *     await expect({ dir: fakeHome }).toHaveConfig({ agents: ["web-developer"] });
     *
     * which fails with `Expected config.ts to contain agent "web-developer" but it
     * does not`. Toggling the sub-agent to global scope on the Agents step does not
     * put it in the GLOBAL config: it stays in the project config alongside
     * `api-developer`, so the scope split the wizard rendered is not the one it
     * wrote. Everything before that point — including the init announcing
     * `INIT_SUCCESS` — passes, so the red is about where the agent landed, not about
     * the wizard failing to run.
     *
     * Verified 2026-08-08 by running this spec as `it` rather than `it.fails`.
     */
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
          source: fixture,
          projectDir,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        // Stack -> Domain -> Build
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Web domain -- toggle web-framework-react to global scope, focused
        // explicitly rather than relying on where the grid opens.
        await build.focusSkill(E2E_SKILL.react.display);
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

        const initRaw = initResultObj.rawOutput;

        // P1-A: Init exited successfully
        expect(initExitCode).toBe(EXIT_CODES.SUCCESS);

        // P1-B: the wizard announced the install. Two generic absences stood here
        // ("ENOENT", "Failed to"); neither could tell a completed install from one
        // that failed with different wording, and P1-A already carries "exited 0".
        expect(initRaw).toContain(STEP_TEXT.INIT_SUCCESS);

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
          contains: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          notContains: [E2E_SKILL.hono.id],
        });

        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: [E2E_SKILL.hono.id, "meta-reviewing"],
          notContains: [E2E_SKILL.react.id],
        });

        // ================================================================
        // Phase 3: Run compile and verify scope preserved
        // ================================================================

        const compileResult = await CLI.run(
          ["compile"],
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
          contains: [E2E_SKILL.react.id],
          notContains: [E2E_SKILL.hono.id],
        });
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: [E2E_SKILL.hono.id],
          notContains: [E2E_SKILL.react.id],
        });
      },
    );
  },
);
