import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readAllSkillEntries,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Install-mode full cycle E2E test.
 *
 * Tests the complete round-trip: eject -> plugin -> eject, verifying that
 * skill selection is preserved and files are correctly managed at each phase.
 *
 * Requires Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode full cycle -- eject to plugin and back", () => {
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
    await cleanupFixture(pluginFixture);
  });

  it(
    "switching install mode from eject to plugin and back preserves skill selection",
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

      // The entries the setup wrote, read structurally. An in-file regex extractor
      // stood here with a `length > 0` floor beneath it — an untested parser whose
      // output nothing checked, guarded by a check any non-empty result passes.
      const initialEntries = await readAllSkillEntries(projectDir);
      expect(
        initialEntries.map((entry) => entry.id),
        "the dual-scope setup must install hono into the project scope",
      ).toContain(E2E_SKILL.hono.id);

      // --- Phase B: Edit -- switch every EDITABLE source to plugin ---
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

      // The project's own hono entry is the half this session legitimately owns, so it is
      // where the switch must land. Phase A left it on "eject" (`initialEntries`, compared
      // exhaustively at the end), so naming the marketplace here is a claim about the change
      // rather than about the pre-state — and it is the FIXTURE's marketplace, not the public
      // default: `createE2EPluginSource` names it `e2e-test-<timestamp>`, so a literal
      // "agents-inc" here can never be produced by this run and would pin nothing.
      const projectHonoPhaseB = (await readAllSkillEntries(projectDir)).find(
        (entry) => entry.id === E2E_SKILL.hono.id && entry.scope === "project",
      );
      expect(
        projectHonoPhaseB,
        "the project-owned hono entry must name the marketplace this fixture published",
      ).toStrictEqual({
        id: E2E_SKILL.hono.id,
        scope: "project",
        origin: pluginFixture.marketplaceName,
      });

      await resultB.destroy();
      wizard = undefined;

      // --- Phase C: Edit -- switch every EDITABLE source back to local (eject) ---
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

      // 1+2. Every entry is back exactly as Phase A left it — same ids, same scopes,
      // same sources. `ejectSources.length > 0` stood here and passed while every
      // other entry stayed on the marketplace.
      expect(
        await readAllSkillEntries(projectDir),
        "the round trip must restore every entry, not merely some of them",
      ).toStrictEqual(initialEntries);

      // 3. Project skills directory has skill files (re-ejected)
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

      // 4. Compiled agents exist
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      await resultC.destroy();
    },
  );
});
