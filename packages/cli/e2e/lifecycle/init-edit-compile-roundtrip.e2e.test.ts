import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  directoryExists,
  fileExists,
  readTestFile,
  runCLI,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackGlobally,
  installFromSeed,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/** init (global + project), then edit, then compile, verified at each stage. */

const API_DEV = E2E_AGENT["api-developer"].name;

describe("init-edit-compile roundtrip lifecycle", () => {
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

  afterEach(async () => {
    if (testTempDir) await cleanupTempDir(testTempDir);
  });

  it(
    "full lifecycle: init with eject, edit to change scope, compile to verify",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      testTempDir = env.tempDir;
      fakeHome = env.fakeHome;
      projectDir = env.projectDir;

      await installE2EStackGlobally(store, fakeHome);

      const globalConfigPath = configTsPath(fakeHome);
      expect(await fileExists(globalConfigPath), "Global config must exist after init").toBe(true);

      const globalConfigAfterInit = await readTestFile(globalConfigPath);
      expect(globalConfigAfterInit, "version field is not emitted on global init").not.toContain(
        "version:",
      );

      const globalSkillsDir = skillsPath(fakeHome);
      expect(await directoryExists(globalSkillsDir), "Global skills dir must exist").toBe(true);

      const globalAgentsDir = agentsPath(fakeHome);
      expect(await directoryExists(globalAgentsDir), "Global agents dir must exist").toBe(true);

      await installFromSeed(
        store,
        "PhaseB1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], projectAgents: [API_DEV] }),
        { dir: projectDir, home: fakeHome },
      );

      const projectConfigPath = configTsPath(projectDir);
      expect(await fileExists(projectConfigPath), "Project config must exist after init").toBe(
        true,
      );

      const projectConfigAfterInit = await readTestFile(projectConfigPath);
      expect(projectConfigAfterInit, "version field is not emitted on project init").not.toContain(
        "version:",
      );

      const projectHonoSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      expect(
        await directoryExists(projectHonoSkillDir),
        "Project must have api-framework-hono skill",
      ).toBe(true);

      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      const projectConfigTypesPath = configTypesTsPath(projectDir);
      expect(
        await fileExists(projectConfigTypesPath),
        "config-types.ts must exist after project init",
      ).toBe(true);

      // A project skill never reaches the global web-developer, so the project's React is assigned
      // to no sub-agent.
      await applyFromSeed(
        store,
        "PhaseC1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          projectAgents: [API_DEV],
          unassigned: [E2E_SKILL.react.id],
        }),
        { dir: projectDir, home: fakeHome },
      );

      const projectConfigAfterEdit = await readTestFile(projectConfigPath);
      expect(projectConfigAfterEdit).toContain(E2E_SKILL.react.id);
      expect(projectConfigAfterEdit).toMatch(/web-framework-react[^}]*scope:\s*'project'/);
      expect(projectConfigAfterEdit, "version field is not emitted on edit").not.toContain(
        "version:",
      );

      const projectReactSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectReactSkillDir),
        "Project must have web-framework-react skill after scope toggle",
      ).toBe(true);

      expect(
        await fileExists(projectConfigTypesPath),
        "config-types.ts must exist after scope change",
      ).toBe(true);

      const compileResult = await runCLI(["compile", "--verbose"], projectDir, {
        env: { HOME: fakeHome },
      });

      expect(compileResult.exitCode, `Compile failed: ${compileResult.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(compileResult.combined).toContain(STEP_TEXT.COMPILE_SUCCESS);

      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        skills: [E2E_SKILL.hono.id],
      });

      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: [E2E_SKILL.react.id],
      });
    },
  );
});
