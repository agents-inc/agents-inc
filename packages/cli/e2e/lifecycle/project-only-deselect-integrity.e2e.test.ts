import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  fileExists,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installFromSeed,
  type E2EStackOptions,
} from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";

const API_DEV = E2E_AGENT["api-developer"].name;

/**
 * A fresh project install: vitest (dynamic, so droppable alone) and api-developer project-only;
 * react and web-developer inherited globals. vitest is assigned to no sub-agent.
 */
const MIXED_SCOPE = {
  projectSkills: [E2E_SKILL.vitest.id],
  unassigned: [E2E_SKILL.vitest.id],
  projectAgents: [API_DEV],
} as const satisfies E2EStackOptions;

describe("project-only deselection integrity", () => {
  let store: SeedConfigStore;
  let testTempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "deselecting a project-only agent removes it from config, the generated union, and disk while the inherited global agent is untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      const project = { dir: projectDir, home: fakeHome };
      await installFromSeed(store, "MixedScope1", e2eStackPayload(MIXED_SCOPE), project);

      const projectConfigPath = configTsPath(projectDir);
      const projectTypesPath = configTypesTsPath(projectDir);
      const projectAgentMd = path.join(agentsPath(projectDir), "api-developer.md");
      const globalConfigPath = configTsPath(fakeHome);
      const globalTypesPath = configTypesTsPath(fakeHome);

      expect(
        await fileExists(projectAgentMd),
        "compiled project api-developer.md must exist after init",
      ).toBe(true);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_AGENT["api-developer"].name);
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain(E2E_AGENT["api-developer"].name);

      const globalConfigBefore = await readTestFile(globalConfigPath);

      await applyFromSeed(
        store,
        "WithoutApiDev1",
        e2eStackPayload({ ...MIXED_SCOPE, withoutAgents: [API_DEV] }),
        project,
      );

      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(
        projectConfigAfter,
        "config.ts must not retain the deselected project-only agent",
      ).not.toContain(E2E_AGENT["api-developer"].name);
      const projectTypesAfter = await readTestFile(projectTypesPath);
      expect(
        projectTypesAfter,
        "config-types.ts AgentName/SelectedAgentName union must drop the deselected agent",
      ).not.toContain(E2E_AGENT["api-developer"].name);
      expect(
        await fileExists(projectAgentMd),
        "compiled api-developer.md must be deleted after full removal",
      ).toBe(false);

      expect(projectConfigAfter, "untouched project-only skill must be preserved").toContain(
        E2E_SKILL.vitest.id,
      );

      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      expect(await readTestFile(globalTypesPath)).toContain(E2E_AGENT["web-developer"].name);
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toContain(E2E_AGENT["web-developer"].name);
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope agent deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );

  it(
    "deselecting a project-only skill removes it from the config skills array and the generated union while the inherited global skill is untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;
      const project = { dir: projectDir, home: fakeHome };
      await installFromSeed(store, "MixedScope1", e2eStackPayload(MIXED_SCOPE), project);

      const projectConfigPath = configTsPath(projectDir);
      const projectTypesPath = configTypesTsPath(projectDir);
      const globalConfigPath = configTsPath(fakeHome);

      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_SKILL.vitest.id);
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain(E2E_SKILL.vitest.id);

      const globalConfigBefore = await readTestFile(globalConfigPath);

      await applyFromSeed(
        store,
        "WithoutVitest1",
        e2eStackPayload({ projectAgents: [API_DEV], without: [E2E_SKILL.vitest.id] }),
        project,
      );

      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(
        await readConfigSkillIds(projectDir),
        "skills array must not retain the deselected project-only skill",
      ).not.toContain(E2E_SKILL.vitest.id);
      const projectTypesAfter = await readTestFile(projectTypesPath);
      expect(
        projectTypesAfter,
        "config-types.ts SkillId union must drop the deselected skill",
      ).not.toContain(E2E_SKILL.vitest.id);

      expect(projectConfigAfter, "untouched project-only agent must be preserved").toContain(
        "api-developer",
      );

      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      const globalConfigAfter = await readTestFile(globalConfigPath);
      expect(globalConfigAfter).toContain(E2E_SKILL.react.id);
      expect(
        normalizeGlobalConfig(globalConfigAfter),
        "global config must be unchanged by a project-scope skill deselect",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
    },
  );
});
