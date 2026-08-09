import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";

/**
 * Init wizard interaction tests: domain deselection, agent deselection,
 * and scope toggling via S hotkey.
 *
 * The entire suite is skipped when the Claude CLI is not available because
 * the wizard's default install mode is "plugin", which requires a marketplace
 * and a working Claude CLI for plugin registration. Tests use a plugin source
 * (built via `createE2EPluginSource`) so the wizard's default install path
 * succeeds end-to-end — these tests verify interaction behavior (domain/agent
 * toggling, scope hotkey), not install mode.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init wizard — interactions", () => {
  let fixture: E2EPluginSource;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("domain deselection", () => {
    it(
      "should not install skills from a deselected domain",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        // Select E2E Test Stack
        const domain = await wizard.stack.selectFirstStack();

        // Deselect API domain
        await domain.toggleDomain(STEP_TEXT.DOMAIN_API);

        // Continue with only Web selected
        const build = await domain.advance();

        // Advance through remaining domains (Web + Methodology, no API) to sources
        const sources = await build.passThroughWebAndMethodologyDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        // API skills should NOT be in config
        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
        });

        // The output should NOT contain API-only skills
        const output = result.output;
        expect(output).not.toContain(E2E_SKILL.hono.id);
      },
    );
  });

  describe("agent deselection", () => {
    it("should not compile a deselected agent", { timeout: TIMEOUTS.INTERACTIVE }, async () => {
      wizard = await InitWizard.launchInProject({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
      });

      // Select stack, accept domains, advance through build step
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();

      // Deselect API Developer agent
      await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);

      const confirm = await agents.advance("init");
      const result = await confirm.confirm();

      // api-developer should NOT be compiled (it was deselected). Config lands
      // under projectDir; the compiled agents (default global scope) land under
      // the wizard's global HOME.
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        agents: [...E2E_AGENTS.WEB],
      });
      await expectPhaseSuccess(
        { project: { dir: wizard.globalHome }, exitCode: result.exitCode },
        { compiledAgents: [...E2E_AGENTS.WEB] },
      );
    });
  });

  describe("scope toggle via S hotkey", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it(
      "should toggle skill scope from global to project during build step",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          env: { HOME: fakeHome },
        });

        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Focus react (the grid's first-alphabetical cell is Vue, not react), then
        // press S to toggle its scope (default is "global").
        await build.focusSkill(E2E_SKILL.react.display);
        await build.toggleScopeOnFocusedSkill();

        // The scope badge should show "P" for project
        const buildOutput = build.getOutput();
        expect(buildOutput).toContain("P ");

        // Complete the wizard
        const sources = await build.passThroughAllDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        // Config should contain the skill with project scope
        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
        });

        // Agents should be compiled after wizard completion (to global home since agents default to global)
        await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
        await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");
      },
    );
  });
});
