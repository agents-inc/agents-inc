import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  loadConfigOrFail,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  createTestEnvironment,
  readSkillEntries,
  runEditWithFirstSkillAction,
  setupDualScopeWithEject,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";

/**
 * D-192: Scope toggle then deselect preserves global config.
 *
 * Verifies that `detectConfigChanges` diffs against `oldConfig.skills`
 * (not `currentSkillIds`), so deselecting a skill from project scope
 * does not trigger removal from the global config.
 *
 * The two tests here are a PAIR and neither means much alone. One drives a
 * deselect the wizard performs (react's project half, from a persisted [P][G]
 * pair); the other drives one it REFUSES (hono, the only skill in a required
 * exclusive category). A refusal pinned on its own cannot tell a correctly-
 * scoped guard from one that has swallowed its whole domain — both leave the
 * config and the filesystem byte-identical and both exit 0.
 *
 * **How the "global config unchanged" assertion was shown to be able to fail.**
 * Reverting a fix cannot check it: a guarantee not to write and a bug that
 * skipped the write are the same bytes on disk. Mutating the MERGER's
 * `isWithinSessionAuthority` to `return true` was tried first and left all
 * three tests green — that path governs the project config's merge, not the
 * global file. What reddens it is mutating the FIXTURE at the point the
 * operation would have changed it: rewriting one skill id in the global
 * `config.ts` between the snapshot and the wizard launch fails
 * `toStrictEqual(globalSkillsBefore)` on its own message, and nothing else.
 */

describe("scope change deselect integrity", () => {
  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

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
      // A deselect this wizard will actually perform, which the API-domain press
      // below deliberately is not. `runEditWithFirstSkillAction` seeds a PERSISTED
      // [P][G] pair on react: its project half is the project's own to drop, and
      // `web-framework` holds two fixture skills, so neither the global lock nor
      // the exclusive-category guard declines it.
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");

      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "setup must persist an active project entry plus a global tombstone to have a project half to drop",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);

      const globalSkillsBefore = (await loadConfigOrFail(fakeHome)).skills;

      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // The subject: spacebar drops the pair's project half. `selectSkill` is
      // closed-loop, so reaching the next line at all means the toggle LANDED —
      // which is what this spec could not say while it pressed at a refusal.
      await wizard.build.selectSkill(E2E_SKILL.react.display);

      // Web -> API -> Methodology; `saveFromBuild` takes the last domain to Sources.
      await wizard.build.advanceDomain();
      await wizard.build.advanceDomain();

      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The same invariant, now over a deselect that happened: `detectConfigChanges` diffs
      // against `oldConfig.skills` rather than `currentSkillIds`, so dropping the
      // project half must leave every global entry — tombstones included — alone.
      expect(
        (await loadConfigOrFail(fakeHome)).skills,
        "dropping a pair's project half must leave the global config byte-for-byte as it was",
      ).toStrictEqual(globalSkillsBefore);

      // The global install underneath is still on disk, not merely still in the config.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      await result.destroy();
    },
  );

  it(
    "no-op edit from project scope should not remove globally installed skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global-only env (all skills at global scope)
      env = await createGlobalOnlyEnv(E2E_SOURCE);

      // Snapshot global config before edit
      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Launch edit wizard from project scope, pass through without changes
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: E2E_SOURCE,
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

  // The control for the deselect above, and the reason both live in one file: a
  // refusal pinned alone cannot tell a correctly-scoped guard from one that has
  // swallowed its whole domain, since either leaves the config and the filesystem
  // byte-identical and exits 0.
  it(
    "a deselect the exclusive-category guard refuses leaves both configs untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: dual-scope env (global web skills + project hono)
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);

      // Snapshot global skills before edit
      const globalSkillsBefore = (await loadConfigOrFail(fakeHome)).skills;

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Web domain (pass through)
      await wizard.build.advanceDomain();

      // API domain -- press Space on api-framework-hono, WHICH THE WIZARD REFUSES,
      // and that refusal is now this test's subject rather than an accident of it.
      // hono is the only skill the matrix gives the required exclusive API Framework
      // category, so `toggleTechnology` declines the deselect and toasts instead —
      // making this the suite's one exercise of ONLY_SKILL_IN_CATEGORY.
      await wizard.build.selectSkillAwaiting(
        E2E_SKILL.hono.display,
        STEP_TEXT.ONLY_SKILL_IN_CATEGORY,
      );
      await wizard.build.advanceDomain();

      // Methodology domain -> Sources -> Agents -> Confirm (all pass through)
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Assert: global config skills array is identical (no skills lost or gained)
      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });
      expect(
        (await loadConfigOrFail(fakeHome)).skills,
        "a project-scope deselect must leave every global entry — tombstones included — as it found them",
      ).toStrictEqual(globalSkillsBefore);

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
