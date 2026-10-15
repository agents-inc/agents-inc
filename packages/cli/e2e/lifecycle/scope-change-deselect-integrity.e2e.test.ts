import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TIMEOUTS } from "../pages/constants.js";
import {
  configTsPath,
  loadConfigOrFail,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { readSkillEntries, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  createDualScopeEnvFromSeed,
  createGlobalOnlyEnvFromSeed,
  e2eStackPayload,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import "../matchers/setup.js";

/**
 * D-192: Scope toggle then deselect preserves global config.
 *
 * Verifies that `detectConfigChanges` diffs against `oldConfig.skills`
 * (not `currentSkillIds`), so deselecting a skill from project scope
 * does not trigger removal from the global config.
 *
 * The deselect here empties an exclusive category outright (hono, the only skill the fixture
 * gives API Framework); dropping react's project half out of a category that still holds other
 * skills is `project-edit-removes-project-half-of-pair.e2e.test.ts`. It carries an assertion on
 * the project side as well, because the global assertions alone read identically against an
 * edit that did nothing.
 */

describe("scope change deselect integrity", () => {
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

  it(
    "no-op edit from project scope should not remove globally installed skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global-only env (all skills at global scope)
      env = await createGlobalOnlyEnvFromSeed(store);

      // Snapshot global config before edit
      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from project scope with the configuration as installed
      await applyFromSeed(store, "Unchanged1", e2eStackPayload(), {
        dir: env.projectDir,
        home: env.fakeHome,
      });

      // Assert: global config is unchanged -- all skills and agents still present
      await expect({ dir: env.fakeHome }).toHaveConfig({
        skillIds: [
          E2E_SKILL.react.id,
          E2E_SKILL.vitest.id,
          E2E_SKILL.zustand.id,
          E2E_SKILL.hono.id,
        ],
        agents: ["web-developer", "api-developer"],
      });

      // Normalize both configs (strip projects tracking line) and compare
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeGlobalConfig(globalConfigAfter)).toStrictEqual(
        normalizeGlobalConfig(globalConfigBefore),
      );

      // Assert: global agent files still exist on disk
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("api-developer");

      // Global skill files must still exist on disk
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.zustand.id);
    },
  );

  // The second shape the same invariant has to hold over. The deselect above drops one half of
  // a pair inside a category that still has other skills in it; this one empties an exclusive
  // category outright, which is the state that used to be refused. Both must leave the global
  // config alone, and a spec covering only the first cannot tell an invariant that holds from
  // one whose harder case never runs.
  it(
    "emptying an exclusive category leaves the global config untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: dual-scope env (global web skills + project hono)
      env = await createDualScopeEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      // Snapshot global skills before edit
      const globalSkillsBefore = (await loadConfigOrFail(fakeHome)).skills;

      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "setup must persist an active project entry plus a global tombstone to have a project half to drop",
      ).toStrictEqual([
        { id: E2E_SKILL.hono.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.hono.id, scope: "project", origin: "eject" },
      ]);

      // Edit from project scope with api-framework-hono at global scope only, which drops the
      // project's half — the only skill the fixture gives the exclusive API Framework category.
      await applyFromSeed(
        store,
        "WithoutProjectHono1",
        e2eStackPayload({ projectAgents: [E2E_AGENT["api-developer"].name] }),
        { dir: projectDir, home: fakeHome },
      );

      // Assert: global config skills array is identical (no skills lost or gained)
      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });
      expect(
        (await loadConfigOrFail(fakeHome)).skills,
        "a project-scope deselect must leave every global entry — tombstones included — as it found them",
      ).toStrictEqual(globalSkillsBefore);

      // Assert: global agent files still exist on disk
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Assert: project config still exists and retains web skills from global scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });

      // The departure, on the side that actually changed. The global assertions above say what
      // the deselect did NOT touch and would read identically against an edit that did nothing —
      // this is the half that says the edit did something.
      //
      // The expected shape is the dual-scope collapse: an active project entry beside a global
      // tombstone is a pair, both halves go, and the global one comes back un-tombstoned.
      // `project-edit-removes-project-half-of-pair.e2e.test.ts` pins the same collapse over react
      // with the same literal, so a mismatch here is a difference between the two categories
      // rather than a licence to loosen the assertion.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "emptying the category must leave the project owning no half of the pair",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);
    },
  );
});
