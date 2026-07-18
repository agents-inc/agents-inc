import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists, readTestFile } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import type { SkillConfig } from "../../src/cli/types/config.js";

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
 *   1. spacebar collapses the persisted `[P][G]` to a single inherited-global
 *      `[G]` — the skill stays selected (still active via global).
 *   2. a SECOND spacebar on the collapsed row is BLOCKED (toast: "Global skills
 *      cannot be changed from project scope") — it must NOT silently tombstone
 *      the still-real global install. Badge + selected count stay put.
 *   3. `s` on the collapsed row restores a fresh `[P][G]` pair (active project
 *      entry + global tombstone).
 *   4. `s` again freely flips the reconstructed pair back to a plain global `[G]`
 *      — the persisted-pair guard no longer treats it as pristine-from-disk.
 *   4b. `s` once more round-trips it back to `[P][G]`.
 *
 * The persisted config.ts on disk (seeded by the setup save) must stay
 * byte-identical throughout — the whole sequence is a live edit that is aborted,
 * never saved.
 */

const REACT_SKILL_ID = "web-framework-react";
const FRAMEWORK_CATEGORY_LABEL = "Framework";

/** Load react's project-config entries, sorted deterministically for toStrictEqual. */
async function readReactEntries(projectDir: string): Promise<SkillConfig[]> {
  const loaded = await loadProjectConfigFromDir(projectDir);
  expect(loaded, `project config.ts must exist at ${projectDir}`).not.toBeNull();
  if (!loaded) return [];
  return loaded.config.skills
    .filter((sc) => sc.id === REACT_SKILL_ID)
    .sort((a, b) => {
      const aKey = `${a.scope}${a.excluded ? "-excluded" : ""}`;
      const bKey = `${b.scope}${b.excluded ? "-excluded" : ""}`;
      return aKey.localeCompare(bKey);
    });
}

/**
 * Drive one `cc edit` session that presses `s` on the first-focused skill
 * (web-framework-react in the Web domain) — G->P — then saves through to
 * completion, producing the persisted dual-scope `[P][G]` pair.
 */
async function seedPersistedDualScope(
  projectDir: string,
  fakeHome: string,
  sourceDir: string,
  sourceTempDir: string,
): Promise<void> {
  const wizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });
  try {
    await wizard.build.toggleScopeOnFocusedSkill();
    await wizard.build.advanceDomain();
    // API domain: pass through.
    await wizard.build.advanceDomain();
    // Methodology domain -> Sources.
    const sources = await wizard.build.advanceToSources();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();
  } finally {
    await wizard.destroy();
  }
}

describe("dual-scope in-session collapse → blocked-space → s-restore → s-flip", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "collapses, blocks a second spacebar, then s-restores and freely flips the pair — all in one session",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Establish the persisted dual-scope pair via a real `s` toggle + save.
      await seedPersistedDualScope(projectDir, fakeHome, sourceDir, sourceTempDir);
      expect(await readReactEntries(projectDir)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const configBefore = await readTestFile(projectConfigPath);

      // Re-open and act on the LIVE session — do NOT save until the end (we abort).
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      try {
        // Baseline: persisted dual-scope row renders both badges, react is the one
        // selected framework.
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["P", "G"]);
        expect(await wizard.build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL)).toBe(
          1,
        );

        // Step 1 — spacebar collapses [P][G] to a single inherited-global [G]; react
        // stays active (and selected).
        await wizard.build.toggleFocusedSkill();
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL),
          "collapsed-but-still-global react must render as selected (1 of 1)",
        ).toBe(1);

        // Step 2 — a second spacebar on the collapsed row is BLOCKED. Read the toast
        // immediately (it auto-clears), then assert the row is unchanged.
        await wizard.build.toggleFocusedSkill();
        expect(
          wizard.build.getOutput(),
          "second spacebar on the collapsed [G] row must be blocked with a toast",
        ).toContain(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL),
          "blocked spacebar must leave react selected (1 of 1) — no silent tombstone",
        ).toBe(1);

        // Step 3 — `s` restores a fresh [P][G] pair.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          (await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).slice().sort(),
        ).toStrictEqual(["G", "P"]);

        // Step 4 — `s` again freely flips the reconstructed pair back to plain global.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);

        // Step 4b — `s` once more round-trips back to [P][G].
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          (await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).slice().sort(),
        ).toStrictEqual(["G", "P"]);
      } finally {
        wizard.abort();
        await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
        await wizard.destroy();
      }

      // The seeded config.ts was never re-saved: it must be byte-identical, and its
      // react entries still the original persisted [P][G] pair.
      expect(
        await readTestFile(projectConfigPath),
        "aborted in-session edit must not rewrite config.ts",
      ).toBe(configBefore);
      expect(await readReactEntries(projectDir)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);
    },
  );
});
