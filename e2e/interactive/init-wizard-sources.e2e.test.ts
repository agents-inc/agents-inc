import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import type { SourcesStep } from "../pages/steps/sources-step.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { STEP_TEXT, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { cleanupTempDir, ensureBinaryExists, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";

const claudeAvailable = await isClaudeCLIAvailable();

describe("init wizard — source management", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  /**
   * Navigate to the sources step via: Stack -> Domain -> Build (all domains) -> Sources
   */
  async function navigateToSources(options?: {
    source?: { sourceDir: string; tempDir: string };
  }): Promise<{
    wizard: InitWizard;
    sources: SourcesStep;
  }> {
    const w = await InitWizard.launch(options);
    const domain = await w.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomains();
    return { wizard: w, sources };
  }

  describe("source management in wizard", () => {
    it("should open settings overlay when pressing S on the sources step", async () => {
      const { wizard: w, sources } = await navigateToSources();
      wizard = w;

      await sources.openSettings();

      const output = sources.getOutput();
      expect(output).toContain(STEP_TEXT.CONFIGURED_MARKETPLACES);
      expect(output).toContain(STEP_TEXT.ADD_SOURCE);
    });

    it("should show add source UI when pressing A in settings", async () => {
      const { wizard: w, sources } = await navigateToSources();
      wizard = w;

      await sources.openSettings();
      await sources.pressAddSource();

      const output = sources.getOutput();
      expect(output).toContain("ENTER submit");
      expect(output).toContain("ESC cancel");
    });

    it("should not remove the default source when pressing DEL", async () => {
      const { wizard: w, sources } = await navigateToSources();
      wizard = w;

      await sources.openSettings();
      await sources.pressDeleteSource();

      const output = sources.getOutput();
      expect(output).toContain("Public");
      expect(output).toContain("(default)");
    });

    it("should return to sources step when pressing ESC in settings", async () => {
      const { wizard: w, sources } = await navigateToSources();
      wizard = w;

      await sources.openSettings();
      await sources.closeSettings();

      const output = sources.getOutput();
      expect(output).not.toContain(STEP_TEXT.CONFIGURED_MARKETPLACES);
    });
  });

  describe("source management — outcome verification", () => {
    it(
      "should complete install with all local sources after pressing L hotkey",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const { wizard: w, sources } = await navigateToSources();
        wizard = w;

        // Press "l" to set ALL sources to local
        await sources.setAllLocal();

        // Continue through: Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(STEP_TEXT.SKILLS_COPIED_TO);
        expect(output).not.toContain(STEP_TEXT.INSTALLING_PLUGINS);

        await expect(result.project).toHaveConfig({
          skillIds: ["web-framework-react"],
          agents: ["web-developer"],
          source: "eject",
        });
        await expect(result.project).toHaveCompiledAgent("web-developer");
        await expect(result.project).toHaveSkillCopied("web-framework-react");
      },
    );

    describe.skipIf(!claudeAvailable)("plugin-mode preservation", () => {
      let pluginFixture: E2EPluginSource;

      beforeAll(async () => {
        pluginFixture = await createE2EPluginSource({ marketplaceName: "agents-inc" });
      }, TIMEOUTS.SETUP);

      afterAll(async () => {
        if (pluginFixture) await cleanupTempDir(pluginFixture.tempDir);
      });

      it(
        "should preserve source settings after open/close settings overlay and completing wizard",
        { timeout: TIMEOUTS.INTERACTIVE },
        async () => {
          const { wizard: w, sources } = await navigateToSources({
            source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
          });
          wizard = w;

          // Open then close settings overlay without changes
          await sources.openSettings();
          await sources.closeSettings();

          // Continue through rest of wizard
          const agents = await sources.advance();
          const confirm = await agents.acceptDefaults("init");
          const result = await confirm.confirm();

          await expectPhaseSuccess(result, {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "agents-inc",
            compiledAgents: ["web-developer"],
          });
        },
      );
    });
  });
});
