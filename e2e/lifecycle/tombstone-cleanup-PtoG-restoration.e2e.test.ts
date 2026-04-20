import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";

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

const REACT_SKILL_ID = "web-framework-react";

type SkillEntry = {
  id: string;
  scope: "project" | "global";
  source: string;
  excluded?: boolean;
};

/**
 * Extract all `{...}` JSON objects referencing the given skill id from a
 * rendered `config.ts` string. The writer emits each skill entry as a single
 * flat object literal per line, so a non-greedy match on `{...}` blocks that
 * include `"id":"<skillId>"` captures exactly the entries we want.
 */
function parseSkillEntries(configText: string, skillId: string): SkillEntry[] {
  const pattern = new RegExp(`\\{[^{}]*"id":"${skillId}"[^{}]*\\}`, "g");
  const matches = Array.from(configText.matchAll(pattern));
  // Boundary cast: JSON.parse returns unknown, caller consumes as SkillEntry.
  return matches.map((match) => JSON.parse(match[0]) as SkillEntry);
}

describe("edit wizard — tombstone cleanup after P→G restoration", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

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
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
  });

  /**
   * Drive `cc edit` once to toggle the first-focused skill (web-framework-react
   * in the Web domain) G→P. Produces the dual-scope config: an active
   * `{scope:"project"}` entry alongside a `{scope:"global", excluded:true}`
   * tombstone.
   */
  async function performGlobalToProjectToggle(projectDir: string, fakeHome: string): Promise<void> {
    const toggleWizard = await EditWizard.launch({
      projectDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: fakeHome },
      rows: 60,
      cols: 120,
    });

    try {
      // Web domain: focus defaults to web-framework-react. Toggle G→P.
      await toggleWizard.build.toggleScopeOnFocusedSkill();
      await toggleWizard.build.advanceDomain();
      // API domain: pass through.
      await toggleWizard.build.advanceDomain();
      // Methodology domain: advance to sources.
      const sources = await toggleWizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
    } finally {
      await toggleWizard.destroy();
    }
  }

  /**
   * Drive `cc edit` once to toggle the first-focused skill P→G. On the second
   * session, web-framework-react is focused by default (Web domain, first
   * category, first option) and currently carries the dual-scope state from
   * the prior G→P. This is the toggle that D-224 mis-handles.
   */
  async function performProjectToGlobalToggle(projectDir: string, fakeHome: string): Promise<void> {
    const toggleWizard = await EditWizard.launch({
      projectDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: fakeHome },
      rows: 60,
      cols: 120,
    });

    try {
      // Web domain: focus defaults to web-framework-react (now at P with G
      // tombstone). Toggle P→G — should collapse to pure global, no tombstone.
      await toggleWizard.build.toggleScopeOnFocusedSkill();
      await toggleWizard.build.advanceDomain();
      // API domain: pass through.
      await toggleWizard.build.advanceDomain();
      // Methodology domain: advance to sources.
      const sources = await toggleWizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
    } finally {
      await toggleWizard.destroy();
    }
  }

  it(
    "Scenario A: P→G restoration removes the tombstone and collapses to a single global entry",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Phase 1: install all E2E skills globally, bootstrap an all-global project.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Phase 2: toggle react G→P via real `cc edit`. Produces the dual-scope
      // state in project config (D-223 territory — validated by its own suite).
      await performGlobalToProjectToggle(projectDir, fakeHome);

      // Phase 3: toggle react P→G. D-224's failure point — must remove the
      // tombstone and collapse to a single global entry.
      await performProjectToGlobalToggle(projectDir, fakeHome);

      // Config assertion: exactly ONE react entry, scope global, no tombstone.
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectConfig = await readTestFile(projectConfigPath);
      const reactEntries = parseSkillEntries(projectConfig, REACT_SKILL_ID);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: REACT_SKILL_ID,
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
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);
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
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      const badges = await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID);
      expect(badges).toStrictEqual(["G"]);

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario B: full G→P→G cycle roundtrip — each phase asserted on config and filesystem",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Phase 1: install globally. Assert pure global state, no tombstone.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);

      // After a pure-global init with no project overrides, the project config
      // file may not exist at all (the skill is inherited). If it does exist,
      // it must carry no tombstone and no project-scoped entry for react.
      if (await fileExists(projectConfigPath)) {
        const configPhase1 = await readTestFile(projectConfigPath);
        const entriesPhase1 = parseSkillEntries(configPhase1, REACT_SKILL_ID);
        expect(entriesPhase1.filter((entry) => entry.excluded === true)).toStrictEqual([]);
        expect(entriesPhase1.filter((entry) => entry.scope === "project")).toStrictEqual([]);
      }
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(false);

      // Phase 2: toggle G→P. Assert active project + global tombstone.
      await performGlobalToProjectToggle(projectDir, fakeHome);

      const configPhase2 = await readTestFile(projectConfigPath);
      const entriesPhase2 = parseSkillEntries(configPhase2, REACT_SKILL_ID);
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
      await performProjectToGlobalToggle(projectDir, fakeHome);

      const configPhase3 = await readTestFile(projectConfigPath);
      const entriesPhase3 = parseSkillEntries(configPhase3, REACT_SKILL_ID);
      expect(entriesPhase3).toHaveLength(1);
      expect(entriesPhase3[0]).toStrictEqual({
        id: REACT_SKILL_ID,
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
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Phase 1: install globally.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Phase 2: toggle G→P.
      await performGlobalToProjectToggle(projectDir, fakeHome);

      // Phase 3: no-op passthrough edit — MUST NOT leave orphaned state that
      // would interfere with the subsequent P→G toggle.
      const passThroughWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      try {
        const result = await passThroughWizard.passThrough();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await passThroughWizard.destroy();
      }

      // Phase 4: toggle P→G. Must produce the same clean end-state as Scenario A.
      await performProjectToGlobalToggle(projectDir, fakeHome);

      // Config assertion: exactly ONE react entry at global scope, no tombstone.
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectConfig = await readTestFile(projectConfigPath);
      const reactEntries = parseSkillEntries(projectConfig, REACT_SKILL_ID);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: REACT_SKILL_ID,
        scope: "global",
        source: "eject",
      });
      expect(reactEntries.filter((entry) => entry.excluded === true)).toStrictEqual([]);
      expect(reactEntries.filter((entry) => entry.scope === "project")).toStrictEqual([]);

      // Filesystem assertion.
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, REACT_SKILL_ID);
      expect(
        await directoryExists(globalSkillDir),
        `react must remain physically installed at ${globalSkillDir} (global untouched)`,
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        `react must be removed from ${projectSkillDir} after P→G restoration`,
      ).toBe(false);

      // Re-open wizard: single `G` badge, no dual-scope residue.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      const badges = await wizard.build.getScopeBadgesForSkill(REACT_SKILL_ID);
      expect(badges).toStrictEqual(["G"]);

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );
});
