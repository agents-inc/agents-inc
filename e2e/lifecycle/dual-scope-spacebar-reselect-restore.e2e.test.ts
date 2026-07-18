import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists, readTestFile } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import type { SkillConfig } from "../../src/cli/types/config.js";

/**
 * D-233 — spacebar collapse of a persisted dual-scope `[P][G]` skill, and the
 * sanctioned `s` restore of the resulting inherited-global `[G]` row.
 *
 * The sibling suite `tombstone-cleanup-PtoG-restoration.e2e.test.ts` also
 * exercises the COLLAPSE half via `cc edit` (persisted `[P][G]` + spacebar ->
 * inherited-global `[G]`). This suite drives the same real wizard pipeline and
 * asserts the full round-trip end-to-end:
 *
 *   Test 1 — collapse: seed global react, `s` G->P (persisted `[P][G]`),
 *     spacebar collapse. Project config drops to a single inherited-global
 *     entry `[{scope:"global"}]` and the re-opened row renders a single `G`.
 *
 *   Test 2 — restore: once a `[P][G]` skill is collapsed to a plain
 *     inherited-global `[G]` entry and saved, the project-scope presence is
 *     genuinely deleted (not "paused"). The correct, user-confirmed behaviour is:
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

const REACT_SKILL_ID = "web-framework-react";

/** Load the project config's react entries, sorted deterministically for toStrictEqual. */
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
 * Drive one `cc edit` session, applying the given action to the first-focused
 * skill (web-framework-react in the Web domain), then save through to completion.
 *
 *   - "scope": press `s` (G->P scope toggle)
 *   - "space": press space (toggle project-scope presence)
 */
async function runEditWithFirstSkillAction(
  projectDir: string,
  fakeHome: string,
  sourceDir: string,
  sourceTempDir: string,
  action: "scope" | "space",
): Promise<void> {
  const wizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });

  try {
    if (action === "scope") {
      await wizard.build.toggleScopeOnFocusedSkill();
    } else {
      await wizard.build.toggleFocusedSkill();
    }
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

/** Re-open `cc edit`, read react's scope badges, then abort without saving. */
async function readReactBadges(
  projectDir: string,
  fakeHome: string,
  sourceDir: string,
  sourceTempDir: string,
): Promise<Array<"P" | "G">> {
  const wizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });
  try {
    return await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID);
  } finally {
    wizard.abort();
    await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    await wizard.destroy();
  }
}

/**
 * Establish the collapsed inherited-global state:
 *   global react install -> `s` G->P (dual-scope) -> spacebar collapse -> `[G]`.
 * Returns after asserting the collapsed config is a single inherited-global entry.
 */
async function collapseToInheritedGlobal(
  projectDir: string,
  fakeHome: string,
  sourceDir: string,
  sourceTempDir: string,
): Promise<void> {
  // `s` G->P: produces the persisted dual-scope pair.
  await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");
  expect(await readReactEntries(projectDir)).toStrictEqual([
    { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
    { id: REACT_SKILL_ID, scope: "project", source: "eject" },
  ]);

  // Spacebar: collapse dual-scope pair to a single inherited-global entry.
  await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "space");
  expect(await readReactEntries(projectDir)).toStrictEqual([
    { id: REACT_SKILL_ID, scope: "global", source: "eject" },
  ]);
}

describe("D-233 — spacebar dual-scope collapse and re-select restoration", () => {
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
    "collapses a persisted [P][G] to a single inherited-global [G] on spacebar",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      await collapseToInheritedGlobal(projectDir, fakeHome, sourceDir, sourceTempDir);

      // Re-open: the collapsed row renders a single `G` badge (inherited-global).
      const collapsedBadges = await readReactBadges(projectDir, fakeHome, sourceDir, sourceTempDir);
      expect(collapsedBadges).toStrictEqual(["G"]);
    },
  );

  it(
    "spacebar is a no-op on the collapsed [G] row while `s` restores it to a fresh [P][G] pair",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      await collapseToInheritedGlobal(projectDir, fakeHome, sourceDir, sourceTempDir);

      // (a) Spacebar on the collapsed inherited-global `[G]` row is a no-op: a
      // pure global-inherited row has no project override to deselect. Snapshot
      // the raw config first, drive a full `cc edit` pressing space on the row,
      // then require both the react rows and the whole config.ts byte-identical.
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const configBeforeSpace = await readTestFile(projectConfigPath);

      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "space");

      expect(await readReactEntries(projectDir)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject" },
      ]);
      const configAfterSpace = await readTestFile(projectConfigPath);
      expect(
        configAfterSpace,
        "project config.ts must be unchanged after an inert spacebar on the [G] row",
      ).toBe(configBeforeSpace);

      const noopBadges = await readReactBadges(projectDir, fakeHome, sourceDir, sourceTempDir);
      expect(noopBadges).toStrictEqual(["G"]);

      // (b) `s` on the same collapsed `[G]` row restores project scope via the
      // standard `toggleSkillScope` G->P path — re-creating a fresh dual-scope
      // pair (active project entry + global excluded tombstone).
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      expect(await readReactEntries(projectDir)).toStrictEqual([
        { id: REACT_SKILL_ID, scope: "global", source: "eject", excluded: true },
        { id: REACT_SKILL_ID, scope: "project", source: "eject" },
      ]);

      const restoredBadges = await readReactBadges(projectDir, fakeHome, sourceDir, sourceTempDir);
      expect(restoredBadges.slice().sort()).toStrictEqual(["G", "P"]);
    },
  );
});
