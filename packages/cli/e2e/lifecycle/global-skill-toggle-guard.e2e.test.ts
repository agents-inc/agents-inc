import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import "../matchers/setup.js";

/**
 * Global skill toggle guard E2E test.
 *
 * Verifies that globally installed skills cannot be deselected from project
 * scope in the edit wizard's build step. The guard shows a toast message
 * and leaves the skill selection unchanged.
 *
 * Also covers the exclusive-category bypass vector: selecting a different
 * skill in an exclusive category where the current selection is globally
 * installed must be blocked with the same toast message.
 */

describe("global skill toggle guard from project scope", () => {
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

  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
  });

  it(
    "should block toggling globally installed skills from project scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global init + project init with all skills staying global
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);

      // `cc init` inside a project materialises that project — it writes the
      // project's config.ts and registers the path in the global projects list —
      // so a project config already exists before the guarded edit runs. The
      // guard's contract is therefore "changes nothing", not "writes nothing":
      // snapshot the project config now and assert it is byte-identical after.
      const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Attempt to toggle a globally installed skill. The block surfaces as a
      // toast, awaited on the append-only raw surface anchored to a pre-press
      // cursor: Ink rewrites the toast row in place, so xterm's processed
      // buffer can lose the text before the test reads it, and an unanchored
      // raw match would accept an identical toast from earlier in the session.
      await wizard.build.selectSkillAwaiting(
        E2E_SKILL.react.display,
        STEP_TEXT.GLOBAL_SKILLS_BLOCKED,
      );

      // Pass through the rest of the wizard without changes
      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify the global config still contains all original skills (unchanged)
      const globalConfig = await readTestFile(configTsPath(env.fakeHome));
      expect(globalConfig).toContain(E2E_SKILL.react.id);
      // Guard against a silent scope flip: the skill must remain global-scoped.
      expect(globalConfig).toContain('"scope":"global"');

      // Verify global skill directories still exist on disk
      await expect({ dir: env.fakeHome }).toHaveLocalSkills([E2E_SKILL.react.id]);

      // Guard blocked the toggle: the project config is byte-identical to the
      // pre-edit snapshot, so no skill entry was added, dropped or re-scoped.
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "a blocked skill toggle must leave the project config byte-identical",
      ).toBe(projectConfigBefore);

      // Filesystem: the skill stays installed at global scope only — a blocked
      // toggle must not copy it into project scope.
      await expect({ dir: env.projectDir }).toHaveNoLocalSkills();

      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await result.destroy();
    },
  );

  it(
    "should block selecting a different skill in exclusive category when current is globally installed",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global init + project init with all skills staying global
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);

      // `cc init` materialises the project config during setup (see above), so
      // the guard's contract is "changes nothing" rather than "writes nothing".
      const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Attempt to select pinia in the exclusive web-client-state category
      // where zustand is already globally selected — this must be blocked with
      // a toast, awaited on the append-only raw surface anchored to a pre-press
      // cursor (see the sibling test for why the processed buffer is unsafe).
      await wizard.build.selectSkillAwaiting(
        E2E_SKILL.pinia.display,
        STEP_TEXT.GLOBAL_SKILLS_BLOCKED,
      );

      // Pass through the rest of the wizard without changes
      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify the global config still contains zustand (not replaced by pinia)
      const globalConfig = await readTestFile(configTsPath(env.fakeHome));
      expect(globalConfig).toContain("zustand");
      expect(globalConfig).not.toContain("pinia");

      // Verify global skill directories still exist on disk (eject mode)
      await expect({ dir: env.fakeHome }).toHaveLocalSkills([E2E_SKILL.zustand.id]);

      // Guard blocked the swap: the project config is byte-identical to the
      // pre-edit snapshot, so pinia was never written and zustand never dropped.
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "a blocked exclusive-category swap must leave the project config byte-identical",
      ).toBe(projectConfigBefore);

      // Filesystem: neither the blocked skill nor its replacement lands in
      // project scope.
      await expect({ dir: env.projectDir }).toHaveNoLocalSkills();

      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await result.destroy();
    },
  );
});
