import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";

/**
 * E2E tests for the init wizard in plugin mode.
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The stack's whole sub-agent roster as compiled filenames, derived from the
 * stack definition rather than retyped. Replaces the parameterless
 * `toHaveCompiledAgents()`, which proved only that the directory held at least
 * one `.md` — an install that compiled the wrong agent passed it.
 */
const COMPILED_AGENT_FILES = E2E_STACK_AGENTS.map((agent) => `${agent}.md`);

describe.skipIf(!claudeAvailable)("init wizard — plugin mode", () => {
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

  describe("plugin installation happy path", () => {
    it(
      "should complete plugin-mode init and install plugins",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
        expect(output).toContain("skill plugins");
        expect(output).toContain(STEP_TEXT.PLUGIN_NATIVE);
        expect(output).toContain(`Installed ${E2E_SKILL.react.id}@${fixture.marketplaceName}`);
        expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);

        await expect(result.project).toHaveConfig({ agents: ["web-developer"] });
        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );

    it(
      "should generate config.ts with marketplace source",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();

        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
          compiledAgents: [],
        });

        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );

    it("should compile agents", { timeout: TIMEOUTS.PLUGIN_TEST }, async () => {
      wizard = await InitWizard.launchInProject({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
      });
      const result = await wizard.completeWithDefaults();

      await expectPhaseSuccess(
        { project: { dir: wizard.globalHome }, exitCode: result.exitCode },
        { compiledAgents: ["web-developer"] },
      );
    });

    it(
      "should display completion details after install",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();
        await result.exitCode;

        const output = result.output;
        expect(output).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
        expect(output).toContain(STEP_TEXT.CONFIGURATION_LABEL);

        await expect(result.project).toHaveConfig({ agents: ["web-developer"] });
        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );
  });

  describe("marketplace registration", () => {
    it(
      "should register or skip marketplace without error",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        // `not.toContain("Failed to")` used to stand here. It is satisfied by a
        // run that died before printing anything, and the success sentinel above
        // already carries the claim.
        const output = result.output;
        expect(output).toContain(STEP_TEXT.INIT_SUCCESS);

        expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );
  });

  /**
   * Plugin install intent is inviolable: a source with no marketplace.json
   * must hard-error, not silently fall back to eject/local copy.
   * See feedback_no_plugin_to_eject_fallback.md.
   *
   * This suite complements the init scenario in edit-plugin-hard-error.e2e.test.ts
   * by asserting filesystem state integrity (no `.claude-src/` created, existing
   * `.claude/settings.json` untouched) in addition to exit code + output.
   */
  describe("hard error when source has no marketplace", () => {
    let localSource: E2ESource;
    let projectDir: string | undefined;

    beforeAll(async () => {
      localSource = await createE2ESource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(localSource);
    });

    afterEach(async () => {
      if (projectDir) await cleanupTempDir(projectDir);
      projectDir = undefined;
    });

    it(
      "should hard-error and leave project filesystem untouched",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        // Pre-create the project dir so we can snapshot state before launch.
        // InitWizard.launch writes `.claude/settings.json` via createPermissionsFile
        // into this dir before spawning the session; that file must remain
        // byte-identical on hard-error.
        projectDir = await createTempDir();

        wizard = await InitWizard.launch({
          projectDir,
          source: { sourceDir: localSource.sourceDir, tempDir: localSource.tempDir },
        });

        const settingsPath = path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
        const settingsBefore = await readTestFile(settingsPath);

        // Step through manually; confirm() would wait for a success banner that
        // will never arrive because installPluginsStep must hard-error.
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();
        const sources = await build.passThroughAllDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirmExpectingExit();

        expect(await result.exitCode).toBe(EXIT_CODES.ERROR);

        const output = result.output;
        expect(output).toContain("marketplace could not be resolved");
        // Old silent fallback emitted "Skills copied to:" — it must be absent.
        expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
        expect(output).not.toContain(STEP_TEXT.INIT_SUCCESS);

        // Filesystem integrity: init must not create `.claude-src/` on
        // hard-error, and the pre-existing permissions file must remain
        // byte-identical.
        const claudeSrcExists = await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC));
        expect(claudeSrcExists).toBe(false);

        const settingsAfter = await readTestFile(settingsPath);
        expect(settingsAfter).toStrictEqual(settingsBefore);
      },
    );
  });

  describe("plugin scope routing", () => {
    it(
      "should install plugin skills with correct scope routing",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(`Installed ${E2E_SKILL.react.id}@${fixture.marketplaceName}`);
        expect(output).toContain(`Installed ${E2E_SKILL.vitest.id}@${fixture.marketplaceName}`);
        expect(output).toContain("skill plugins");
        expect(output).not.toContain("Failed to install plugin");

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        });
        await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("web-developer");
        await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("api-developer");
      },
    );

    it(
      "should install project-scoped plugins correctly in mixed scope mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        // Navigate through wizard, toggling first skill to project scope
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Toggle web-framework-react to project scope, focused explicitly rather
        // than relying on where the grid opens.
        await build.focusSkill(E2E_SKILL.react.display);
        await build.toggleScopeOnFocusedSkill();
        const sources = await build.passThroughAllDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
        expect(output).toContain(`Installed ${E2E_SKILL.react.id}@${fixture.marketplaceName}`);
        expect(output).not.toContain("Failed to install plugin");

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
        });
        await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("web-developer");
      },
    );
  });

  describe("mixed install mode", () => {
    it(
      "should install plugin skills as plugins and local skills locally in mixed mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        // Navigate through wizard, set one skill to local in sources step
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();
        const sources = await build.passThroughAllDomains();

        // Toggle one skill to local source
        await sources.selectFocusedSourceCell();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const output = result.output;
        expect(output).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);

        // The local-sourced skill should be copied locally. A default
        // (global-scope) install writes it under the global HOME.
        await expect({ dir: wizard.globalHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        // Config should reflect the selected skills
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
        });

        // Agents should still be compiled
        await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
