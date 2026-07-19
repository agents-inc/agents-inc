import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
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
  }, TIMEOUTS.SETUP * 2);

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
        rows: 60,
        cols: 120,
      });

      // Web domain (pass through)
      await wizard.build.advanceDomain();

      // API domain -- deselect api-framework-hono
      await wizard.build.selectSkill("hono");
      await wizard.build.advanceDomain();

      // Methodology domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step (pass through)
      const confirm = await agents.acceptDefaults("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config + agent unchanged, project config retains web skills
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: ["web-developer"],
        },
        project: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
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
      const globalConfigPath = path.join(env.fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Launch edit wizard from project scope, pass through without changes
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: env.fakeHome },
        rows: 60,
        cols: 120,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config is unchanged -- all skills and agents still present
      await expect({ dir: env.fakeHome }).toHaveConfig({
        skillIds: [
          "web-framework-react",
          "web-testing-vitest",
          "web-state-zustand",
          "api-framework-hono",
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
      await expect({ dir: env.fakeHome }).toHaveSkillCopied("web-framework-react");
      await expect({ dir: env.fakeHome }).toHaveSkillCopied("web-testing-vitest");
      await expect({ dir: env.fakeHome }).toHaveSkillCopied("web-state-zustand");

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
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
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
        rows: 60,
        cols: 120,
      });

      // Web domain (pass through)
      await wizard.build.advanceDomain();

      // API domain -- deselect api-framework-hono
      await wizard.build.selectSkill("hono");
      await wizard.build.advanceDomain();

      // Methodology domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step (pass through)
      const confirm = await agents.acceptDefaults("edit");

      // Confirm step
      const result = await confirm.confirm();
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
        skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
      });

      await result.destroy();
    },
  );
});
