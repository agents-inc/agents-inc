import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  ensureBinaryExists,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * Cross-scope lifecycle E2E test: Init Global -> Edit from Project.
 *
 * Phase 1: Runs `cc init` from HOME to create a global installation
 * Phase 2: Runs `cc edit` from a project subdirectory
 * Phase 3: Verifies global preserved, no project leakage
 *
 * Both wizard flows explicitly select eject mode on the sources step
 * (press "l"). Without explicit eject, the wizard defaults to plugin
 * mode and hard-errors because the local source has no marketplace --
 * silent plugin-to-eject fallback is forbidden.
 *
 * Architecture:
 *   tempDir/
 *     fake-home/                    <- HOME env var points here
 *       .claude-src/config.ts       <- global config
 *       .claude/agents/             <- global agents
 *       .claude/skills/             <- global skills (eject mode copies here)
 *       project/                    <- project directory (CWD for Phase 2)
 */

describe("cross-scope lifecycle: init global -> edit global from project", () => {
  let tempDir: string;
  let source: E2ESource;
  let fakeHome: string;
  let projectDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();

    ({ tempDir, fakeHome, projectDir } = await createTestEnvironment({ permissions: false }));
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    await cleanupFixture(source);
  });

  it(
    "should init globally, then edit global from project directory",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Init from HOME -- create global installation (eject)
      // ================================================================

      // Explicit eject: press "l" on the sources step so new skills are
      // eject-sourced. Without this, the wizard defaults to plugin mode
      // and hard-errors when the source has no marketplace (no silent
      // fallback per user's plugin-to-eject rule).
      const initWizard = await InitWizard.launch({
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const initResult = await completeWithLocalSources(initWizard);

      // --- Phase 1 Verification ---

      await expectPhaseSuccess(
        { project: { dir: fakeHome }, exitCode: initResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          source: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        },
      );
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", E2E_SKILL.react.id],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer"],
      });

      // The positive sentinel, not a generic absence: `not.toContain("Failed to")`
      // cannot tell a clean install from one that failed with different wording,
      // and the exit code beside it already carries "did not crash".
      expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

      await initResult.destroy();

      // ================================================================
      // Phase 2: Edit from project dir -- uses global config (eject)
      // ================================================================

      await createPermissionsFile(projectDir);

      // Explicit eject: press "l" again so any newly-sourced skills
      // stay in eject mode rather than silently flipping to plugin.
      const editWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
        env: { HOME: fakeHome },
      });
      const editSources = await editWizard.build.passThroughAllDomains();
      await editSources.waitForReady();
      await editSources.setAllLocal();
      const editAgents = await editSources.advance();
      const editConfirm = await editAgents.acceptDefaults("edit");
      const editResult = await editConfirm.confirm();

      const phase2Raw = editResult.rawOutput;

      // ================================================================
      // Phase 3: Verification -- global preserved, no project leakage
      // ================================================================

      // Global state preserved: config, agents, and skills
      await expectPhaseSuccess(
        { project: { dir: fakeHome }, exitCode: editResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          source: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        },
      );
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", E2E_SKILL.react.id],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer"],
      });

      // No project config created
      expect(await fileExists(configTsPath(projectDir))).toBe(false);

      // No project-scope skills or agents leaked
      await expectCleanUninstall(projectDir);

      // The edit ran to completion AND reported that it changed nothing — which is
      // this phase's whole subject. A generic `not.toContain("ENOENT")` stood here
      // and could not tell a completed no-op edit from an edit that never ran.
      expect(phase2Raw).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await editResult.destroy();
    },
  );
});

/**
 * Plugin-mode sibling of the eject case above: init globally in plugin mode
 * (default when a marketplace source is provided), then edit global from a
 * project subdirectory, still in plugin mode throughout.
 *
 * Plugin-mode differences vs eject:
 *  - `source` in config.ts is `fixture.marketplaceName`, not `"eject"`
 *  - No skills copied into `.claude/skills/` -- installs land in
 *    `fake-home/.claude/settings.json#enabledPlugins` instead
 *  - Toggling sources is a no-op (plugin is already the default) so the
 *    wizard traverses straight through the sources step.
 *
 * Requires Claude CLI for plugin install; skipped otherwise.
 */
describe.skipIf(!claudeAvailable)(
  "cross-scope lifecycle: init global -> edit global from project (plugin mode)",
  () => {
    let tempDir: string;
    let fixture: E2EPluginSource;
    let fakeHome: string;
    let projectDir: string;

    beforeAll(async () => {
      await ensureBinaryExists();
      fixture = await createE2EPluginSource();

      ({ tempDir, fakeHome, projectDir } = await createTestEnvironment({ permissions: false }));
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      await cleanupFixture(fixture);
    });

    it(
      "should init globally in plugin mode, then edit global from project directory",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Init from HOME -- create global installation (plugin)
        // ================================================================

        // No setAllLocal() call: the wizard defaults to plugin mode when the
        // source has a marketplace.json. This is the path we want to exercise.
        const initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir: fakeHome,
          env: { HOME: fakeHome },
        });
        const initDomain = await initWizard.stack.selectFirstStack();
        const initBuild = await initDomain.acceptDefaults();
        const initSources = await initBuild.passThroughAllDomains();
        await initSources.waitForReady();
        const initAgentsStep = await initSources.advance();
        const initConfirm = await initAgentsStep.acceptDefaults("init");
        const initResult = await initConfirm.confirm();

        // --- Phase 1 Verification ---

        await expectPhaseSuccess(
          { project: { dir: fakeHome }, exitCode: initResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: E2E_AGENTS.WEB_AND_API,
            source: fixture.marketplaceName,
          },
        );
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["name: web-developer", E2E_SKILL.react.id],
        });
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
          contains: ["name: api-developer"],
        });

        // Plugin entries must land under fake HOME's settings.json. The
        // marketplace-resolved key matches the form `<skillId>@<marketplaceName>`.
        const reactPluginKey = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;
        await expect({ dir: fakeHome }).toHavePlugin(reactPluginKey);

        // The positive sentinel, not a generic absence: `not.toContain("Failed to")`
        // cannot tell a clean install from one that failed with different wording,
        // and the exit code beside it already carries "did not crash".
        expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

        await initResult.destroy();

        // ================================================================
        // Phase 2: Edit from project dir -- uses global config (plugin)
        // ================================================================

        await createPermissionsFile(projectDir);

        const editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          env: { HOME: fakeHome },
        });
        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.waitForReady();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        const phase2Raw = editResult.rawOutput;

        // ================================================================
        // Phase 3: Verification -- global preserved, no project leakage
        // ================================================================

        await expectPhaseSuccess(
          { project: { dir: fakeHome }, exitCode: editResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: E2E_AGENTS.WEB_AND_API,
            source: fixture.marketplaceName,
          },
        );
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["name: web-developer", E2E_SKILL.react.id],
        });
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
          contains: ["name: api-developer"],
        });

        // Plugin entry still enabled in fake HOME's settings.json after edit.
        await expect({ dir: fakeHome }).toHavePlugin(reactPluginKey);

        // config-types.ts exists alongside config.ts at the global scope.
        expect(await fileExists(configTypesTsPath(fakeHome))).toBe(true);

        // No project config created
        expect(await fileExists(configTsPath(projectDir))).toBe(false);

        // No project-scope skills or agents leaked
        await expectCleanUninstall(projectDir);

        // The edit ran to completion AND reported that it changed nothing — which is
        // this phase's whole subject. A generic `not.toContain("ENOENT")` stood here
        // and could not tell a completed no-op edit from an edit that never ran.
        expect(phase2Raw).toContain(STEP_TEXT.EDIT_UNCHANGED);

        await editResult.destroy();
      },
    );
  },
);

/**
 * Combined/mixed case: init globally with the plugin-capable fixture, but
 * toggle a single skill on the sources step to `local` (eject). The rest
 * stay as plugin.
 *
 * Verifies that the same init/edit cross-scope flow works when the install
 * contains both plugin-sourced AND eject-sourced skills side-by-side at the
 * global scope. This is the only case that can break if scope-aware plugin
 * routing regresses differently for plugin vs eject skills.
 *
 * Requires Claude CLI for plugin install; skipped otherwise.
 */
describe.skipIf(!claudeAvailable)(
  "cross-scope lifecycle: init global -> edit global from project (mixed plugin + eject)",
  () => {
    let tempDir: string;
    let fixture: E2EPluginSource;
    let fakeHome: string;
    let projectDir: string;

    beforeAll(async () => {
      await ensureBinaryExists();
      fixture = await createE2EPluginSource();

      ({ tempDir, fakeHome, projectDir } = await createTestEnvironment({ permissions: false }));
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      await cleanupFixture(fixture);
    });

    it(
      "should init globally with mixed sources, then edit global from project directory",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Init from HOME -- mixed sources (plugin default, one eject)
        // ================================================================

        const initWizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir: fakeHome,
          env: { HOME: fakeHome },
        });
        const initDomain = await initWizard.stack.selectFirstStack();
        const initBuild = await initDomain.acceptDefaults();
        const initSources = await initBuild.passThroughAllDomains();
        await initSources.waitForReady();

        // Toggle the first focused skill to local (eject). All other skills
        // remain on their default source (plugin), producing a mixed install.
        // This matches the precedent in init-wizard-plugin.e2e.test.ts
        // "mixed install mode": per-skill granularity is achievable via
        // selectFocusedSourceCell on the first focused skill only.
        await initSources.selectFocusedSourceCell();

        const initAgentsStep = await initSources.advance();
        const initConfirm = await initAgentsStep.acceptDefaults("init");
        const initResult = await initConfirm.confirm();

        // --- Phase 1 Verification ---

        expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Config exists with both agents and the selected skill.
        await expect({ dir: fakeHome }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
        });

        // Agents compiled globally with expected content.
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["name: web-developer", E2E_SKILL.react.id],
        });
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
          contains: ["name: api-developer"],
        });

        // The toggled skill (first focused, web-framework-react in this
        // source ordering) is ejected into the global skills dir. The
        // non-toggled plugin-sourced skills remain installed as plugins.
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        // Config mentions both per-skill source modes.
        const initConfigContent = await readTestFile(configTsPath(fakeHome));
        expect(initConfigContent).toContain(`"eject"`);
        expect(initConfigContent).toContain(`"${fixture.marketplaceName}"`);

        // Non-toggled plugin skill(s) land in fake HOME's settings.json.
        // web-testing-vitest is the plugin-only skill from the plugin fixture
        // (see init-wizard-plugin plugin scope routing test asserting it
        // installs under the same marketplace).
        const vitestPluginKey = `${E2E_SKILL.vitest.id}@${fixture.marketplaceName}`;
        await expect({ dir: fakeHome }).toHavePlugin(vitestPluginKey);

        // The positive sentinel, not a generic absence: `not.toContain("Failed to")`
        // cannot tell a clean install from one that failed with different wording,
        // and the exit code beside it already carries "did not crash".
        expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

        await initResult.destroy();

        // ================================================================
        // Phase 2: Edit from project dir -- uses global config (mixed)
        // ================================================================

        await createPermissionsFile(projectDir);

        const editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          env: { HOME: fakeHome },
        });
        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.waitForReady();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        const phase2Raw = editResult.rawOutput;

        // ================================================================
        // Phase 3: Verification -- global preserved, no project leakage
        // ================================================================

        expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Global config preserved with both agents.
        await expect({ dir: fakeHome }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
        });

        // Ejected skill still present at the global scope.
        await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

        // Plugin-sourced skill still enabled in settings.json.
        await expect({ dir: fakeHome }).toHavePlugin(vitestPluginKey);

        // Compiled agent content preserved at the global scope.
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
          contains: ["name: web-developer", E2E_SKILL.react.id],
        });
        await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
          contains: ["name: api-developer"],
        });

        // config-types.ts still exists alongside config.ts at the global scope.
        expect(await fileExists(configTypesTsPath(fakeHome))).toBe(true);

        // No project config created.
        expect(await fileExists(configTsPath(projectDir))).toBe(false);

        // No project-scope skills or agents leaked.
        await expectCleanUninstall(projectDir);

        // The edit ran to completion AND reported that it changed nothing — which is
        // this phase's whole subject. A generic `not.toContain("ENOENT")` stood here
        // and could not tell a completed no-op edit from an edit that never ran.
        expect(phase2Raw).toContain(STEP_TEXT.EDIT_UNCHANGED);

        await editResult.destroy();
      },
    );
  },
);
