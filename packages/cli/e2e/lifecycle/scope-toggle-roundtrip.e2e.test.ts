import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { TIMEOUTS, DIRS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  DUAL_SCOPE,
  applyFromSeed,
  e2eStackPayload,
  installE2EStackDualScope,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  normalizeConfigPreservingOrder,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";

/** An edit that changes nothing does not mutate scope or config. */

describe("scope toggle roundtrip", () => {
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
    "Passthrough edit should not change scope of any skill or agent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const projectConfigPath = configTsPath(projectDir);
      const globalConfigPath = configTsPath(fakeHome);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      const globalConfigBefore = await readTestFile(globalConfigPath);

      await applyFromSeed(store, "Unchanged1", e2eStackPayload(DUAL_SCOPE), {
        dir: projectDir,
        home: fakeHome,
      });

      // The project config is where a project-scope passthrough would write, so check both.
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(normalizeConfigPreservingOrder(globalConfigAfter)).toStrictEqual(
        normalizeConfigPreservingOrder(globalConfigBefore),
      );

      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(normalizeConfigPreservingOrder(projectConfigAfter)).toStrictEqual(
        normalizeConfigPreservingOrder(projectConfigBefore),
      );

      const globalSkillsDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS);
      for (const skillName of [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id]) {
        expect(
          await directoryExists(path.join(globalSkillsDir, skillName)),
          `${skillName} must still exist at global scope`,
        ).toBe(true);
      }

      const projectSkillsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS);
      expect(
        await directoryExists(path.join(projectSkillsDir, E2E_SKILL.hono.id)),
        "api-framework-hono must still exist at project scope",
      ).toBe(true);

      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
    },
  );
});
