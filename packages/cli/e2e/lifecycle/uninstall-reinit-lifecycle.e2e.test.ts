import path from "path";
import { realpathSync } from "fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
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
  loadConfigOrFail,
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

beforeAll(async () => {
  await ensureBinaryExists();
}, TIMEOUTS.SETUP_DUAL);

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
      const phaseA = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Verify Phase A installation exists
      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Config must exist after init").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Skills dir must exist after init").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Agents dir must exist after init").toBe(true);

      // Snapshot Phase A config for later comparison, loaded structurally: the
      // claim is about the entries a re-init produces, not about how the writer
      // broke them across lines.
      const configAfterFirstInit = await loadConfigOrFail(fakeHome);

      // Phase B: Uninstall (the config manifest is removed by default)
      const uninstall = await runCLI(["uninstall", "--yes"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(uninstall.exitCode, `Uninstall failed: ${uninstall.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Verify uninstall cleaned everything
      expect(
        await directoryExists(path.join(fakeHome, DIRS.CLAUDE_SRC)),
        "Config dir must be removed after uninstall",
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
      const phaseC = await initGlobalWithEject(E2E_SOURCE, fakeHome);
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

      // Setup: Dual-scope install (global + project) with eject mode
      await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);

      // Snapshot global state before project uninstall
      const globalConfigPath = configTsPath(fakeHome);
      const globalSkillsDir = skillsPath(fakeHome);
      const globalAgentsDir = agentsPath(fakeHome);

      expect(await fileExists(globalConfigPath), "Global config must exist before uninstall").toBe(
        true,
      );
      const globalConfigBefore = await readTestFile(globalConfigPath);
      // The exact global sets, captured before the uninstall. The assertions at the
      // end of this phase used `globalAfter.skills.length > 0`, which a run that
      // deleted every global skill but one satisfies exactly as a run that touched
      // none does.
      const globalBefore = await loadConfigOrFail(fakeHome);

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

      // Verify global installation is preserved
      expect(await fileExists(globalConfigPath), "Global config must still exist").toBe(true);
      expect(await directoryExists(globalSkillsDir), "Global skills must still exist").toBe(true);
      expect(await directoryExists(globalAgentsDir), "Global agents must still exist").toBe(true);

      // The only global-config change from a project uninstall is deregistering
      // this project from the tracked `projects` list.
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
      // Global skills/agents are otherwise untouched — every entry, unchanged.
      expect(globalAfter.skills, "global skills must be preserved").toStrictEqual(
        globalBefore.skills,
      );
      expect(globalAfter.agents, "global agents must be preserved").toStrictEqual(
        globalBefore.agents,
      );
    },
  );
});
