import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";

/**
 * Scope toggle roundtrip E2E tests.
 *
 * Verifies that scope changes survive a roundtrip: toggle -> save -> re-open
 * wizard -> verify state preserved. Also verifies that passthrough edits
 * do not mutate scope or config.
 */

function normalizeConfig(config: string): string {
  return config
    .split("\n")
    .filter((l) => !l.includes('"projects"'))
    .join("\n");
}

describe("scope toggle roundtrip", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
  });

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    await cleanupTempDir(testTempDir);
  });

  it(
    "G->P skill scope toggle should persist through edit re-open",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 1 },
    async () => {
      // Phase C: Edit -- toggle web-framework-react from global to project scope
      const wizardC = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizardC;

      // Build step -- Web domain: toggle first focused skill (web-framework-react) scope
      await wizardC.build.toggleScopeOnFocusedSkill();
      await wizardC.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizardC.build.advanceDomain();

      // Build step -- Shared domain (pass through) -> Sources
      const sourcesC = await wizardC.build.advanceToSources();

      // Sources step (pass through)
      await sourcesC.waitForReady();
      const agentsC = await sourcesC.advance();

      // Agents step (pass through)
      const confirmC = await agentsC.acceptDefaults("edit");

      // Confirm step
      const resultC = await confirmC.confirm();
      const exitCodeC = await resultC.exitCode;
      expect(exitCodeC).toBe(EXIT_CODES.SUCCESS);
      await resultC.destroy();
      testWizard = undefined;

      // Phase D: Re-open EditWizard -- pass through without changes
      const wizardD = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizardD;

      const resultD = await wizardD.passThrough();
      const exitCodeD = await resultD.exitCode;
      expect(exitCodeD).toBe(EXIT_CODES.SUCCESS);

      // Assertions: scope toggle persisted through re-open

      // Project config has web-framework-react with scope "project" and source "eject"
      const projectConfig = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(projectConfig).toContain("web-framework-react");
      expect(projectConfig).toContain('"scope":"project"');
      expect(projectConfig).toContain('"source":"eject"');

      // Project skill directory exists
      const projectSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
      );
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after roundtrip",
      ).toBe(true);

      // Global config still has web-framework-react (global is untouched)
      const globalConfig = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(globalConfig).toContain("web-framework-react");

      // Global skill directory still exists
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "web-framework-react");
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope after roundtrip",
      ).toBe(true);

      // Global web-developer agent should still contain web-framework-react
      // (mergeGlobalConfigs preserves the global config entry)
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["web-framework-react"],
      });

      await resultD.destroy();
    },
  );

  it(
    "Passthrough edit should not change scope of any skill or agent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Snapshot configs
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // ACTION: Launch EditWizard, pass through everything, confirm
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizard;

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER: Global config is functionally identical (normalize projects line)
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeConfig(globalConfigAfter)).toStrictEqual(normalizeConfig(globalConfigBefore));

      // AFTER: All skill directories still exist at their original scopes
      // Global skills
      const globalSkillsDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS);
      for (const skillName of ["web-framework-react", "web-testing-vitest", "web-state-zustand"]) {
        expect(
          await directoryExists(path.join(globalSkillsDir, skillName)),
          `${skillName} must still exist at global scope`,
        ).toBe(true);
      }

      // Project skills
      const projectSkillsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS);
      expect(
        await directoryExists(path.join(projectSkillsDir, "api-framework-hono")),
        "api-framework-hono must still exist at project scope",
      ).toBe(true);

      // AFTER: All compiled agent files still exist at their original scopes
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      await result.destroy();
    },
  );
});
