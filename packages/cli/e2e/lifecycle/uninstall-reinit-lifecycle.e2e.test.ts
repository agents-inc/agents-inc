import { realpathSync } from "fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  fileExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { installE2EStackDualScope, installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/**
 * init -> uninstall -> re-init produces an equivalent installation, and a project-scope uninstall
 * preserves the global one.
 */

let store: SeedConfigStore;

beforeAll(async () => {
  store = await startSeedConfigStore();
});

afterAll(async () => {
  await store.close();
});

describe("uninstall-reinit lifecycle", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "init then uninstall then re-init produces clean installation",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;

      await installE2EStackGlobally(store, fakeHome);

      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Config must exist after init").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Skills dir must exist after init").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Agents dir must exist after init").toBe(true);

      const configAfterFirstInit = await loadConfigOrFail(fakeHome);

      const uninstall = await runCLI(["uninstall", "--yes"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(uninstall.exitCode, `Uninstall failed: ${uninstall.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Asks after every spelling of the source folder, not only the resolved one.
      await expectNoSourceFolder(fakeHome, "uninstall removed the global install it made");
      expect(
        await directoryExists(globalSkillsDir),
        "Skills dir must be removed after uninstall",
      ).toBe(false);
      expect(
        await directoryExists(globalAgentsDir),
        "Agents dir must be removed after uninstall",
      ).toBe(false);

      await installE2EStackGlobally(store, fakeHome);

      expect(await fileExists(globalConfigPath), "Config must exist after re-init").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Skills dir must exist after re-init").toBe(
        true,
      );
      expect(await directoryExists(globalAgentsDir), "Agents dir must exist after re-init").toBe(
        true,
      );

      const configAfterReinit = await loadConfigOrFail(fakeHome);

      expect(
        configAfterReinit.skills,
        "a re-init must reproduce every skill entry the first init wrote",
      ).toStrictEqual(configAfterFirstInit.skills);
      expect(
        configAfterReinit.agents,
        "a re-init must reproduce every agent entry the first init wrote",
      ).toStrictEqual(configAfterFirstInit.agents);
    },
  );
});

describe("uninstall scope isolation", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "uninstall from project scope preserves global installation",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await installE2EStackDualScope(store, { fakeHome, projectDir });

      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Global config must exist before uninstall").toBe(
        true,
      );
      const globalConfigBefore = await readTestFile(globalConfigPath);
      const globalBefore = await loadConfigOrFail(fakeHome);

      const uninstall = await runCLI(["uninstall", "--yes"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(uninstall.exitCode, `Project uninstall failed: ${uninstall.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectSkillsDir = skillsPath(projectDir);
      const projectAgentsDir = agentsPath(projectDir);

      const projectSkillsExist = await directoryExists(projectSkillsDir);
      if (projectSkillsExist) {
        // If the directory still exists, it should be empty
        const entries = await listFiles(projectSkillsDir);
        expect(entries, "Project skills dir should be empty after uninstall").toStrictEqual([]);
      }

      expect(
        await directoryExists(projectAgentsDir),
        "Project agents dir should be removed after uninstall",
      ).toBe(false);

      expect(await fileExists(globalConfigPath), "Global config must still exist").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Global skills must still exist").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Global agents must still exist").toBe(true);

      // The only global-config change from a project uninstall is deregistering this project.
      const realProjectDir = realpathSync(projectDir);
      expect(
        globalConfigBefore,
        "project must be registered in the global config before uninstall",
      ).toContain(realProjectDir);

      const globalAfter = await loadConfigOrFail(fakeHome);
      expect(
        globalAfter.projects ?? [],
        "project must be deregistered from the global config after uninstall",
      ).not.toContain(realProjectDir);
      expect(globalAfter.skills, "global skills must be preserved").toStrictEqual(
        globalBefore.skills,
      );
      expect(globalAfter.agents, "global agents must be preserved").toStrictEqual(
        globalBefore.agents,
      );
    },
  );
});
