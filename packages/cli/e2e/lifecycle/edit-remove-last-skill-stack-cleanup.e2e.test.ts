import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
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
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Removing the only skill an agent's stack references must not leave it in `stack`: the rebuilt
 * config omits `stack`, and the merge must not resurrect the old one.
 */

const singleSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** Its sub-agent stays on, holding nothing. */
const WITHOUT_REACT_ID = "NoReact2";

describe("edit removes the only skill an agent references", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_REACT_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });
  let globalHome: string | undefined;

  afterEach(async () => {
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "does not leave the removed skill behind in the stack property",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "global-edit-test",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: singleSkillStack,
      });
      await writeProjectConfig(globalHome, config);

      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework for global-scope edit testing",
        metadata: FORKED_FROM_METADATA,
      });

      await createPermissionsFile(globalHome);

      const result = await applyEditFrom(store, WITHOUT_REACT_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      const finalConfig = await loadConfigOrFail(globalHome);

      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.react.id);

      const removedSkillDir = path.join(skillsPath(globalHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the global home",
      ).toBe(false);

      const webFrameworkAssignments =
        finalConfig.stack?.[E2E_AGENT["web-developer"].name]?.["web-framework"];
      expect(
        webFrameworkAssignments,
        "web-developer stack must not retain the removed web-framework-react",
      ).toBeUndefined();
    },
  );
});
