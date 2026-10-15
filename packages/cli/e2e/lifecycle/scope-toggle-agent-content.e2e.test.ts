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
  agentsPath,
  cleanupTempDir,
  directoryExists,
  fileExists,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Dual-scope edit lifecycle E2E test -- compiled agent content after a scope change.
 *
 * Key invariants:
 * - When a SKILL's scope changes, only the skill moves — agents stay at their scope.
 * - The global config is PRESERVED via `mergeGlobalConfigs` — it keeps existing
 *   skills even if the new config doesn't include them.
 * - Global skills reach any agent (project or global). Project skills never reach
 *   global agents.
 */

const API_DEV = E2E_AGENT["api-developer"].name;

describe("dual-scope edit lifecycle -- compiled agent content after scope toggle", () => {
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
    "collapsing a persisted dual-scope skill to its global half leaves the project agent carrying it untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // api-framework-hono is a persisted dual-scope [P][G] pair carried by the project
      // api-developer. Naming it at global scope only collapses the pair to its global half.
      // The agent itself must stay put at project scope — only the skill's project override
      // goes away.
      await applyFromSeed(store, "HonoGlobal1", e2eStackPayload({ projectAgents: [API_DEV] }), {
        dir: projectDir,
        home: fakeHome,
      });

      // AFTER assertions — only the skill's project half moved

      // api-developer.md STILL exists at project scope (agent untouched)
      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(
        await fileExists(projectApiDevPath),
        "api-developer.md must still exist at project scope",
      ).toBe(true);
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
      // The agent still references the skill — it is now resolved from the global install.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // The global install survives; the project override is gone.
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (P→G leaves the global install intact)",
      ).toBe(true);

      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the collapse",
      ).toBe(false);
    },
  );

  it(
    "Agent scope change should recompile agent at new scope with correct skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // ACTION: restore api-developer to global scope. It is a persisted dual-scope [P][G]
      // agent, so this collapses [P][G] → [G], the P→G restoration path. The project's
      // Hono stays, assigned to no sub-agent, since a project skill never reaches a global one.
      await applyFromSeed(
        store,
        "ApiDevGlobal1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], unassigned: [E2E_SKILL.hono.id] }),
        { dir: projectDir, home: fakeHome },
      );

      // AFTER assertions

      // api-developer.md at global scope: exists and contains api-developer in content
      await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
        contains: ["api-developer"],
      });

      // api-developer.md at project scope: does NOT exist (P->G is a move for agents)
      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(
        await fileExists(projectApiDevPath),
        "api-developer.md must NOT exist at project scope after the P->G agent move",
      ).toBe(false);

      // Global config has api-developer agent
      await expect({ dir: fakeHome }).toHaveConfig({
        agents: ["api-developer"],
      });
    },
  );
});
