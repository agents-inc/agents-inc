import { realpathSync } from "fs";
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
  renderMetadataYaml,
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
 * Removing a skill's GLOBAL copy via `edit --from` strips it from the global config while the
 * registered project's own project-scope copy (skills[], stack and directory) is untouched.
 */

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const vitestMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.vitest.display,
  category: "web-testing",
  slug: E2E_SKILL.vitest.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "c3d4e5f",
});

/** Its sub-agent stays on, holding nothing. */
const WITHOUT_VITEST_ID = "NoVitst3";

describe("edit at global scope removes only the global copy of a dual-scope skill", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_VITEST_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "strips the global copy and leaves the project-scope copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(globalHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(globalHome);
      await createPermissionsFile(projectDir);

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Global vitest copy",
        metadata: FORKED_FROM_METADATA,
      });

      const projectConfig = buildProjectConfig({
        name: "dual-scope-project",
        skills: [
          ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
          ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
        ],
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      const result = await applyEditFrom(store, WITHOUT_VITEST_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      const g = await loadConfigOrFail(globalHome);
      expect(g.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);
      expect(g.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"]).toBeUndefined();

      const p = await loadConfigOrFail(projectDir);

      // Proof propagation ran, or the assertions below could pass on an untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited global vitest from the project",
      ).toBe(0);

      const projectVitest = p.skills.find(
        (s) => s.id === E2E_SKILL.vitest.id && s.scope === "project",
      );
      expect(
        projectVitest,
        "project's own project-scope vitest must survive the global removal",
      ).toStrictEqual({ id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" });

      expect(
        p.stack?.[E2E_AGENT["api-developer"].name]?.["web-testing"],
        "project agent stack must still reference the project-scope vitest",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, preloaded: false }]);

      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.vitest.id)),
        "project's own vitest skill dir must remain",
      ).toBe(true);
    },
  );
});
