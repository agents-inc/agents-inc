import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  ensureBinaryExists,
  fileExists,
  injectMarketplaceIntoConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Scope-aware local skill copying E2E tests.
 *
 * These tests verify that local skill copies respect per-skill scope:
 *   - Project-scoped local skills -> <project>/.claude/skills/
 *   - Global-scoped local skills  -> ~/.claude/skills/
 *
 * All tests require the Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("scope-aware local skill copying", () => {
  let fixture: E2EPluginSource;

  let tempDir: string | undefined;
  let initWizard: InitWizard | undefined;
  let editWizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
  });

  afterEach(async () => {
    await editWizard?.destroy();
    editWizard = undefined;
    await initWizard?.destroy();
    initWizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("init mixed mode -- scope-aware local copy", () => {
    it(
      "should copy project-scoped local skills to project dir and global-scoped local skills to HOME dir",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        // Stack -> Domain -> Build
        const domain = await initWizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Web domain -- toggle first skill to project scope, leave second at global
        await build.toggleScopeOnFocusedSkill();
        await build.advanceDomain();

        // API domain (pass through)
        await build.advanceDomain();

        // Shared domain (pass through)
        const sources = await build.advanceToSources();

        // Sources -- set two skills to local (mixed mode)
        // Sort order: global skills first, project-scoped skills last.
        // Position 0 = web-testing-vitest (global), last = web-framework-react (project)
        await sources.waitForReady();
        await sources.selectFocusedSourceCell(); // Set web-testing-vitest to local (first global skill)
        await sources.navigateUp(); // Wrap to last position (project-scoped react)
        await sources.selectFocusedSourceCell(); // Set web-framework-react to local
        const agents = await sources.advance();

        // Agents -- accept defaults
        const confirm = await agents.acceptDefaults("init");

        // Confirm
        const result = await confirm.confirm();
        const exitCode = await result.exitCode;
        expect(exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // Should be mixed mode (some local, some plugin)
        expect(rawOutput).toContain("Mixed");

        // --- Scope-aware copy assertions ---
        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

        await result.destroy();
      },
    );
  });

  describe("edit source switch -- scope-aware migration", () => {
    it(
      "should copy to HOME when switching global-scope skill from plugin to local",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Phase 1: Init in plugin mode -- all skills global scope, plugin source
        initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          env: { HOME: fakeHome },
        });

        const initResult = await initWizard.completeWithDefaults();
        expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);
        await initResult.destroy();

        // Phase 2: Edit -- switch ALL to local via "l" hotkey
        editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await editWizard.build.passThroughAllDomains();

        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();

        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        const editExitCode = await result.exitCode;
        expect(editExitCode).toBe(EXIT_CODES.SUCCESS);

        // --- Assertions ---
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

        await result.destroy();
      },
    );

    it(
      "should delete from HOME when switching global-scope skill from local to plugin",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Phase 1: Init in eject mode -- all skills global scope
        initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        // Sources -- set ALL to local
        const initResult = await completeWithLocalSources(initWizard);
        expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);
        await initResult.destroy();

        // Verify Phase 1: Skills were copied to HOME
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        // Inject marketplace so mode-migrator can install plugins
        const globalConfigExists = await fileExists(configTsPath(fakeHome));
        const projectConfigExists = await fileExists(configTsPath(projectDir));

        if (globalConfigExists) {
          await injectMarketplaceIntoConfig(fakeHome, fixture.marketplaceName);
        }
        if (projectConfigExists) {
          await injectMarketplaceIntoConfig(projectDir, fixture.marketplaceName);
        }

        // Phase 2: Edit -- switch ALL to plugin via "p" hotkey
        editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const editSources = await editWizard.build.passThroughAllDomains();

        await editSources.waitForReady();
        await editSources.setAllPlugin();
        const editAgents = await editSources.advance();

        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        const editExitCode = await editResult.exitCode;
        expect(editExitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain("Switching");
        expect(rawOutput).toContain("to plugin");

        // --- Assertions ---
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

        await editResult.destroy();
      },
    );
  });
});
