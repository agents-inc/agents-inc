import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configTsPath, directoryExists, fileExists, skillsPath } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { TIMEOUTS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { readSkillEntries, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  createGlobalOnlyEnvFromSeed,
  e2eStackPayload,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/**
 * D-224 — completing the G→P→G cycle cleanly. When a globally-installed skill
 * moves G→P (producing `{scope:"project"}` + `{scope:"global", excluded:true}`
 * tombstone), and later the SAME skill moves P→G, the tombstone MUST be removed
 * so the skill ends up at pure global scope again: exactly ONE `{react,
 * scope:"global"}` entry in the project config (no tombstone, no project entry),
 * and the skill physically at the global scope path and NOT at the project scope
 * path.
 *
 * Every scenario drives the real `init --from` + `edit --from` pipeline — no
 * manual writes to `config.ts` or skill directories.
 */

describe("edit — tombstone cleanup after P→G restoration", () => {
  let store: SeedConfigStore;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  /** React G→P: a project React beside the global one, assigned to no sub-agent. */
  function moveReactIntoProject(): Promise<unknown> {
    if (!env) throw new Error("no environment to edit");
    return applyFromSeed(
      store,
      "ReactProject1",
      e2eStackPayload({ projectSkills: [E2E_SKILL.react.id], unassigned: [E2E_SKILL.react.id] }),
      { dir: env.projectDir, home: env.fakeHome },
    );
  }

  /** React P→G, or any edit naming the configuration as globally installed. */
  function applyAllGlobal(id: string): Promise<unknown> {
    if (!env) throw new Error("no environment to edit");
    return applyFromSeed(store, id, e2eStackPayload(), {
      dir: env.projectDir,
      home: env.fakeHome,
    });
  }

  it(
    "Scenario B: full G→P→G cycle roundtrip — each phase asserted on config and filesystem",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install globally. Assert pure global state, no tombstone.
      env = await createGlobalOnlyEnvFromSeed(store);
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

      // Phase 2: G→P. Assert active project + global tombstone.
      await moveReactIntoProject();

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

      // Phase 3: P→G. Assert ONLY global active, no tombstone, no
      // project entry. This is the failure point this suite guards.
      await applyAllGlobal("AllGlobal1");

      const entriesPhase3 = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(entriesPhase3).toHaveLength(1);
      expect(entriesPhase3[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
      });
      expect(entriesPhase3.filter((entry) => entry.excluded === true)).toStrictEqual([]);
      expect(entriesPhase3.filter((entry) => entry.scope === "project")).toStrictEqual([]);
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(false);

      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );

  it(
    "Scenario C: no-op edit between G→P and P→G does not leave orphaned state",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install globally.
      env = await createGlobalOnlyEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      // Phase 2: G→P.
      await moveReactIntoProject();

      // Phase 3: no-op edit — MUST NOT leave orphaned state that would interfere
      // with the subsequent P→G move.
      await moveReactIntoProject();

      // Phase 4: P→G. Must produce the same clean end-state as Scenario B.
      await applyAllGlobal("AllGlobal2");

      // Config assertion: exactly ONE react entry at global scope, no tombstone.
      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
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

      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
