import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import type { SkillConfig } from "../../src/cli/types/config.js";

/**
 * Live in-session render state of a dual-scope skill immediately after a
 * spacebar collapse — BEFORE the wizard is saved and re-opened.
 *
 * The sibling suite `dual-scope-spacebar-reselect-restore.e2e.test.ts` and
 * `tombstone-cleanup-PtoG-restoration.e2e.test.ts` assert on the SAVED config.ts
 * (and on the scope BADGES of a freshly re-opened wizard). Neither inspects the
 * grid's SELECTED state in the same session, mid-edit, right after the keypress.
 *
 * The gap that leaves: when the project half of a persisted `[P][G]` skill is
 * dropped with spacebar, `reconcileSkillConfigs` collapses `skillConfigs` to a
 * single active inherited-global entry (`{scope:"global"}`) — so the skill is
 * genuinely STILL active — but `toggleTechnology` computes `newSelections`
 * separately and unconditionally removes the id from `domainSelections`. The
 * grid derives a skill's `selected` flag from `domainSelections`, so the row
 * renders as UNSELECTED even though it is still active via the global install.
 *
 * The scope badge (sourced from `skillConfigs.scope`) keeps rendering ` G `,
 * which is why a badge-only assertion (all the existing suites) cannot see this:
 * the badge and the selected state disagree. The one text-observable signal of
 * the selected state under the harness's NO_COLOR output is the exclusive
 * category's `(selected of total)` counter, which is driven by `option.selected`.
 *
 * Expected after the fix: the `Framework` counter stays `(1 of 1)` immediately
 * after the collapse — react is still active via global, so it must render as
 * selected, matching the state a save-and-reopen already produces (hydration's
 * `populateFromSkillIds` re-adds the active global skill to `domainSelections`).
 * On current code the counter reads `(0 of 1)`: the deselect assertion is RED
 * until `toggleTechnology` keeps a still-active-via-global skill in the domain
 * selection. cli-developer flips it green by fixing the store.
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
async function toggleReactToDualScope(
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

describe("dual-scope spacebar collapse — live in-session selected state", () => {
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
    "keeps react selected (still active via global) in the same session after the collapse spacebar",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Establish the persisted dual-scope pair via a real `s` toggle + save.
      await toggleReactToDualScope(projectDir, fakeHome, sourceDir, sourceTempDir);
      expect(await readReactEntries(projectDir)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);

      // Re-open and act on the LIVE session — do NOT save.
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      try {
        // Baseline: the persisted dual-scope row renders both badges and counts
        // react as the single selected framework.
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["P", "G"]);
        expect(await wizard.build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL)).toBe(
          1,
        );

        // Spacebar collapses the dual-scope pair: skillConfigs drops to a single
        // active inherited-global entry, so react is STILL active.
        await wizard.build.toggleFocusedSkill();

        // The badge correctly collapses to a single `G` — react remains installed
        // globally. This half already works on current code.
        expect(await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID)).toStrictEqual(["G"]);

        // RED until Bug 1 fix: react is still active via global, so the exclusive
        // Framework category must still count it as selected. Current code drops
        // it from domainSelections, so the live counter reads (0 of 1) here even
        // though the row still shows the `G` badge and a save-and-reopen renders
        // it selected again.
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(FRAMEWORK_CATEGORY_LABEL),
          "collapsed-but-still-global react must render as selected (1 of 1) in-session",
        ).toBe(1);
      } finally {
        wizard.abort();
        await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
        await wizard.destroy();
      }
    },
  );
});
