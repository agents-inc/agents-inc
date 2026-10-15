import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackDualScope,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- combined scope toggles.
 *
 * Tests changing BOTH a skill's and an agent's scope within a single edit,
 * and mixed-direction changes (P->G skill + G->P agent simultaneously).
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

describe("dual-scope edit lifecycle -- combined scope toggles", () => {
  let store: SeedConfigStore;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await installE2EStackDualScope(store, { fakeHome, projectDir });
  }, TIMEOUTS.LIFECYCLE);

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Change both a skill and an agent scope in a single edit",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      // Phase C: Edit -- web-framework-react G->P and web-developer G->P
      await applyFromSeed(
        store,
        "ReactAndWebDev1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          projectAgents: [API_DEV, WEB_DEV],
        }),
        { dir: projectDir, home: fakeHome },
      );

      // Phase D: Assertions

      // D-1: web-framework-react directory exists at project scope (G->P additive)
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G->P",
      ).toBe(true);

      // D-2: web-framework-react directory STILL exists at global scope (G->P is additive)
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope (G->P is additive)",
      ).toBe(true);

      // D-3: web-developer compiled agent exists at project scope (G->P additive)
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

      // D-4: web-developer compiled agent STILL exists at global scope (G->P is additive)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // D-5: Project config contains both web-framework-react and web-developer at project scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
        agents: ["api-developer", "web-developer"],
      });
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain("scope: 'project'");

      // D-6: Global config still has both (unchanged)
      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
        agents: ["web-developer"],
      });

      // D-7: Full dual-scope assertion with updated expectations
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          agents: ["api-developer", "web-developer"],
        },
      });
    },
  );

  it(
    "Skill scope collapse on a locked dual-scope pair alongside a working agent G->P",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair carried by the project
      // api-developer: naming it at global scope only collapses the pair P->G. web-developer
      // is a plain global agent, moved G->P the other way. This exercises both directions in
      // the same edit.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      await applyFromSeed(
        store,
        "HonoGlobalWebDevProject1",
        e2eStackPayload({ projectAgents: [API_DEV, WEB_DEV] }),
        { dir: projectDir, home: fakeHome },
      );

      // Phase D: Assertions

      // D-1: api-framework-hono collapsed to its global half — project override gone
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the collapse",
      ).toBe(false);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope",
      ).toBe(true);

      // D-2: the collapse drops the project override and leaves the global half.
      // Asserted on the whole entry list rather than on an absence: an entry list
      // that lost BOTH halves also has no project entry, and a scan of the emitted
      // text answers a question about the writer's line breaking instead.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the collapsed pair must leave the inherited global api-framework-hono entry and nothing else",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);

      // D-3: web-developer G->P worked — compiled at project scope AND still at global (additive)
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // D-4: Project config now includes web-developer alongside api-developer
      await expect({ dir: projectDir }).toHaveConfig({
        agents: ["api-developer", "web-developer"],
      });

      // D-5: api-developer still compiled at project scope (unchanged)
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      // D-6: The project config genuinely changed (web-developer G->P was applied)
      expect(await readTestFile(configTsPath(projectDir))).not.toBe(projectConfigBefore);
    },
  );
});
