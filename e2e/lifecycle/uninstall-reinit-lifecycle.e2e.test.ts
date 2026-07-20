import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readTestFile,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobalWithEject,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Uninstall / re-init lifecycle E2E tests.
 *
 * Covers two lifecycle gaps:
 * 1. Init -> Uninstall -> Re-init produces a clean, equivalent installation
 * 2. Uninstall from project scope preserves the global installation
 */

let sourceDir: string;
let sourceTempDir: string;

beforeAll(async () => {
  await ensureBinaryExists();
  const source = await createE2ESource();
  sourceDir = source.sourceDir;
  sourceTempDir = source.tempDir;
}, TIMEOUTS.SETUP_DUAL);

afterAll(async () => {
  if (sourceTempDir) await cleanupTempDir(sourceTempDir);
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

      // Phase A: Init global with eject mode
      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Verify Phase A installation exists
      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Config must exist after init").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Skills dir must exist after init").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Agents dir must exist after init").toBe(true);

      // Snapshot Phase A config for later comparison
      const configAfterFirstInit = await readTestFile(globalConfigPath);

      // Phase B: Uninstall with --all --yes
      const uninstall = await runCLI(["uninstall", "--yes", "--all"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(uninstall.exitCode, `Uninstall failed: ${uninstall.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Verify uninstall cleaned everything
      expect(
        await directoryExists(path.join(fakeHome, DIRS.CLAUDE_SRC)),
        "Config dir must be removed after uninstall --all",
      ).toBe(false);
      expect(
        await directoryExists(globalSkillsDir),
        "Skills dir must be removed after uninstall",
      ).toBe(false);
      expect(
        await directoryExists(globalAgentsDir),
        "Agents dir must be removed after uninstall",
      ).toBe(false);

      // Phase C: Re-init global with eject mode
      const phaseC = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseC.exitCode, `Phase C re-init failed: ${phaseC.output}`).toBe(EXIT_CODES.SUCCESS);

      // Verify re-init produced a complete installation
      expect(await fileExists(globalConfigPath), "Config must exist after re-init").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Skills dir must exist after re-init").toBe(
        true,
      );
      expect(await directoryExists(globalAgentsDir), "Agents dir must exist after re-init").toBe(
        true,
      );

      // Verify config contents are equivalent to Phase A
      const configAfterReinit = await readTestFile(globalConfigPath);

      // Extract skill IDs from both configs
      const extractSkillIds = (config: string): string[] => {
        const matches = config.match(/"id"\s*:\s*"([^"]+)"/g) ?? [];
        return matches.map((m) => m.replace(/"id"\s*:\s*"([^"]+)"/, "$1")).sort();
      };

      // Extract agent names from both configs
      const extractAgentNames = (config: string): string[] => {
        const matches = config.match(/"name"\s*:\s*"([^"]+)"/g) ?? [];
        return matches.map((m) => m.replace(/"name"\s*:\s*"([^"]+)"/, "$1")).sort();
      };

      expect(extractSkillIds(configAfterReinit)).toStrictEqual(
        extractSkillIds(configAfterFirstInit),
      );
      expect(extractAgentNames(configAfterReinit)).toStrictEqual(
        extractAgentNames(configAfterFirstInit),
      );
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

      // Setup: Dual-scope install (global + project) with eject mode
      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Snapshot global state before project uninstall
      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Global config must exist before uninstall").toBe(
        true,
      );
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Phase C: Uninstall from project scope (no --all, just project)
      const uninstall = await runCLI(["uninstall", "--yes"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(uninstall.exitCode, `Project uninstall failed: ${uninstall.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Verify project installation was removed
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

      // Verify global installation is completely preserved
      expect(await fileExists(globalConfigPath), "Global config must still exist").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Global skills must still exist").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Global agents must still exist").toBe(true);

      // Verify global config content is unchanged
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toBe(globalConfigBefore);
    },
  );
});
