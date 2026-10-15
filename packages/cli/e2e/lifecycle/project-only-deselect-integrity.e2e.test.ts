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

/**
 * Project-only deselection integrity (config-merger AuthoritativeScope "owned").
 *
 * Deselecting a PROJECT-ONLY agent/skill (never dual-scope — no global install
 * underneath it and no global tombstone) via `edit --from` run from within a project
 * must genuinely remove it from config.ts, the generated config-types.ts union,
 * and — for agents — the compiled `.md` on disk. An INHERITED global-active entry
 * (globally installed, untouched at project scope, no tombstone) must never be
 * affected by a project-scope edit — it is read-only from the project's view.
 */

const API_DEV = E2E_AGENT["api-developer"].name;

/**
 * A fresh project install, nothing global first: web-testing-vitest (a dynamic skill, so it can
 * be dropped on its own) and api-developer are PROJECT-only entries, while web-framework-react
 * and web-developer land in the freshly created global config as inherited global-active
 * entries. A project skill never reaches the global web-developer, so vitest is assigned to no
 * sub-agent.
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

      // Setup proof: the project-only agent is genuinely present before the edit.
      expect(
        await fileExists(projectAgentMd),
        "compiled project api-developer.md must exist after init",
      ).toBe(true);
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_AGENT["api-developer"].name);
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain(E2E_AGENT["api-developer"].name);

      // Snapshot the inherited global config before the project-scope edit.
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: leave out ONLY the project-only agent.
      await applyFromSeed(
        store,
        "WithoutApiDev1",
        e2eStackPayload({ ...MIXED_SCOPE, withoutAgents: [API_DEV] }),
        project,
      );

      // The project-only agent is removed everywhere.
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

      // The OTHER project-only entry (the vitest skill) is untouched — removal is surgical.
      expect(projectConfigAfter, "untouched project-only skill must be preserved").toContain(
        E2E_SKILL.vitest.id,
      );

      // Boundary: the inherited global-active agent survives the project edit.
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

      // Setup proof: the project-only skill is genuinely present before the edit.
      const projectConfigBefore = await readTestFile(projectConfigPath);
      expect(projectConfigBefore).toContain(E2E_SKILL.vitest.id);
      const projectTypesBefore = await readTestFile(projectTypesPath);
      expect(projectTypesBefore).toContain(E2E_SKILL.vitest.id);

      // Snapshot the inherited global config before the project-scope edit.
      const globalConfigBefore = await readTestFile(globalConfigPath);

      // Edit from within the project: leave out ONLY the project-only skill.
      await applyFromSeed(
        store,
        "WithoutVitest1",
        e2eStackPayload({ projectAgents: [API_DEV], without: [E2E_SKILL.vitest.id] }),
        project,
      );

      // The project-only skill is removed from the config's skills array.
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

      // The OTHER project-only entry (the api-developer agent) is untouched — surgical.
      expect(projectConfigAfter, "untouched project-only agent must be preserved").toContain(
        "api-developer",
      );

      // Boundary: the inherited global-active skill survives the project edit.
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
