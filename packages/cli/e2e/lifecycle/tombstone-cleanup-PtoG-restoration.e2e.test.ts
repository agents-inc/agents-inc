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
 * A skill moved G->P (project entry plus global tombstone) and then P->G again must end at pure
 * global scope: one global entry, no tombstone, files only at the global path.
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

  function moveReactIntoProject(): Promise<unknown> {
    if (!env) throw new Error("no environment to edit");
    return applyFromSeed(
      store,
      "ReactProject1",
      e2eStackPayload({ projectSkills: [E2E_SKILL.react.id], unassigned: [E2E_SKILL.react.id] }),
      { dir: env.projectDir, home: env.fakeHome },
    );
  }

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
      env = await createGlobalOnlyEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      const projectConfigPath = configTsPath(projectDir);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);

      // With no project overrides the project config may not exist; if it does, no tombstone.
      if (await fileExists(projectConfigPath)) {
        const entriesPhase1 = await readSkillEntries(projectDir, E2E_SKILL.react.id);
        expect(entriesPhase1.filter((entry) => entry.excluded === true)).toStrictEqual([]);
        expect(entriesPhase1.filter((entry) => entry.scope === "project")).toStrictEqual([]);
      }
      expect(await directoryExists(globalSkillDir)).toBe(true);
      expect(await directoryExists(projectSkillDir)).toBe(false);

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
      env = await createGlobalOnlyEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      await moveReactIntoProject();

      // A no-op edit must leave no orphaned state that would interfere with the P->G move.
      await moveReactIntoProject();

      await applyAllGlobal("AllGlobal2");

      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);

      expect(reactEntries).toHaveLength(1);
      expect(reactEntries[0]).toStrictEqual({
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
      });
      expect(reactEntries.filter((entry) => entry.excluded === true)).toStrictEqual([]);
      expect(reactEntries.filter((entry) => entry.scope === "project")).toStrictEqual([]);

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
