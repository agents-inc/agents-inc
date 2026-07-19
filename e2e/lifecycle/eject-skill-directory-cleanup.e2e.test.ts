import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobalWithEject,
  readConfigSkillIds,
  readSkillEntries,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
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
    "deselecting a project-scoped eject skill deletes its directory from the project dir while global eject skills and config are untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      // Project-only eject skill: web-testing-vitest is project-scoped and copied
      // to projectDir; web-framework-react stays global (copied to fakeHome).
      await setupProjectOnlyMixedScope(sourceDir, sourceTempDir, fakeHome, projectDir);

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);

      // Setup proof: the project-scoped eject skill's directory genuinely exists on
      // disk and in config before the edit.
      await expect({ dir: projectDir }).toHaveSkillCopied("web-testing-vitest");
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain("web-testing-vitest");
      // Sibling global eject skill is present at HOME before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: deselect ONLY the project-scoped eject skill.
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

      // Filesystem: the copied project directory is genuinely removed, not orphaned.
      await expect({ dir: projectDir }).not.toHaveSkillCopied("web-testing-vitest");
      // Config: the skill is dropped from the project config's skills array (the
      // stack agent->skill mapping may still reference it, so the structural load
      // scopes the assertion to the skills array).
      expect(
        await readConfigSkillIds(projectDir),
        "skills array must not retain the deselected eject skill",
      ).not.toContain("web-testing-vitest");

      // Boundary: a project-scope deselect must not touch the HOME directory —
      // the sibling global eject skill and the global config are untouched.
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");
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
      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `Global eject init failed: ${phaseA.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Setup proof: the global-scoped eject skill's directory exists at HOME and
      // it is an active (non-tombstoned) global eject entry before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-testing-vitest");
      expect(
        await readSkillEntries(fakeHome, "web-testing-vitest"),
        "vitest must be an active global eject skill before the edit",
      ).toStrictEqual([{ id: "web-testing-vitest", scope: "global", source: "eject" }]);
      // Sibling global eject skill present before the edit.
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");

      // Edit from the global root (projectDir === HOME): deselect the global eject skill.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
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

      // Filesystem: the global copy is removed from HOME (os.homedir() branch),
      // not left orphaned — this is the fix under test.
      await expect({ dir: fakeHome }).not.toHaveSkillCopied("web-testing-vitest");
      // Config: editing FROM global scope has no project overlay, so a deselect removes the
      // skill entirely (no tombstone) — no entry (excluded or not) may remain in the
      // skills array (the stack agent->skill mapping may still reference the id).
      expect(
        await readSkillEntries(fakeHome, "web-testing-vitest"),
        "deselected global eject skill must be removed from the skills array, not tombstoned",
      ).toStrictEqual([]);

      // Boundary: removal is surgical — the sibling global eject skill's directory
      // survives and its config entry stays active (not excluded).
      await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");
      expect(await readSkillEntries(fakeHome, "web-framework-react")).toStrictEqual([
        { id: "web-framework-react", scope: "global", source: "eject" },
      ]);
    },
  );
});
