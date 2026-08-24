import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";

import "../matchers/setup.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Live in-session render state of a dual-scope skill immediately after an `s`
 * collapse — BEFORE the wizard is saved and re-opened.
 *
 * The sibling suites `dual-scope-collapse-and-restore-via-s.e2e.test.ts` and
 * `tombstone-cleanup-PtoG-restoration.e2e.test.ts` assert on the SAVED config.ts
 * (and on the scope BADGES of a freshly re-opened wizard). Neither inspects the
 * grid's SELECTED state in the same session, mid-edit, right after the keypress.
 *
 * The gap that leaves: `s` on a persisted `[P][G]` pair collapses `skillConfigs`
 * to a single active inherited-global entry (`{scope:"global"}`), so the skill is
 * genuinely STILL active and must keep rendering as SELECTED. A row that dropped
 * out of the exclusive category's selection while still being installed globally
 * would misreport the state a save-and-reopen re-derives (hydration's
 * `populateFromSkillIds` re-adds the active global skill to `domainSelections`).
 *
 * The scope badge (sourced from `skillConfigs.scope`) collapses to a single ` G `,
 * which is why a badge-only assertion (all the sibling suites) cannot see this:
 * the badge and the selected state can disagree. The one text-observable signal
 * of the selected state under the harness's NO_COLOR output is the exclusive
 * category's `(selected of total)` counter, driven by `option.selected` — so the
 * `Framework` counter must stay `(1 of 1)` across the collapse.
 */

describe("dual-scope `s` collapse — live in-session selected state", () => {
  let env: DualScopeEnv | undefined;

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "keeps react selected (still active via global) in the same session after the `s` collapse",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      // Establish the persisted dual-scope pair via a real `s` toggle + save.
      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);

      // Re-open and act on the LIVE session — do NOT save.
      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        // Focus react explicitly rather than relying on where the grid opens: the
        // `s` collapse below acts on the focused skill.
        await wizard.build.focusSkill(E2E_SKILL.react.display);

        // Baseline: the persisted dual-scope row renders both badges and counts
        // react as the single selected framework.
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display)).toStrictEqual([
          "P",
          "G",
        ]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
        ).toBe(1);

        // `s` collapses the dual-scope pair: skillConfigs drops to a single
        // active inherited-global entry, so react is STILL active.
        await wizard.build.toggleScopeOnFocusedSkill();

        // The badge collapses to a single `G` — react remains installed globally.
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display)).toStrictEqual([
          "G",
        ]);

        // React is still active via global, so the exclusive Framework category
        // must still count it as selected — the badge and the selected state must
        // not disagree, and a save-and-reopen renders it selected too.
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "collapsed-but-still-global react must render as selected (1 of 1) in-session",
        ).toBe(1);
      } finally {
        await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      }
    },
  );
});
