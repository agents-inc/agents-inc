import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createTestEnvironment, initGlobal } from "../fixtures/dual-scope-helpers.js";
import { cleanupTempDir, ensureBinaryExists, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";

const REACT_SKILL_ID = "web-framework-react";
const VUE_SKILL_ID = "web-framework-vue-composition-api";
const VUE_LABEL = "Vue Composition Api";
const FRAMEWORK_CATEGORY_LABEL = "Framework";

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
 * Finding: .ai-docs/agent-findings/2026-04-16-silent-plugin-install-skip-on-missing-marketplace.md
 * User memory: feedback_no_plugin_to_eject_fallback.md
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init -> dashboard -> edit: plugin install must run", () => {
  let fixture: E2EPluginSource;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
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
   * (see todo/D-226-sandbox-home-cwd-collapse.md), forcing
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

        const phaseA = await initGlobal(fixture.sourceDir, fixture.tempDir, fakeHome);
        expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

        const baselinePluginKey = `web-framework-react@${fixture.marketplaceName}`;
        await expect({ dir: fakeHome }).toHaveConfig({ skillIds: [REACT_SKILL_ID] });
        await expect({ dir: fakeHome }).toHavePlugin(baselinePluginKey);

        // --- Phase 2: dashboard → Edit at genuine PROJECT scope ---

        dashboard = await InitWizard.launchForDashboard({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          env: { HOME: fakeHome },
        });
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

        const build = await dashboard.selectEdit();

        // React (installed globally) is the sole selected framework in the
        // exclusive category, rendered as an inherited-global entry.
        expect(await build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL)).toBe(1);

        // Selecting Vue — a DIFFERENT skill in the exclusive Framework category —
        // at project scope must be rejected up-front: the global React install
        // cannot be evicted from the single-choice slot from project scope.
        await build.selectSkill(VUE_LABEL);
        expect(
          build.getOutput(),
          "selecting a conflicting exclusive-category skill at project scope must be blocked with a toast",
        ).toContain(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);

        // React remains the sole selected framework; Vue was never added.
        expect(
          await build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL),
          "blocked selection must leave React the sole selected framework",
        ).toBe(1);

        // Complete the edit — no framework change was applied.
        const sources = await build.passThroughAllDomainsGeneric();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const editResult = await confirm.confirm();
        expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // --- Phase 2 assertions: global install untouched, Vue never added ---

        const addedPluginKey = `web-framework-vue-composition-api@${fixture.marketplaceName}`;

        // Global config still carries React and NOT Vue.
        const globalConfig = await loadProjectConfigFromDir(fakeHome);
        expect(globalConfig, "global config.ts must exist").not.toBeNull();
        const globalSkillIds = globalConfig?.config.skills.map((s) => s.id) ?? [];
        expect(globalSkillIds).toContain(REACT_SKILL_ID);
        expect(globalSkillIds).not.toContain(VUE_SKILL_ID);

        // React plugin still enabled globally; Vue plugin never installed anywhere.
        await expect({ dir: fakeHome }).toHavePlugin(baselinePluginKey);
        await expect({ dir: fakeHome }).not.toHavePlugin(addedPluginKey);
        await expect({ dir: projectDir }).not.toHavePlugin(addedPluginKey);

        // Vue must not leak into the project config either.
        const projectConfig = await loadProjectConfigFromDir(projectDir);
        const projectSkillIds = projectConfig?.config.skills.map((s) => s.id) ?? [];
        expect(projectSkillIds).not.toContain(VUE_SKILL_ID);

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
          skills: ["web-framework-react"],
          marketplace: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          rows: 60,
          cols: 120,
        });

        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const addedPluginKey = `web-state-pinia@${fixture.marketplaceName}`;

        await expect(result.project).toHaveConfig({
          skillIds: ["web-framework-react", "web-state-pinia"],
          source: fixture.marketplaceName,
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
          skills: ["web-framework-react"],
          marketplace: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
          omitMarketplaceField: true,
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          rows: 60,
          cols: 120,
        });

        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const addedPluginKey = `web-state-pinia@${fixture.marketplaceName}`;

        // The added plugin must be installed into settings.json even though
        // the original config had no marketplace field.
        await expect(result.project).toHavePlugin(addedPluginKey);

        await expect(result.project).toHaveConfig({
          skillIds: ["web-framework-react", "web-state-pinia"],
        });

        expect(result.rawOutput).toContain("Installed");
        expect(result.rawOutput).not.toContain("Failed to install plugin");
      },
    );
  });
});
