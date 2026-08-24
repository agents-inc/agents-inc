import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readConfigSkillIds,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * Project-only deselection integrity (config-merger AuthoritativeScope "owned").
 *
 * Deselecting a PROJECT-ONLY agent/skill (never dual-scope — no global install
 * underneath it and no global tombstone) via `cc edit` run from within a project
 * must genuinely remove it from config.ts, the generated config-types.ts union,
 * and — for agents — the compiled `.md` on disk. An INHERITED global-active entry
 * (globally installed, untouched at project scope, no tombstone) must never be
 * affected by a project-scope edit — it is read-only from the project's view.
 */

describe("project-only deselection integrity", () => {
  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

  let testTempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "deselecting a project-only agent removes it from config, the generated union, and disk while the inherited global agent is untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      const projectConfigPath = configTsPath(projectDir);
      const projectTypesPath = configTypesTsPath(projectDir);
      const projectAgentMd = path.join(agentsPath(projectDir), "api-developer.md");
      const globalConfigPath = configTsPath(fakeHome);
      const globalTypesPath = configTypesTsPath(fakeHome);

      // Setup proof: the project-only agent is genuinely present before the edit.
      expect(
        await fileExists(projectAgentMd),
        "compiled project api-developer.md must exist after init",
      ).toBe(true);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain("api-developer");
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain("api-developer");

      // Snapshot the inherited global config before the project-scope edit.
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: deselect ONLY the project-only agent.
      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // The project-only agent is removed everywhere.
      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(
        projectConfigAfter,
        "config.ts must not retain the deselected project-only agent",
      ).not.toContain("api-developer");
      const projectTypesAfter = await readTestFile(projectTypesPath);
      expect(
        projectTypesAfter,
        "config-types.ts AgentName/SelectedAgentName union must drop the deselected agent",
      ).not.toContain("api-developer");
      expect(
        await fileExists(projectAgentMd),
        "compiled api-developer.md must be deleted after full removal",
      ).toBe(false);

      // The OTHER project-only entry (the vitest skill) is untouched — removal is surgical.
      expect(projectConfigAfter, "untouched project-only skill must be preserved").toContain(
        E2E_SKILL.vitest.id,
      );

      // Boundary: the inherited global-active agent survives the project edit.
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      expect(await readTestFile(globalTypesPath)).toContain("web-developer");
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toContain("web-developer");
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope agent deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );

  it(
    "deselecting a project-only skill removes it from the config skills array and the generated union while the inherited global skill is untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      const projectConfigPath = configTsPath(projectDir);
      const projectTypesPath = configTypesTsPath(projectDir);
      const globalConfigPath = configTsPath(fakeHome);

      // Setup proof: the project-only skill is genuinely present before the edit.
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_SKILL.vitest.id);
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain(E2E_SKILL.vitest.id);

      // Snapshot the inherited global config before the project-scope edit.
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: deselect ONLY the project-only skill.
      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      // Web domain: deselect web-testing-vitest.
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      await wizard.build.advanceDomain();
      // API domain: pass through.
      await wizard.build.advanceDomain();
      // Methodology domain -> Sources -> Agents -> Confirm.
      const result = await wizard.build.saveFromBuild("edit");
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // The project-only skill is removed from the config's skills array.
      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(
        await readConfigSkillIds(projectDir),
        "skills array must not retain the deselected project-only skill",
      ).not.toContain(E2E_SKILL.vitest.id);
      const projectTypesAfter = await readTestFile(projectTypesPath);
      expect(
        projectTypesAfter,
        "config-types.ts SkillId union must drop the deselected skill",
      ).not.toContain(E2E_SKILL.vitest.id);

      // The OTHER project-only entry (the api-developer agent) is untouched — surgical.
      expect(projectConfigAfter, "untouched project-only agent must be preserved").toContain(
        "api-developer",
      );

      // Boundary: the inherited global-active skill survives the project edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toContain(E2E_SKILL.react.id);
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope skill deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );

  it(
    "keeps a deselected project-only skill visible on the Sources tab so the user can see what will be removed",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      // Setup proof: vitest is genuinely a saved project skill before the edit, so an
      // absent Sources row later is the vanished-row bug, not a setup miss.
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));
      expect(projectConfigBefore).toContain(E2E_SKILL.vitest.id);

      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Web domain: deselect the pre-selected vitest (do NOT re-select it).
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      // Pass through the remaining domains (Web -> API -> Methodology), then Methodology -> Sources.
      await wizard.build.advanceDomain();
      await wizard.build.advanceDomain();
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const sourcesFrame = sources.getOutput();
      // Positive shape: the inherited global react row proves the Sources grid rendered
      // (non-empty, correct screen), so a missing vitest row is the vanished-row bug.
      expect(
        sourcesFrame,
        `Sources grid must render the inherited global skill. Screen:\n${sources.getScreen()}`,
      ).toContain(E2E_SKILL.react.display);
      // The bug under test: a deselected saved project skill must remain visible (rendered
      // disabled) on the Sources tab so the user can see what they are about to remove.
      expect(
        sourcesFrame,
        `a deselected saved project skill must remain visible on the Sources tab. Screen:\n${sources.getScreen()}`,
      ).toContain(E2E_SKILL.vitest.display);

      // ...and is rendered as pending-removal rather than as an ordinary editable row, using the
      // same removal marker the info panel prints for removed skills so both surfaces read
      // consistently. The wizard runs with NO_COLOR in E2E, so the red colour carries no signal
      // here — the marker is what a user (and this assertion) can actually see. A lock glyph would
      // be wrong: that means "installed globally, not editable from this project".
      expect(
        sourcesFrame,
        `the deselected skill must be marked pending-removal. Screen:\n${sources.getScreen()}`,
      ).toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.vitest.display}`);
    },
  );
});
