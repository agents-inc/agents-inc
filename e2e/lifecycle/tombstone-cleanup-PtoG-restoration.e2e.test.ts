import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  skillsPath,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  readSkillBadgesViaEdit,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * D-224 — Wizard hides global install state after P→G toggle when a prior
 * tombstone existed.
 *
 * After D-223 landed, the wizard correctly surfaces dual-scope badges for
 * tombstoned skills. D-224 is the next step in the same cluster: completing
 * the G→P→G cycle cleanly. When a user toggles a globally-installed skill
 * G→P (producing `{scope:"project"}` + `{scope:"global", excluded:true}`
 * tombstone), then later toggles the SAME skill P→G, the tombstone MUST be
 * removed so the skill ends up at pure global scope again.
 *
 * Observed bug (current main): `toggleSkillScope` reads `installedSkillConfigs`
 * with a `!sc.excluded` filter, so when the project config carries only the
 * tombstone, `wasInstalledGlobally` evaluates false and the tombstone-removal
 * branch is skipped. The active project entry gets its scope flipped in place
 * to `"global"`, leaving a pathological pair: `[{react, scope:"global"},
 * {react, scope:"global", excluded:true}]`. The config writer's compound-key
 * merge treats `excluded` as a distinct axis, so both entries persist to disk.
 *
 * Expected after fix: exactly ONE `{react, scope:"global"}` entry in the
 * project config (no tombstone, no project entry), skill physically at the
 * global scope path and NOT at the project scope path, and the wizard renders
 * a single `G` badge on re-open.
 *
 * All three scenarios drive the real `cc init` + `cc edit` pipeline — no
 * manual writes to `config.ts` or skill directories. Expected to FAIL on
 * `main` until `toggleSkillScope` is fixed (or a writer-side invariant is
 * added per investigation 09).
 */

describe("edit wizard — tombstone cleanup after P→G restoration", () => {
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
    "Scenario A: P→G restoration removes the tombstone and collapses to a single global entry",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install all E2E skills globally, bootstrap an all-global project.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Phase 2: toggle react G→P via real `cc edit`. Produces the dual-scope
      // state in project config (D-223 territory — validated by its own suite).
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // Phase 3: toggle react P→G. D-224's failure point — must remove the
      // tombstone and collapse to a single global entry.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "space");

      // Config assertion: exactly ONE react entry, scope global, no tombstone.
      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        source: "eject",
      });

      // No project-scope entry for react may remain.
      const projectScoped = reactEntries.filter((entry) => entry.scope === "project");
      expect(projectScoped).toStrictEqual([]);

      // No excluded tombstone for react may remain.
      const tombstones = reactEntries.filter((entry) => entry.excluded === true);
      expect(tombstones).toStrictEqual([]);

      // Filesystem assertion: react at global path, absent from project path.
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        `react must remain physically installed at ${globalSkillDir} (global untouched)`,
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        `react must be removed from ${projectSkillDir} after P→G restoration`,
      ).toBe(false);

      // Phase 4: re-open the wizard. Must show a single `G` badge (not dual,
      // not missing) for react.
      const badges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        sourceDir,
        sourceTempDir,
        E2E_SKILL.react.id,
      );
      expect(badges).toStrictEqual(["G"]);
    },
  );

  it(
    "Scenario B: full G→P→G cycle roundtrip — each phase asserted on config and filesystem",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install globally. Assert pure global state, no tombstone.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      const projectConfigPath = configTsPath(projectDir);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);

      // After a pure-global init with no project overrides, the project config
      // file may not exist at all (the skill is inherited). If it does exist,
      // it must carry no tombstone and no project-scoped entry for react.
      if (await fileExists(projectConfigPath)) {
        const entriesPhase1 = await readSkillEntries(projectDir, E2E_SKILL.react.id);
        expect(entriesPhase1.filter((entry) => entry.excluded === true)).toStrictEqual([]);
        expect(entriesPhase1.filter((entry) => entry.scope === "project")).toStrictEqual([]);
      }
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(false);

      // Phase 2: toggle G→P. Assert active project + global tombstone.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      const entriesPhase2 = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      const activePhase2 = entriesPhase2.find((entry) => entry.excluded !== true);
      const tombstonePhase2 = entriesPhase2.find((entry) => entry.excluded === true);
      expect(activePhase2, "G→P must produce an active project entry").toBeDefined();
      expect(tombstonePhase2, "G→P must produce a global tombstone").toBeDefined();
      expect(activePhase2?.scope).toBe("project");
      expect(tombstonePhase2?.scope).toBe("global");
      expect(tombstonePhase2?.excluded).toBe(true);
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(true);

      // Phase 3: toggle P→G. Assert ONLY global active, no tombstone, no
      // project entry. This is the D-224 failure point.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "space");

      const entriesPhase3 = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(entriesPhase3).toHaveLength(1);
      expect(entriesPhase3[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        source: "eject",
      });
      expect(entriesPhase3.filter((entry) => entry.excluded === true)).toStrictEqual([]);
      expect(entriesPhase3.filter((entry) => entry.scope === "project")).toStrictEqual([]);
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(false);
    },
  );

  it(
    "Scenario C: no-op edit between G→P and P→G does not leave orphaned state",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install globally.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Phase 2: toggle G→P.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // Phase 3: no-op passthrough edit — MUST NOT leave orphaned state that
      // would interfere with the subsequent P→G toggle.
      const passThroughWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      try {
        const result = await passThroughWizard.passThrough();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await passThroughWizard.destroy();
      }

      // Phase 4: toggle P→G. Must produce the same clean end-state as Scenario A.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "space");

      // Config assertion: exactly ONE react entry at global scope, no tombstone.
      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        source: "eject",
      });
      expect(reactEntries.filter((entry) => entry.excluded === true)).toStrictEqual([]);
      expect(reactEntries.filter((entry) => entry.scope === "project")).toStrictEqual([]);

      // Filesystem assertion.
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        `react must remain physically installed at ${globalSkillDir} (global untouched)`,
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        `react must be removed from ${projectSkillDir} after P→G restoration`,
      ).toBe(false);

      // Re-open wizard: single `G` badge, no dual-scope residue.
      const badges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        sourceDir,
        sourceTempDir,
        E2E_SKILL.react.id,
      );
      expect(badges).toStrictEqual(["G"]);
    },
  );
});
