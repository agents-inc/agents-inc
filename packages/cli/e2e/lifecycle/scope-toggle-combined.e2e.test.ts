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

/** One edit changing both a skill's and an agent's scope, in the same and opposite directions. */

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
      await applyFromSeed(
        store,
        "ReactAndWebDev1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          projectAgents: [API_DEV, WEB_DEV],
        }),
        { dir: projectDir, home: fakeHome },
      );

      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G->P",
      ).toBe(true);

      // G->P is additive.
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope (G->P is additive)",
      ).toBe(true);

      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
        agents: ["api-developer", "web-developer"],
      });
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain("scope: 'project'");

      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
        agents: ["web-developer"],
      });

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
      // The [P][G] skill collapses P->G while web-developer moves G->P: both directions at once.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      await applyFromSeed(
        store,
        "HonoGlobalWebDevProject1",
        e2eStackPayload({ projectAgents: [API_DEV, WEB_DEV] }),
        { dir: projectDir, home: fakeHome },
      );

      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the collapse",
      ).toBe(false);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope",
      ).toBe(true);

      // The whole entry list: losing BOTH halves also leaves no project entry.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the collapsed pair must leave the inherited global api-framework-hono entry and nothing else",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);

      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      await expect({ dir: projectDir }).toHaveConfig({
        agents: ["api-developer", "web-developer"],
      });

      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      expect(await readTestFile(configTsPath(projectDir))).not.toBe(projectConfigBefore);
    },
  );
});
