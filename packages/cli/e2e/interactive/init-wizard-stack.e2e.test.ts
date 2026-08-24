import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_AGENTS, E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  isClaudeCLIAvailable,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The stack's whole sub-agent roster as compiled filenames, derived from the
 * stack definition rather than retyped. Replaces the parameterless
 * `toHaveCompiledAgents()`, which proved only that the agents directory held at
 * least one `.md` — an install that compiled one of the two passed it.
 */
const COMPILED_AGENT_FILES = E2E_STACK_AGENTS.map((agent) => `${agent}.md`);

describe("init wizard — stack flow", () => {
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("stack selection happy path", () => {
    it("should display the wizard with stack options and scratch choice", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain(STEP_TEXT.START_FROM_SCRATCH);
    });

    it("should show the E2E test stack from source config", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain("E2E Test Stack");
      expect(output).toContain("Minimal stack for E2E testing");
    });

    it("should navigate stacks with arrow keys", async () => {
      wizard = await InitWizard.launch();

      await wizard.stack.navigateDown();

      const output = wizard.stack.getOutput();
      expect(output).toContain(STEP_TEXT.START_FROM_SCRATCH);
    });

    it("should select stack and advance to domain selection", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();

      const output = domain.getOutput();
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
    });
  });

  describe.skipIf(!claudeAvailable)("stack selection happy path — plugin install", () => {
    let pluginSource: E2EPluginSource | undefined;

    beforeAll(async () => {
      pluginSource = await createE2EPluginSource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
    });

    it(
      "should complete a full stack-based init flow with defaults",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: pluginSource!,
        });
        const result = await wizard.completeWithDefaults();

        // config.ts (skills + marketplace source) stays under the project dir;
        // compiled agents land in the wizard's global HOME.
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: pluginSource!.marketplaceName,
        });
        const globalProject = { dir: wizard.globalHome };
        for (const agent of E2E_AGENTS.WEB_AND_API) {
          await expect(globalProject).toHaveCompiledAgent(agent);
        }
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          skills: [`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`],
        });
      },
    );

    it(
      "should display completion details after install",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: pluginSource!,
        });
        const result = await wizard.completeWithDefaults();

        await result.exitCode;

        const output = result.output;
        expect(output).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
        expect(output).toContain(STEP_TEXT.CONFIGURATION_LABEL);
        await expect(result.project).toHaveConfig({ agents: ["web-developer"] });
        const globalProject = { dir: wizard.globalHome };
        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
        await expect(globalProject).toHaveCompiledAgentContent("web-developer", {
          contains: [E2E_SKILL.react.id],
        });
      },
    );
  });

  describe("local install verification", () => {
    it(
      "should eject the stack's skills, write them to config and report where they went",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        wizard = await InitWizard.launchInProject();
        const result = await completeWithLocalSources(wizard);

        // Default-scope installs eject skills and compile agents into the
        // wizard's global HOME, so installed-content assertions read there;
        // config.ts stays under the project dir.
        const globalProject = { dir: wizard.globalHome };
        await expectPhaseSuccess(
          { project: globalProject, exitCode: result.exitCode },
          { copiedSkills: [E2E_SKILL.react.id] },
        );
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: "eject",
        });
        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );

        const output = result.output;
        expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
        expect(output).toContain(STEP_TEXT.SKILLS_COPIED_TO);
        expect(output).toContain(".claude/skills");
        // A first install has nothing to archive, so the archive path must stay
        // silent. Specific rather than generic: the id of any skill carrying
        // "error" would trip a broader negative.
        expect(output).not.toContain("Failed to archive");
      },
    );
  });

  describe("stack customize flow", () => {
    it("should show build step with stack skills when choosing customize", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      const output = build.getOutput();
      expect(output).toContain(STEP_TEXT.BUILD);
    });
  });

  describe("stack skill restoration on domain re-toggle", () => {
    it("should restore stack skills when a domain is deselected and re-selected", async () => {
      wizard = await InitWizard.launch();

      // Select the E2E Test Stack
      const domain = await wizard.stack.selectFirstStack();

      // Deselect API domain then re-select it
      await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
      await domain.toggleDomain(STEP_TEXT.DOMAIN_API);

      // Continue to build step
      const build = await domain.advance();

      // Advance through Web domain
      await build.advanceDomain();

      // The API domain should show restored stack skills, by the title the fixture
      // paints rather than a fragment of the id.
      const output = build.getOutput();
      expect(output).toContain(E2E_SKILL.hono.display);
    });

    it("should not restore skills in scratch flow when domain is re-toggled", async () => {
      wizard = await InitWizard.launch();

      // Select "Start from scratch"
      const domain = await wizard.stack.selectScratch();

      // Deselect API then re-select it
      await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
      await domain.toggleDomain(STEP_TEXT.DOMAIN_API);

      // Continue to build step
      const build = await domain.advance();

      // Select required skill in Web domain and advance
      await build.selectSkill(E2E_SKILL.react.display);
      await build.advanceDomain();

      // In scratch flow, no stack snapshot exists — API domain should have 0 selected skills
      const output = build.getOutput();
      expect(output).toContain("(0 of 1)");
    });
  });
});
