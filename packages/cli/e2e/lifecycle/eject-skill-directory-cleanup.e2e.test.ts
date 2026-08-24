import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  initGlobalWithEject,
  readConfigSkillIds,
  readSkillEntries,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * Eject-mode skill directory cleanup on full deselect (skill-side twin of the
 * agent-side project-only-deselect-integrity coverage).
 *
 * Deselecting a skill installed in eject mode (its files copied to disk under
 * `.claude/skills/<id>/`) via `cc edit` must delete that directory, not just
 * drop the config entry. The fix resolves the directory scope-aware: project
 * scope -> project dir (cwd), global scope -> HOME. Because the two scopes hit
 * different resolution branches (`cwd` vs `os.homedir()`), each is verified
 * independently — a working project branch does not imply a working global one.
 */

describe("eject skill directory cleanup on deselect", () => {
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
    "deselecting a project-scoped eject skill deletes its directory from the project dir while global eject skills and config are untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      // Project-only eject skill: web-testing-vitest is project-scoped and copied
      // to projectDir; web-framework-react stays global (copied to fakeHome).
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      const projectConfigPath = configTsPath(projectDir);
      const globalConfigPath = configTsPath(fakeHome);

      // Setup proof: the project-scoped eject skill's directory genuinely exists on
      // disk and in config before the edit.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_SKILL.vitest.id);
      // Sibling global eject skill is present at HOME before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: deselect ONLY the project-scoped eject skill.
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
      // Methodology domain -> Sources.
      const result = await wizard.build.saveFromBuild("edit");
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // Filesystem: the copied project directory is genuinely removed, not orphaned.
      await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
      // Config: the skill is dropped from the project config's skills array (the
      // stack agent->skill mapping may still reference it, so the structural load
      // scopes the assertion to the skills array).
      expect(
        await readConfigSkillIds(projectDir),
        "skills array must not retain the deselected eject skill",
      ).not.toContain(E2E_SKILL.vitest.id);

      // Boundary: a project-scope deselect must not touch the HOME directory —
      // the sibling global eject skill and the global config are untouched.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope eject-skill deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );

  it(
    "deselecting a global-scoped eject skill deletes its directory from the HOME dir while other global eject skills survive",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome } = await createTestEnvironment();
      testTempDir = tempDir;
      // Global-only eject install at HOME: all skills global-scoped, copied to
      // fakeHome/.claude/skills/. No project involvement.
      const phaseA = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(phaseA.exitCode, `Global eject init failed: ${phaseA.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Setup proof: the global-scoped eject skill's directory exists at HOME and
      // it is an active (non-tombstoned) global eject entry before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      expect(
        await readSkillEntries(fakeHome, E2E_SKILL.vitest.id),
        "vitest must be an active global eject skill before the edit",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, scope: "global", origin: "eject" }]);
      // Sibling global eject skill present before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

      // Edit from the global root (projectDir === HOME): deselect the global eject skill.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      // Web domain: deselect web-testing-vitest.
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      await wizard.build.advanceDomain();
      // API domain: pass through.
      await wizard.build.advanceDomain();
      // Methodology domain -> Sources.
      const result = await wizard.build.saveFromBuild("edit");
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // Filesystem: the global copy is removed from HOME (os.homedir() branch),
      // not left orphaned — this is the fix under test.
      await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);
      // Config: editing FROM global scope has no project overlay, so a deselect removes the
      // skill entirely (no tombstone) — no entry (excluded or not) may remain in the
      // skills array (the stack agent->skill mapping may still reference the id).
      expect(
        await readSkillEntries(fakeHome, E2E_SKILL.vitest.id),
        "deselected global eject skill must be removed from the skills array, not tombstoned",
      ).toStrictEqual([]);

      // Boundary: removal is surgical — the sibling global eject skill's directory
      // survives and its config entry stays active (not excluded).
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(await readSkillEntries(fakeHome, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
      ]);
    },
  );
});
