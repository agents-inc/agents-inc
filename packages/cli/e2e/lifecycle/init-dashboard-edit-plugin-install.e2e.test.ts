import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createTestEnvironment, initGlobal } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * Two related init -> dashboard -> Edit plugin scenarios:
 *
 * 1. "conflicting exclusive skill blocked at project scope" — a globally-installed
 *    framework cannot be swapped for a different one from project scope; the
 *    exclusive-swap guard in `toggleTechnology` rejects it with a toast and the
 *    global install is left untouched.
 *
 * 2. The remaining blocks are regression coverage for the silent plugin-install
 *    skip that caused `add plugin skill` to update config.ts but NEVER invoke
 *    `claude plugin install`, leaving `.claude/settings.json#enabledPlugins` out
 *    of sync with the project config. They assert the full chain:
 *      wizard add -> applyPluginChanges -> claudePluginInstall -> settings.json updated.
 *    Verifying both config.ts AND settings.json enabledPlugins is the only way to
 *    detect the original regression; the pre-fix code silently skipped the install.
 *
 * The fix is written up in changelogs/0.133.0.md under the `cc edit` silent-skip entry —
 * a release note records what a version closed and is not rewritten afterwards, so it keeps
 * resolving where a finding file may not.
 *
 * User memory: feedback_no_plugin_to_eject_fallback.md
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init -> dashboard -> edit: plugin install must run", () => {
  let fixture: E2EPluginSource;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  /**
   * A globally-installed skill in an EXCLUSIVE (single-choice) category cannot be
   * swapped out from project scope: selecting a DIFFERENT framework at project
   * scope while React is installed globally is BLOCKED with a toast, and the
   * global install is left untouched.
   *
   * React is installed at genuine GLOBAL scope (Phase 1 init runs FROM the fake
   * HOME dir, so cwd === HOME → global install). The dashboard→Edit (Phase 2)
   * runs from a PROJECT subdirectory with HOME pointing at that global home, so
   * the edit executes at genuine project scope (isEditingFromGlobalScope=false)
   * and `toggleTechnology`'s existing exclusive-swap guard fires naturally.
   *
   * Before this test set an explicit HOME it never actually exercised project
   * scope: TerminalSession's `HOME=cwd` default collapsed HOME onto projectDir
   * — the sandbox's HOME/cwd collapse, since withdrawn — forcing
   * isEditingFromGlobalScope=true — so the scenario silently ran as a GLOBAL
   * edit (where swapping the framework is legitimately allowed, dropping React)
   * while being labelled project-scope coverage.
   */
  describe("dashboard -> Edit -> conflicting exclusive skill blocked at project scope", () => {
    let dashboard: Awaited<ReturnType<typeof InitWizard.launchForDashboard>> | undefined;
    let tempDir: string | undefined;

    afterEach(async () => {
      await dashboard?.destroy();
      dashboard = undefined;
      if (tempDir) await cleanupTempDir(tempDir);
      tempDir = undefined;
    });

    it(
      "blocks swapping a globally-installed framework for a different one at project scope",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        // --- Phase 1: install React GLOBALLY (init run FROM the fake HOME) ---

        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        const phaseA = await initGlobal(fixture, fakeHome);
        expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

        const baselinePluginKey = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect({ dir: fakeHome }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
        await expect({ dir: fakeHome }).toHavePlugin(baselinePluginKey);

        // --- Phase 2: dashboard → Edit at genuine PROJECT scope ---

        dashboard = await InitWizard.launchForDashboard({
          projectDir,
          source: fixture,
          env: { HOME: fakeHome },
        });
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

        const build = await dashboard.selectEdit();

        // React (installed globally) is the sole selected framework in the
        // exclusive category, rendered as an inherited-global entry.
        expect(await build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK)).toBe(1);

        // Selecting Vue — a DIFFERENT skill in the exclusive Framework category —
        // at project scope must be rejected up-front with a toast: the global
        // React install cannot be evicted from the single-choice slot from
        // project scope. The toast is awaited on the append-only raw surface
        // anchored to a pre-press cursor, because Ink rewrites the toast row in
        // place and xterm's processed buffer can lose it before the test reads it.
        await build.selectSkillAwaiting(
          E2E_SKILL["vue-composition-api"].display,
          STEP_TEXT.GLOBAL_SKILLS_BLOCKED,
        );

        // React remains the sole selected framework; Vue was never added.
        expect(
          await build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "blocked selection must leave React the sole selected framework",
        ).toBe(1);

        // Complete the edit — no framework change was applied.
        const sources = await build.passThroughAllDomainsGeneric();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const editResult = await confirm.confirm();
        expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // --- Phase 2 assertions: global install untouched, Vue never added ---

        const addedPluginKey = `${E2E_SKILL["vue-composition-api"].id}@${fixture.marketplaceName}`;

        // Global config still carries React and NOT Vue.
        const globalConfig = await loadConfigOrFail(fakeHome);
        const globalSkillIds = globalConfig.skills.map((s) => s.id);
        expect(globalSkillIds).toContain(E2E_SKILL.react.id);
        expect(globalSkillIds).not.toContain(E2E_SKILL["vue-composition-api"].id);

        // React plugin still enabled globally; Vue plugin never installed anywhere.
        await expect({ dir: fakeHome }).toHavePlugin(baselinePluginKey);
        await expect({ dir: fakeHome }).not.toHavePlugin(addedPluginKey);
        await expect({ dir: projectDir }).not.toHavePlugin(addedPluginKey);

        // Vue must not leak into the project config either. Loaded through the
        // asserting reader: an absent project config is the failure this block
        // exists to catch, and an empty id list would satisfy the negative below.
        const projectConfig = await loadConfigOrFail(projectDir);
        expect(projectConfig.skills.map((s) => s.id)).not.toContain(
          E2E_SKILL["vue-composition-api"].id,
        );

        // The blocked selection must not have triggered a failed plugin install.
        expect(editResult.rawOutput).not.toContain("Failed to install plugin");
      },
    );
  });

  /**
   * Direct `cc edit` on an existing install (no dashboard path). Previously
   * affected by the same bug: even a direct edit skipped the plugin install
   * when the marketplace gate evaluated falsy.
   */
  describe("direct cc edit -> add plugin skill", () => {
    let wizard: EditWizard | undefined;

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    it(
      "should install the newly added plugin and update project settings.json",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });

        // Adding a plugin skill installs it via `claude plugin install`, which
        // writes enabledPlugins into HOME's settings.json. Model the edit as the
        // GLOBAL install (HOME === cwd === projectDir) so the plugin enablement
        // and the config both collapse onto projectDir and settings.json is
        // asserted where it lands.
        wizard = await EditWizard.launchInGlobal({
          projectDir: project.dir,
          source: fixture,
          ...TERMINAL_SIZE.TALL,
        });

        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const addedPluginKey = `${E2E_SKILL.pinia.id}@${fixture.marketplaceName}`;

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
          origin: fixture.marketplaceName,
        });

        await expect(result.project).toHavePlugin(addedPluginKey);
        expect(result.rawOutput).toContain("Installed");
        expect(result.rawOutput).not.toContain("Failed to install plugin");
      },
    );
  });

  /**
   * The precise regression reproduction: project config.ts has plugin-sourced
   * skills but LACKS the `marketplace` field. This is the legacy-install state
   * that made `sourceResult.marketplace` undefined, triggering the silent skip.
   *
   * After the fix, `requireMarketplace` lazily resolves the marketplace via
   * `ensureMarketplace` (reading the source's marketplace.json) and plugin
   * install proceeds. This test exists so that removing the lazy resolution
   * (or reintroducing the silent gate) immediately breaks CI.
   */
  describe("legacy config without marketplace field", () => {
    let wizard: EditWizard | undefined;

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    it(
      "should lazily resolve marketplace and install the newly added plugin",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
          omitMarketplaceField: true,
        });

        // Adding a plugin skill installs it via `claude plugin install`, which
        // writes enabledPlugins into HOME's settings.json. Model the edit as the
        // GLOBAL install (HOME === cwd === projectDir) so the plugin enablement
        // and the config both collapse onto projectDir and settings.json is
        // asserted where it lands.
        wizard = await EditWizard.launchInGlobal({
          projectDir: project.dir,
          source: fixture,
          ...TERMINAL_SIZE.TALL,
        });

        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const addedPluginKey = `${E2E_SKILL.pinia.id}@${fixture.marketplaceName}`;

        // The added plugin must be installed into settings.json even though
        // the original config had no marketplace field.
        await expect(result.project).toHavePlugin(addedPluginKey);

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
        });

        expect(result.rawOutput).toContain("Installed");
        expect(result.rawOutput).not.toContain("Failed to install plugin");
      },
    );
  });
});
