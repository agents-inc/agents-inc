import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * SelectedAgentName excluded global agent E2E test.
 *
 * Verifies that when a globally-installed agent is excluded at project level,
 * the project's config-types.ts still includes it in SelectedAgentName.
 * This prevents the generated union from being too narrow.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("SelectedAgentName includes excluded global agents", () => {
  let fixture: E2EPluginSource;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
    sourceDir = fixture.sourceDir;
    sourceTempDir = fixture.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string | undefined;

  afterEach(async () => {
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "should include excluded global agent in SelectedAgentName union",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;

      // Phase 1: Global init -- install with default agents
      const globalWizard = await InitWizard.launch({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase 2: Project init -- global install exists, so `cc init` lands on the
      // dashboard. Drive dashboard -> Edit -> build/sources/agents -> deselect
      // api-developer -> confirm, to produce a project config that excludes the
      // globally-installed agent.
      const dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // "Edit" is the first (default) dashboard option — press Enter to launch it.
      const build = await dashboard.selectEdit();

      // Establish project scope by toggling scope on web-framework-react in the
      // first domain (focus it explicitly — the first-alphabetical cell is Vue, an
      // unselected skill whose `s` is a silent no-op). Without a project-scoped
      // skill, no project-level .claude-src/config-types.ts is generated.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();

      // Pass through remaining domains, then sources.
      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();

      // Deselect api-developer by toggling it off (display name on screen).
      await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);

      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      await dashboard.destroy();

      // Read the project's config-types.ts
      const configTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(configTypesPath)).toBe(true);

      const content = await readTestFile(configTypesPath);

      // SelectedAgentName should include ALL agents (including the excluded one)
      // The E2E source has 2 agents: web-developer and api-developer
      expect(content).toContain("SelectedAgentName");
      expect(content).toContain("web-developer");
      expect(content).toContain("api-developer");

      // Verify the config.ts has the excluded agent marked
      const configContent = await readTestFile(configTsPath(projectDir));
      expect(configContent).toContain("excluded");
    },
  );
});
