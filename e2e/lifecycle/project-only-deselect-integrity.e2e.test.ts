import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
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
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

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
    { timeout: TIMEOUTS.LIFECYCLE, retry: 0 },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupProjectOnlyMixedScope(sourceDir, sourceTempDir, fakeHome, projectDir);

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectTypesPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      const projectAgentMd = path.join(agentsPath(projectDir), "api-developer.md");
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalTypesPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);

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
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      await agents.toggleAgent("API Developer");
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
        "web-testing-vitest",
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
    { timeout: TIMEOUTS.LIFECYCLE, retry: 0 },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupProjectOnlyMixedScope(sourceDir, sourceTempDir, fakeHome, projectDir);

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectTypesPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);

      // Setup proof: the project-only skill is genuinely present before the edit.
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain("web-testing-vitest");
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain("web-testing-vitest");

      // Snapshot the inherited global config before the project-scope edit.
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: deselect ONLY the project-only skill.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      // Web domain: deselect web-testing-vitest.
      await wizard.build.selectSkill("vitest");
      await wizard.build.advanceDomain();
      // API domain: pass through.
      await wizard.build.advanceDomain();
      // Methodology domain -> Sources.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // The project-only skill is removed from the config's skills array.
      const projectConfigAfter = await readTestFile(projectConfigPath);
      const skillsBlockMatch = projectConfigAfter.match(
        /const skills:\s*SkillConfig\[\]\s*=\s*\[([\s\S]*?)\];/,
      );
      expect(skillsBlockMatch, "project config.ts must have a skills array").not.toBeNull();
      expect(
        skillsBlockMatch![1],
        "skills array must not retain the deselected project-only skill",
      ).not.toContain("web-testing-vitest");
      const projectTypesAfter = await readTestFile(projectTypesPath);
      expect(
        projectTypesAfter,
        "config-types.ts SkillId union must drop the deselected skill",
      ).not.toContain("web-testing-vitest");

      // The OTHER project-only entry (the api-developer agent) is untouched — surgical.
      expect(projectConfigAfter, "untouched project-only agent must be preserved").toContain(
        "api-developer",
      );

      // Boundary: the inherited global-active skill survives the project edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toContain("web-framework-react");
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope skill deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );
});
