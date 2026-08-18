import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  createTestEnvironment,
  setupDualScopeWithEject,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * D-192: Scope toggle then deselect preserves global config.
 *
 * Verifies that `detectConfigChanges` diffs against `oldConfig.skills`
 * (not `currentSkillIds`), so deselecting a skill from project scope
 * does not trigger removal from the global config.
 */

describe("scope change deselect integrity", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string | undefined;
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "deselecting a project-scoped skill should not remove it from global config",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: dual-scope env (global web skills + project hono)
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Web domain (pass through)
      await wizard.build.advanceDomain();

      // API domain -- deselect api-framework-hono
      await wizard.build.selectSkill(E2E_SKILL.hono.display);
      await wizard.build.advanceDomain();

      // Methodology domain -> Sources -> Agents -> Confirm (all pass through)
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config + agent unchanged, project config retains web skills
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: [],
        },
      });

      await result.destroy();
    },
  );

  it(
    "no-op edit from project scope should not remove globally installed skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global-only env (all skills at global scope)
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);

      // Snapshot global config before edit
      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Launch edit wizard from project scope, pass through without changes
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config is unchanged -- all skills and agents still present
      await expect({ dir: env.fakeHome }).toHaveConfig({
        skillIds: [
          E2E_SKILL.react.id,
          E2E_SKILL.vitest.id,
          E2E_SKILL.zustand.id,
          E2E_SKILL.hono.id,
        ],
        agents: ["web-developer", "api-developer"],
      });

      // Normalize both configs (strip projects tracking line) and compare
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeGlobalConfig(globalConfigAfter)).toStrictEqual(
        normalizeGlobalConfig(globalConfigBefore),
      );

      // Assert: global agent files still exist on disk
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("api-developer");

      // Global skill files must still exist on disk
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.zustand.id);

      await result.destroy();
    },
  );

  it(
    "deselecting project skill should preserve global config skills array",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: dual-scope env (global web skills + project hono)
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Snapshot global skills before edit
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);
      const globalSkillsBefore = globalConfigBefore
        .split("\n")
        .filter(
          (l: string) =>
            l.includes('"id"') && l.includes('"scope":"global"') && !l.includes('"excluded"'),
        )
        .sort();

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Web domain (pass through)
      await wizard.build.advanceDomain();

      // API domain -- deselect api-framework-hono
      await wizard.build.selectSkill(E2E_SKILL.hono.display);
      await wizard.build.advanceDomain();

      // Methodology domain -> Sources -> Agents -> Confirm (all pass through)
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config skills array is identical (no skills lost or gained)
      const globalConfigAfter = await readTestFile(globalConfigPath);
      const globalSkillsAfter = globalConfigAfter
        .split("\n")
        .filter(
          (l: string) =>
            l.includes('"id"') && l.includes('"scope":"global"') && !l.includes('"excluded"'),
        )
        .sort();
      expect(globalSkillsAfter).toStrictEqual(globalSkillsBefore);

      // Assert: global agent files still exist on disk
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Assert: project config still exists and retains web skills from global scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });

      await result.destroy();
    },
  );
});
