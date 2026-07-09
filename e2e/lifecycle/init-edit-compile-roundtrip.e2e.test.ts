import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  runCLI,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobalWithEject,
  initProject,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Full lifecycle roundtrip E2E test: init (global + project) -> edit -> compile.
 *
 * Verifies that the three core commands work together in sequence with full
 * verification at each stage. No other test exercises all three commands
 * in a single lifecycle.
 */

describe("init-edit-compile roundtrip lifecycle", () => {
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

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (testTempDir) await cleanupTempDir(testTempDir);
  });

  it(
    "full lifecycle: init with eject, edit to change scope, compile to verify",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Setup
      const env = await createTestEnvironment();
      testTempDir = env.tempDir;
      fakeHome = env.fakeHome;
      projectDir = env.projectDir;

      // ---------------------------------------------------------------
      // Phase A: Global init with eject
      // ---------------------------------------------------------------
      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);

      expect(phaseA.exitCode, `Phase A failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      expect(await fileExists(globalConfigPath), "Global config must exist after init").toBe(true);

      const globalConfigAfterInit = await readTestFile(globalConfigPath);
      expect(globalConfigAfterInit, "version field is not emitted on global init").not.toContain(
        "version:",
      );

      const globalSkillsDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS);
      expect(await directoryExists(globalSkillsDir), "Global skills dir must exist").toBe(true);

      const globalAgentsDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS);
      expect(await directoryExists(globalAgentsDir), "Global agents dir must exist").toBe(true);

      // ---------------------------------------------------------------
      // Phase B: Project init with scope toggle
      // ---------------------------------------------------------------
      const phaseB = await initProject(sourceDir, sourceTempDir, fakeHome, projectDir);

      expect(phaseB.exitCode, `Phase B failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      expect(await fileExists(projectConfigPath), "Project config must exist after init").toBe(
        true,
      );

      const projectConfigAfterInit = await readTestFile(projectConfigPath);
      expect(projectConfigAfterInit, "version field is not emitted on project init").not.toContain(
        "version:",
      );

      const projectHonoSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "api-framework-hono",
      );
      expect(
        await directoryExists(projectHonoSkillDir),
        "Project must have api-framework-hono skill",
      ).toBe(true);

      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      // config-types.ts must be generated alongside config.ts
      const projectConfigTypesPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      expect(
        await fileExists(projectConfigTypesPath),
        "config-types.ts must exist after project init",
      ).toBe(true);

      // ---------------------------------------------------------------
      // Phase C: Edit wizard -- toggle web-framework-react scope to project
      // ---------------------------------------------------------------
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Web domain: focus web-framework-react explicitly, then toggle scope to project
      await wizard.build.focusSkill("web-framework-react");
      await wizard.build.toggleScopeOnFocusedSkill();

      // Advance through remaining domains
      const sources = await wizard.build.passThroughAllDomainsGeneric();

      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();

      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      const editExitCode = await result.exitCode;
      expect(editExitCode, "Edit wizard must succeed").toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      wizard = undefined;

      // Verify project config has web-framework-react with project scope
      const projectConfigAfterEdit = await readTestFile(projectConfigPath);
      expect(projectConfigAfterEdit).toContain("web-framework-react");
      expect(projectConfigAfterEdit).toMatch(/web-framework-react[^}]*"scope"\s*:\s*"project"/);
      expect(projectConfigAfterEdit, "version field is not emitted on edit").not.toContain(
        "version:",
      );

      const projectReactSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
      );
      expect(
        await directoryExists(projectReactSkillDir),
        "Project must have web-framework-react skill after scope toggle",
      ).toBe(true);

      // config-types.ts must be regenerated after scope change
      expect(
        await fileExists(projectConfigTypesPath),
        "config-types.ts must exist after scope change",
      ).toBe(true);

      // ---------------------------------------------------------------
      // Phase D: Compile from project dir
      // ---------------------------------------------------------------
      const compileResult = await runCLI(["compile", "--verbose"], projectDir, {
        env: { HOME: fakeHome },
      });

      expect(compileResult.exitCode, `Compile failed: ${compileResult.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(compileResult.combined).toContain(STEP_TEXT.COMPILE_SUCCESS);

      // Verify project api-developer.md exists with frontmatter
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        skills: ["api-framework-hono"],
      });

      // Verify global web-developer.md exists with frontmatter
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: ["web-framework-react"],
      });
    },
  );
});
