import { CLI } from "../fixtures/cli.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createPermissionsFile,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * Plugin scope lifecycle E2E test: Init with mixed scopes -> Verify agent content -> Compile -> Verify preservation.
 *
 * Requires Claude CLI (plugin mode). Skipped when not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "plugin scope lifecycle: init with mixed scopes -> verify agent content -> edit -> verify preservation",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let tempDir: string;
    let fakeHome: string;
    let projectDir: string;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();

      ({ tempDir, fakeHome, projectDir } = await createTestEnvironment({ permissions: false }));
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      if (tempDir) await cleanupTempDir(tempDir);
      await cleanupFixture(fixture);
    });

    it(
      "should init with mixed scopes, verify agent content, and verify preservation",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Init with web-developer's half global, api-developer's in the project
        // ================================================================

        await createPermissionsFile(fakeHome);
        await createPermissionsFile(projectDir);

        const { output: initRaw } = await installFromSeed(
          store,
          "MixedScopes1",
          e2eStackPayload({
            install: "plugin",
            projectSkills: [E2E_SKILL.hono.id],
            projectAgents: [E2E_AGENT["api-developer"].name],
          }),
          { dir: projectDir, home: fakeHome },
          fixture.sourceDir,
        );

        // P1-B: the run announced the install.
        expect(initRaw).toContain(STEP_TEXT.INIT_SUCCESS);

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
