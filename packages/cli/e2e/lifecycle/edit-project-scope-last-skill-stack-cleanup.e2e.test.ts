import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  FORKED_FROM_METADATA,
  loadConfigOrFail,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Project-scope twin of edit-remove-last-skill-stack-cleanup.e2e.test.ts (which
 * exercises the same removal at GLOBAL scope). Verifies the buildStackForSelection
 * `{}`-not-`undefined` fix holds when the edit runs at PROJECT scope
 * (authoritativeScope "owned", HOME distinct from the project dir) rather than at
 * global scope. A non-preloaded project-scoped skill is the only entry in an
 * agent's stack category; removing it must leave no stale reference in `stack`.
 */

const singleSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The project's configuration with vitest left out: its sub-agent on, holding nothing. */
const WITHOUT_VITEST_ID = "NoVitst4";

describe("edit removes the only project-scoped skill an agent references", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_VITEST_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "does not leave the removed skill behind in the project stack property",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a PROJECT installation (HOME distinct from the project
      // dir) where web-testing-vitest is the ONLY skill and the ONLY entry in
      // web-developer's stack. Removing it collapses the whole selection to
      // empty, the trigger condition for the merge-fallback bug.
      // ================================================================

      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(fakeHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(fakeHome);
      await createPermissionsFile(projectDir);

      const config = buildProjectConfig({
        name: "project-scope-edit-test",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
        stack: singleSkillStack,
      });
      await writeProjectConfig(projectDir, config);

      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing framework for project-scope edit testing",
        metadata: FORKED_FROM_METADATA,
      });

      // ================================================================
      // Phase 2: Run `cc edit --from` at PROJECT scope with vitest left out.
      // projectDir differs from HOME, so cwd is not the global install root and the
      // apply writes with authoritativeScope "owned".
      // ================================================================

      const result = await applyEditFrom(store, WITHOUT_VITEST_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // ================================================================
      // Phase 3: Assert on the post-edit project config (structural load) AND
      // the filesystem.
      // ================================================================

      const finalConfig = await loadConfigOrFail(projectDir);

      // Sanity: vitest is gone from the top-level skills roster.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);

      // Filesystem side: the removed eject skill's directory is deleted.
      const removedSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.vitest.id);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the project",
      ).toBe(false);

      // The stack must not retain a reference to the removed skill. web-testing
      // was vitest's only category and vitest was web-developer's only stack
      // entry, so the whole web-developer stack should be gone.
      const webTestingAssignments =
        finalConfig.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"];
      expect(
        webTestingAssignments,
        "web-developer stack must not retain the removed web-testing-vitest",
      ).toBeUndefined();
    },
  );
});
