import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  normalizeConfigPreservingOrder,
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

describe("scope toggle roundtrip", () => {
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);
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
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizardC;

      // Build step -- Web domain: toggle web-framework-react scope, focused
      // explicitly rather than relying on where the grid opens.
      await wizardC.build.focusSkill(E2E_SKILL.react.display);
      await wizardC.build.toggleScopeOnFocusedSkill();
      await wizardC.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizardC.build.advanceDomain();

      // Shared domain -> Sources -> Agents -> Confirm, every step on defaults
      const resultC = await wizardC.build.saveFromBuild("edit");
      const exitCodeC = await resultC.exitCode;
      expect(exitCodeC).toBe(EXIT_CODES.SUCCESS);
      await resultC.destroy();
      testWizard = undefined;

      // Phase D: Re-open EditWizard -- pass through without changes
      const wizardD = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizardD;

      const resultD = await wizardD.passThrough();
      const exitCodeD = await resultD.exitCode;
      expect(exitCodeD).toBe(EXIT_CODES.SUCCESS);

      // Assertions: scope toggle persisted through re-open

      // Project config has web-framework-react with scope "project" and source "eject"
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain(E2E_SKILL.react.id);
      expect(projectConfig).toContain("scope: 'project'");
      expect(projectConfig).toContain("origin: 'eject'");

      // Project skill directory exists
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after roundtrip",
      ).toBe(true);

      // Global config still has web-framework-react (global is untouched)
      const globalConfig = await readTestFile(configTsPath(fakeHome));
      expect(globalConfig).toContain(E2E_SKILL.react.id);

      // Global skill directory still exists
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope after roundtrip",
      ).toBe(true);

      // Global web-developer agent should still contain web-framework-react
      // (mergeGlobalConfigs preserves the global config entry)
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.react.id],
      });

      await resultD.destroy();
    },
  );

  it(
    "Passthrough edit should not change scope of any skill or agent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Snapshot configs
      const projectConfigPath = configTsPath(projectDir);
      const globalConfigPath = configTsPath(fakeHome);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // ACTION: Launch EditWizard, pass through everything, confirm
      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER: Both configs are functionally identical (normalize projects line).
      // The project config is where a project-scope passthrough would write, so
      // checking only the global one would leave the spec's own claim untested.
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeConfigPreservingOrder(globalConfigAfter)).toStrictEqual(
        normalizeConfigPreservingOrder(globalConfigBefore),
      );

      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(normalizeConfigPreservingOrder(projectConfigAfter)).toStrictEqual(
        normalizeConfigPreservingOrder(projectConfigBefore),
      );

      // AFTER: All skill directories still exist at their original scopes
      // Global skills
      const globalSkillsDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS);
      for (const skillName of [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id]) {
        expect(
          await directoryExists(path.join(globalSkillsDir, skillName)),
          `${skillName} must still exist at global scope`,
        ).toBe(true);
      }

      // Project skills
      const projectSkillsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS);
      expect(
        await directoryExists(path.join(projectSkillsDir, E2E_SKILL.hono.id)),
        "api-framework-hono must still exist at project scope",
      ).toBe(true);

      // AFTER: All compiled agent files still exist at their original scopes
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      await result.destroy();
    },
  );
});
