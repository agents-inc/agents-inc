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
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Removing one skill from one of an agent's several stack categories deletes only that entry;
 * every other (agent, category, skill) triple, preloaded flag included, is unchanged.
 */

const multiCategoryStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
    "web-client-state": [{ id: E2E_SKILL.zustand.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const WITHOUT_ZUSTAND_ID = "NoZstnd1";

describe("edit removes exactly one skill from a multi-category agent stack", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_ZUSTAND_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [E2E_AGENT["web-developer"].name]: "preloaded" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
          }),
        },
        agents: { [E2E_AGENT["web-developer"].name]: { scope: "global" } },
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
    "leaves every other stack triple byte-identical after removing one skill",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "surgical-edit-test",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id], {
          scope: "global",
          origin: "eject",
        }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: multiCategoryStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "a1b2c3d",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Vitest testing framework",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "a1b2c3d",
        }),
      });
      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.zustand.id, {
        description: "Zustand state management",
        metadata: FORKED_FROM_METADATA,
      });

      await createPermissionsFile(globalHome);

      const result = await applyEditFrom(store, WITHOUT_ZUSTAND_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      const finalConfig = await loadConfigOrFail(globalHome);

      const finalSkillIds = finalConfig.skills.map((s) => s.id);
      expect(finalSkillIds).not.toContain(E2E_SKILL.zustand.id);
      expect(finalSkillIds).toContain(E2E_SKILL.react.id);
      expect(finalSkillIds).toContain(E2E_SKILL.vitest.id);

      // Loader-normalized: every assignment is { id, preloaded }.
      const expectedWebDeveloperStack: FixtureStackAgentConfig = {
        "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
      };
      expect(
        finalConfig.stack?.[E2E_AGENT["web-developer"].name],
        "web-developer stack must equal the prior stack minus only the removed category",
      ).toStrictEqual(expectedWebDeveloperStack);

      const zustandDir = path.join(skillsPath(globalHome), E2E_SKILL.zustand.id);
      const reactDir = path.join(skillsPath(globalHome), E2E_SKILL.react.id);
      const vitestDir = path.join(skillsPath(globalHome), E2E_SKILL.vitest.id);
      expect(await directoryExists(zustandDir), "removed zustand dir must be deleted").toBe(false);
      expect(await directoryExists(reactDir), "react dir must be retained").toBe(true);
      expect(await directoryExists(vitestDir), "vitest dir must be retained").toBe(true);
    },
  );
});
