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

/** Project-scope twin of edit-remove-last-skill-stack-cleanup. */

const singleSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** Its sub-agent stays on, holding nothing. */
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

      // HOME differs from projectDir, so the apply writes with authoritativeScope "owned".

      const result = await applyEditFrom(store, WITHOUT_VITEST_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      const finalConfig = await loadConfigOrFail(projectDir);

      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);

      const removedSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.vitest.id);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the project",
      ).toBe(false);

      const webTestingAssignments =
        finalConfig.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"];
      expect(
        webTestingAssignments,
        "web-developer stack must not retain the removed web-testing-vitest",
      ).toBeUndefined();
    },
  );
});
