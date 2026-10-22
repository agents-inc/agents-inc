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
  applyUnchangedFromSeed,
  createDualScopeEnvFromSeed,
  createGlobalOnlyEnvFromSeed,
  e2eStackPayload,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import "../matchers/setup.js";

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
      env = await createGlobalOnlyEnvFromSeed(store);

      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      await applyUnchangedFromSeed(store, "Unchanged1", e2eStackPayload(), {
        dir: env.projectDir,
        home: env.fakeHome,
      });

      await expect({ dir: env.fakeHome }).toHaveConfig({
        skillIds: [
          E2E_SKILL.react.id,
          E2E_SKILL.vitest.id,
          E2E_SKILL.zustand.id,
          E2E_SKILL.hono.id,
        ],
        agents: ["web-developer", "api-developer"],
      });

      // Normalized: strips the projects tracking line.
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeGlobalConfig(globalConfigAfter)).toStrictEqual(
        normalizeGlobalConfig(globalConfigBefore),
      );

      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent("api-developer");

      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: env.fakeHome }).toHaveSkillCopied(E2E_SKILL.zustand.id);
    },
  );

  // The harder shape: this deselect empties an exclusive category outright.
  it(
    "emptying an exclusive category leaves the global config untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnvFromSeed(store);
      const { fakeHome, projectDir } = env;

      const globalSkillsBefore = (await loadConfigOrFail(fakeHome)).skills;

      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "setup must persist an active project entry plus a global tombstone to have a project half to drop",
      ).toStrictEqual([
        { id: E2E_SKILL.hono.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.hono.id, scope: "project", origin: "eject" },
      ]);

      // Drops the project's half: the only skill in the exclusive API Framework category.
      await applyFromSeed(
        store,
        "WithoutProjectHono1",
        e2eStackPayload({ projectAgents: [E2E_AGENT["api-developer"].name] }),
        { dir: projectDir, home: fakeHome },
      );

      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });
      expect(
        (await loadConfigOrFail(fakeHome)).skills,
        "a project-scope deselect must leave every global entry — tombstones included — as it found them",
      ).toStrictEqual(globalSkillsBefore);

      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
      });

      // The side that changed: an active project entry beside a global tombstone is a pair, both
      // halves go, and the global one comes back un-tombstoned.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "emptying the category must leave the project owning no half of the pair",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);
    },
  );
});
