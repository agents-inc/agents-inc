import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  ensureBinaryExists,
  fileExists,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
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
    await cleanupFixture(fixture);
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

        // Web domain -- toggle web-framework-react to project scope, leave the rest
        // at global (focus it explicitly — the first-alphabetical cell is Vue).
        await build.focusSkill(E2E_SKILL.react.display);
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

  /**
   * The two migration tests run at GLOBAL edit scope (HOME == cwd == fakeHome).
   *
   * They used to drive the switch from the PROJECT directory, which is no longer a thing the
   * product does: a project edit renders an inherited global install as a locked row, the two
   * bulk set-all keys are withdrawn, and `setInstallMode` refuses a project-context call against
   * a global slot the hydration snapshot owns. Driving them from the project would therefore
   * assert that a withdrawn behaviour still happens.
   *
   * The SUBJECT survives the re-scope intact, because it was never the driving context: a
   * global-scoped skill's install-mode migration resolves its paths from its own scope, so the
   * local copy is written to and removed from `$HOME`. Global scope is where that switch is
   * legitimate, so it is where it is now pinned. The old `not.toHaveSkillCopied(projectDir)`
   * assertions are gone rather than carried over — with no project install in the run at all,
   * they would pass against an empty directory and prove nothing. The global config's recorded
   * `source` takes their place: it is the config half of the same claim, and it moves.
   */
  describe("edit source switch -- scope-aware migration", () => {
    it(
      "should copy to HOME when switching global-scope skill from plugin to local",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome } = env;

        // Phase 1: Init in plugin mode -- all skills global scope, plugin source
        initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir: fakeHome,
          env: { HOME: fakeHome },
        });

        const initResult = await initWizard.completeWithDefaults();
        expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);
        await initResult.destroy();

        const reactBefore = await readSkillEntries(fakeHome, E2E_SKILL.react.id);
        expect(
          reactBefore.map((entry) => entry.source),
          "react must start plugin-sourced",
        ).toEqual([fixture.marketplaceName]);

        // Phase 2: Edit the global install -- switch every skill to local, one row at a time
        editWizard = await EditWizard.launchInGlobal({
          projectDir: fakeHome,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
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
        expect(
          (await readSkillEntries(fakeHome, E2E_SKILL.react.id)).map((entry) => entry.source),
          "the global config must record the eject source the migration performed",
        ).toEqual([EJECT_SOURCE]);
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
        const { fakeHome } = env;

        // Phase 1: Init in eject mode -- all skills global scope
        initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir: fakeHome,
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
        if (globalConfigExists) {
          await injectMarketplaceIntoConfig(fakeHome, fixture.marketplaceName);
        }

        // Phase 2: Edit the global install -- switch every skill to plugin, one row at a time
        editWizard = await EditWizard.launchInGlobal({
          projectDir: fakeHome,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
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
        expect(rawOutput).toContain(`to ${STEP_TEXT.PLUGIN_NATIVE}`);

        // --- Assertions ---
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
        expect(
          (await readSkillEntries(fakeHome, E2E_SKILL.react.id)).map((entry) => entry.source),
          "the global config must record the marketplace source the migration performed",
        ).toEqual([fixture.marketplaceName]);
        await expect({ dir: fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

        await editResult.destroy();
      },
    );
  });
});
