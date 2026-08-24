import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { configTsPath, ensureBinaryExists, readTestFile } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { TIMEOUTS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  readSkillBadgesViaEdit,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * D-233/D-260 — `s` collapse of a persisted dual-scope `[P][G]` skill, and the
 * `s` restore of the resulting inherited-global `[G]` row, save-and-reopen at
 * every step.
 *
 * `s` is the SOLE dual-scope toggle: it drives BOTH directions, and the spacebar
 * never changes a row backed by a real global install. This suite drives the real
 * wizard pipeline and asserts the full round-trip end-to-end:
 *
 *   Test 1 — collapse: seed global react, `s` G->P (persisted `[P][G]`), then `s`
 *     again to collapse. Project config drops to a single inherited-global entry
 *     `[{scope:"global"}]` and the re-opened row renders a single `G`.
 *
 *   Test 2 — restore: once a `[P][G]` skill is collapsed to a plain
 *     inherited-global `[G]` entry and saved, the project-scope presence is
 *     genuinely deleted (not "paused"). The behaviour is:
 *       (a) SPACEBAR on the collapsed `[G]`-only row is a NO-OP (a pure
 *           global-inherited row has no project override to deselect) — badges
 *           and on-disk config stay unchanged; and
 *       (b) `s` (the standard G->P scope-toggle) on that same `[G]` row restores
 *           project scope exactly like any other globally-inherited item, via
 *           the well-tested `toggleSkillScope` G->P path, re-creating a fresh
 *           `[P][G]` pair (`[{scope:"project"}, {scope:"global", excluded:true}]`).
 *
 * No manual writes to config.ts or skill dirs — every state transition goes
 * through the real wizard. Config assertions load config.ts structurally via
 * loadProjectConfigFromDir and compare with toStrictEqual; the no-op assertion
 * additionally snapshots the raw config.ts and requires it byte-identical.
 */

/**
 * Establish the collapsed inherited-global state:
 *   global react install -> `s` G->P (dual-scope) -> `s` P->G collapse -> `[G]`.
 * Returns after asserting the collapsed config is a single inherited-global entry.
 */
async function collapseToInheritedGlobal(projectDir: string, fakeHome: string): Promise<void> {
  // `s` G->P: produces the persisted dual-scope pair.
  await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
  expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
    { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
    { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
  ]);

  // `s` again: collapse the dual-scope pair to a single inherited-global entry.
  await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
  expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
    { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
  ]);
}

describe("dual-scope collapse and restoration driven by `s`", () => {
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "collapses a persisted [P][G] to a single inherited-global [G] on `s`",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      await collapseToInheritedGlobal(projectDir, fakeHome);

      // Re-open: the collapsed row renders a single `G` badge (inherited-global).
      const collapsedBadges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        E2E_SOURCE,
        E2E_SKILL.react.display,
      );
      expect(collapsedBadges).toStrictEqual(["G"]);

      // A collapse regenerates the project pair with one fewer project-scoped skill, which is
      // the shape a union collapses into. Both scopes, because the collapse is the project
      // giving a skill back to the global install rather than deleting it.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );

  it(
    "spacebar is a no-op on the collapsed [G] row while `s` restores it to a fresh [P][G] pair",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      await collapseToInheritedGlobal(projectDir, fakeHome);

      // (a) Spacebar on the collapsed inherited-global `[G]` row is a no-op: a
      // pure global-inherited row has no project override to deselect. Snapshot
      // the raw config first, drive a full `cc edit` pressing space on the row,
      // then require both the react rows and the whole config.ts byte-identical.
      const projectConfigPath = configTsPath(projectDir);
      const configBeforeSpace = await readTestFile(projectConfigPath);

      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "space");

      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
      ]);
      const configAfterSpace = await readTestFile(projectConfigPath);
      expect(
        configAfterSpace,
        "project config.ts must be unchanged after an inert spacebar on the [G] row",
      ).toBe(configBeforeSpace);

      const noopBadges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        E2E_SOURCE,
        E2E_SKILL.react.display,
      );
      expect(noopBadges).toStrictEqual(["G"]);

      // (b) `s` on the same collapsed `[G]` row restores project scope via the
      // standard `toggleSkillScope` G->P path — re-creating a fresh dual-scope
      // pair (active project entry + global excluded tombstone).
      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");

      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);

      const restoredBadges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        E2E_SOURCE,
        E2E_SKILL.react.display,
      );
      expect(restoredBadges.slice().sort()).toStrictEqual(["G", "P"]);

      // The restored pair is a fresh project-scope install of a skill the global scope still
      // holds, so both sides carry it and both generated pairs have to hold.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
