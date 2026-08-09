import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  createGlobalOnlyEnv,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Full in-session scope state machine for a persisted dual-scope `[P][G]` skill,
 * driven end-to-end through a single `cc edit` session with NO save between the
 * steps. The sibling suites all save-and-reopen between actions, so the wizard
 * re-hydrates a fresh snapshot each time and never reaches the stale-snapshot
 * state this suite targets: a row whose LIVE config shows a plain active global
 * entry while the hydration snapshot still carries the original `[P][G]`
 * (project-active + global tombstone) shape.
 *
 * The sequence (all within one live session, before any save):
 *   1. spacebar on the persisted `[P][G]` row drops the half the PROJECT owns:
 *      the pair collapses to the inherited global `[G]` and the skill stays
 *      selected, because that entry is still active.
 *   2. `s` rebuilds the pair from the collapsed row.
 *   3. `s` collapses it again — the same plain global `[G]`, reached the other
 *      way.
 *   3b. spacebar on THAT row is BLOCKED (toast: "Global skills cannot be changed
 *      from project scope"): the live entry is now the global install itself,
 *      which project scope may not tombstone. This is the half of the guard that
 *      stands, and telling it apart from step 1 is the point of the sequence.
 *   4. `s` on the collapsed row restores a fresh `[P][G]` pair (active project
 *      entry + global tombstone).
 *   5. `s` again flips the reconstructed pair back to a plain global `[G]`.
 *   5b. `s` once more round-trips it back to `[P][G]`.
 *
 * The persisted config.ts on disk (seeded by the setup save) must stay
 * byte-identical throughout — the whole sequence is a live edit that is aborted,
 * never saved.
 */

const REACT_SKILL_ID = "web-framework-react";

describe("dual-scope in-session space-collapse → s-restore → blocked-space → s-flip", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "drops the project half on spacebar, restores on `s`, blocks spacebar on the global half, then flips the pair — all in one session",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Establish the persisted dual-scope pair via a real `s` toggle + save.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");
      expect(await readSkillEntries(projectDir, REACT_SKILL_ID)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);

      const projectConfigPath = configTsPath(projectDir);
      const configBefore = await readTestFile(projectConfigPath);

      // Re-open and act on the LIVE session — do NOT save until the end (we abort).
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        // Focus react explicitly — the grid's first-alphabetical cell is Vue, and
        // every step below acts on the focused skill (focus persists across `s`/space).
        await wizard.build.focusSkill(REACT_SKILL_ID);

        // Baseline: persisted dual-scope row renders both badges, react is the one
        // selected framework.
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["P", "G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
        ).toBe(1);

        // Step 1 — spacebar on the live [P][G] row drops the project half; the
        // inherited global entry it was masking surfaces in its place, so the row
        // keeps rendering and stays selected.
        await wizard.build.toggleFocusedSkill();
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "dropping the project half must leave react selected (1 of 1) — it is still active globally",
        ).toBe(1);

        // Step 2 — `s` rebuilds the pair from that collapsed row.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          (await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).slice().sort(),
        ).toStrictEqual(["G", "P"]);

        // Step 3 — `s` collapses [P][G] to a single inherited-global [G]; react
        // stays active (and selected).
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "collapsed-but-still-global react must render as selected (1 of 1)",
        ).toBe(1);

        // Step 3b — spacebar on THAT row must be BLOCKED: the live entry is now the
        // global install itself, and deselecting it would silently tombstone it from
        // project scope. The toast is awaited on the append-only raw surface anchored
        // to a pre-press cursor: Ink rewrites the absolutely-positioned toast row in
        // place, so xterm's processed buffer can lose it before the test reads it, and
        // an unanchored raw match would accept a toast emitted earlier in the session.
        await wizard.build.toggleFocusedSkillAwaiting(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "blocked spacebar must leave react selected (1 of 1) — no silent tombstone",
        ).toBe(1);

        // Step 4 — `s` restores a fresh [P][G] pair.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          (await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).slice().sort(),
        ).toStrictEqual(["G", "P"]);

        // Step 5 — `s` again flips the reconstructed pair back to plain global.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);

        // Step 5b — `s` once more round-trips back to [P][G].
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          (await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).slice().sort(),
        ).toStrictEqual(["G", "P"]);
      } finally {
        await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      }

      // The seeded config.ts was never re-saved: it must be byte-identical, and its
      // react entries still the original persisted [P][G] pair.
      expect(
        await readTestFile(projectConfigPath),
        "aborted in-session edit must not rewrite config.ts",
      ).toBe(configBefore);
      expect(await readSkillEntries(projectDir, REACT_SKILL_ID)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);
    },
  );
});
