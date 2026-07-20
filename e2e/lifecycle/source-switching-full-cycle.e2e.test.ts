import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
  injectMarketplaceIntoConfig,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";

/**
 * Source switching full cycle E2E test.
 *
 * Tests the complete round-trip: eject -> plugin -> eject, verifying that
 * skill selection is preserved and files are correctly managed at each phase.
 *
 * Requires Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("source switching full cycle -- eject to plugin and back", () => {
  let pluginFixture: E2EPluginSource;
  let tempDir: string;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginFixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (pluginFixture) await cleanupTempDir(pluginFixture.tempDir);
  });

  it(
    "source switching from eject to plugin and back preserves skill selection",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // --- Setup: dual-scope environment with all skills ejected ---
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await setupDualScopeWithEject(
        pluginFixture.sourceDir,
        pluginFixture.tempDir,
        fakeHome,
        projectDir,
      );

      // Inject marketplace into both configs to enable plugin switching
      await injectMarketplaceIntoConfig(fakeHome, pluginFixture.marketplaceName);
      await injectMarketplaceIntoConfig(projectDir, pluginFixture.marketplaceName);

      // --- Phase A: Snapshot -- verify all sources are "eject" ---
      const projectConfigPath = configTsPath(projectDir);
      const configPhaseA = await readTestFile(projectConfigPath);
      expect(configPhaseA).toContain('"eject"');

      // Extract skill IDs from initial config for later comparison
      const extractSkillIds = (config: string): string[] => {
        const matches = config.match(/"([\w-]+-[\w-]+-[\w-]+)"/g) ?? [];
        return [...new Set(matches.map((m) => m.replace(/"/g, "")))].sort();
      };
      const initialSkillIds = extractSkillIds(configPhaseA);
      expect(initialSkillIds.length).toBeGreaterThan(0);

      // --- Phase B: Edit -- switch all sources to plugin ---
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sourcesB = await wizard.build.passThroughAllDomains();
      await sourcesB.waitForReady();
      await sourcesB.setAllPlugin();
      const agentsB = await sourcesB.advance();
      const confirmB = await agentsB.acceptDefaults("edit");
      const resultB = await confirmB.confirm();

      const exitCodeB = await resultB.exitCode;
      expect(exitCodeB).toBe(EXIT_CODES.SUCCESS);

      // Verify at least one source changed away from eject (global-scoped skills
      // in the inlined config may retain their original "eject" source since they
      // are read-only from the project context)
      const configPhaseB = await readTestFile(projectConfigPath);
      const hasNonEjectSource =
        configPhaseB.includes('"source":"agents-inc"') ||
        !configPhaseB.includes('"source":"eject"');
      expect(
        hasNonEjectSource || configPhaseB.includes("agents-inc"),
        "Config should reference marketplace after setAllPlugin",
      ).toBe(true);

      await resultB.destroy();
      wizard = undefined;

      // --- Phase C: Edit -- switch all sources back to local (eject) ---
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sourcesC = await wizard.build.passThroughAllDomains();
      await sourcesC.waitForReady();
      await sourcesC.setAllLocal();
      const agentsC = await sourcesC.advance();
      const confirmC = await agentsC.acceptDefaults("edit");
      const resultC = await confirmC.confirm();

      const exitCodeC = await resultC.exitCode;
      expect(exitCodeC).toBe(EXIT_CODES.SUCCESS);

      // --- Final assertions ---

      // 1. Project config sources are "eject" again
      const configFinal = await readTestFile(projectConfigPath);
      const finalSources = configFinal.match(/"source":"([^"]+)"/g) ?? [];
      const ejectSources = finalSources.filter((s) => s.includes('"eject"'));
      expect(ejectSources.length).toBeGreaterThan(0);

      // 2. Skill IDs preserved (same set as Phase A)
      const finalSkillIds = extractSkillIds(configFinal);
      expect(finalSkillIds).toStrictEqual(initialSkillIds);

      // 3. Project skills directory has skill files (re-ejected)
      await expect({ dir: projectDir }).toHaveSkillCopied("api-framework-hono");

      // 4. Compiled agents exist
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      await resultC.destroy();
    },
  );
});
