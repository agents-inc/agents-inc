import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  finishWizard,
  initProjectAllGlobal,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import "../matchers/setup.js";

/**
 * Filter-incompatible (F) hotkey vs. the global-skill lock.
 *
 * The spacebar path in the build step refuses to change a globally installed
 * skill from project scope and shows a toast. The F hotkey removes every web
 * skill incompatible with the selected framework and must honour the same
 * lock: a globally installed skill belongs to the global scope, and a
 * project-scope edit may never uninstall it from HOME.
 *
 * pinia is Vue-only, so with React as the selected framework it is exactly
 * what F targets. Phase A installs it globally in eject mode; Phase B leaves
 * every skill global; the edit under test then runs from the project dir.
 */

// D-269: the F hotkey (filter incompatible) is gated behind
// FEATURE_FLAGS.FILTER_INCOMPATIBLE (default false). E2E tests spawn the CLI
// binary as a separate process, so vi.mock cannot override the flag. Un-skip
// once the flag flips back to true (or once the feature-flags module supports an
// env-var override the E2E harness can set).
describe.skip("global skill filter-incompatible guard from project scope", () => {
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  let env: TestEnvironment | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "should block the F hotkey from uninstalling a globally installed skill at project scope",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();

      // Phase A: global init in eject mode, swapping the stack's zustand for the
      // Vue-only pinia so HOME owns a skill that is incompatible with React.
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: env.fakeHome,
        env: { HOME: env.fakeHome },
      });
      const domain = await globalWizard.stack.selectFirstStack();
      const globalBuild = await domain.acceptDefaults();
      await globalBuild.navigateToNextCategory();
      await globalBuild.selectSkill(E2E_SKILL.pinia.display);
      const globalSources = await globalBuild.passThroughAllDomains();
      await globalSources.waitForReady();
      await globalSources.setAllLocal();
      const globalAgents = await globalSources.advance();
      const globalConfirm = await globalAgents.acceptDefaults("init");
      const phaseA = await finishWizard(await globalConfirm.confirm());
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Phase B: project init leaving every skill at global scope.
      const phaseB = await initProjectAllGlobal(
        source.sourceDir,
        source.tempDir,
        env.fakeHome,
        env.projectDir,
      );
      expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

      // The global scope owns pinia before the project-scope edit runs.
      await expect({ dir: env.fakeHome }).toHaveLocalSkills([E2E_SKILL.pinia.id]);
      const globalConfigBefore = await readTestFile(configTsPath(env.fakeHome));

      // Phase B's `cc init` materialises the project — it writes the project's
      // config.ts and registers the path in the global projects list — so a
      // project config exists before the guarded edit. The guard's contract is
      // therefore "changes nothing", not "writes nothing".
      const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));

      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source,
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // F drops web skills incompatible with React. pinia is globally installed,
      // so the lock must refuse the removal exactly as spacebar does — surfacing
      // the lock toast, which is awaited on the append-only raw surface because
      // Ink overwrites the toast row in xterm's processed buffer.
      await wizard.build.toggleFilterIncompatibleAwaiting(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);

      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Filesystem: the global skill directory in HOME must survive a project-scope edit.
      await expect({ dir: env.fakeHome }).toHaveLocalSkills([E2E_SKILL.pinia.id]);

      // Config: the global scope must still declare pinia active and global.
      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(
        globalConfig.skills.filter((skill) => skill.id === E2E_SKILL.pinia.id),
        "global config must still declare pinia as a single active global skill",
      ).toStrictEqual([{ id: E2E_SKILL.pinia.id, scope: "global", source: "eject" }]);

      // Config and filesystem agree because neither moved: the global config is untouched.
      expect(
        await readTestFile(configTsPath(env.fakeHome)),
        "a project-scope edit must not rewrite the global config",
      ).toBe(globalConfigBefore);

      // A blocked F is a no-op at project scope too: the project config is
      // byte-identical to the pre-edit snapshot, so no exclusion tombstone was
      // written for the skill F tried to remove.
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "a blocked filter-incompatible removal must leave the project config byte-identical",
      ).toBe(projectConfigBefore);

      // Filesystem: nothing was copied into project scope either.
      await expect({ dir: env.projectDir }).toHaveNoLocalSkills();

      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await result.destroy();
    },
  );
});
