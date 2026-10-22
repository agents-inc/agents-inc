import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  DUAL_SCOPE,
  applyFromSeed,
  e2eStackPayload,
  installE2EStackDualScope,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode full cycle -- eject to plugin and back", () => {
  let pluginFixture: E2EPluginSource;
  let store: SeedConfigStore;
  let tempDir: string;

  beforeAll(async () => {
    pluginFixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    await store.close();
    await cleanupFixture(pluginFixture);
  });

  it(
    "switching install mode from eject to plugin and back preserves skill selection",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await installE2EStackDualScope(store, env, pluginFixture.sourceDir);

      const projectConfigPath = configTsPath(projectDir);
      const configPhaseA = await readTestFile(projectConfigPath);
      expect(configPhaseA).toContain("'eject'");

      const initialEntries = await readAllSkillEntries(projectDir);
      expect(
        initialEntries.map((entry) => entry.id),
        "the dual-scope setup must install hono into the project scope",
      ).toContain(E2E_SKILL.hono.id);

      const site = { dir: projectDir, home: fakeHome };

      await applyFromSeed(
        store,
        "HonoPlugin1",
        e2eStackPayload({ ...DUAL_SCOPE, pluginSkills: [E2E_SKILL.hono.id] }),
        site,
      );

      // The project's own hono is the half this session owns, so the switch lands there. The
      // fixture's marketplace is `e2e-test-<timestamp>`, never the public default.
      const projectHonoPhaseB = (await readAllSkillEntries(projectDir)).find(
        (entry) => entry.id === E2E_SKILL.hono.id && entry.scope === "project",
      );
      expect(
        projectHonoPhaseB,
        "the project-owned hono entry must name the marketplace this fixture published",
      ).toStrictEqual({
        id: E2E_SKILL.hono.id,
        scope: "project",
        origin: pluginFixture.marketplaceName,
      });

      await applyFromSeed(store, "HonoEject1", e2eStackPayload(DUAL_SCOPE), site);

      expect(
        await readAllSkillEntries(projectDir),
        "the round trip must restore every entry, not merely some of them",
      ).toStrictEqual(initialEntries);

      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
    },
  );
});
