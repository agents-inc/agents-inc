import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  FORKED_FROM_METADATA,
  loadConfigOrFail,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

const REACT = E2E_SKILL.react.id;

/** Its sub-agent stays on, holding nothing. */
const WITHOUT_REACT_ID = "NoReact1";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// Legitimate: global skills reach any agent.
const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: REACT, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

function buildRegisteredProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([REACT], { scope: "global", origin: "eject" }),
    agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
    stack: projectStack,
  });
}

describe("global-scope skill removal propagates to registered projects", () => {
  let store: SeedConfigStore;
  let tempDir: string;

  let projectAConfig: FixtureProjectConfig;
  let projectBConfig: FixtureProjectConfig;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_REACT_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "home");
    const projectA = path.join(tempDir, "project-a");
    const projectB = path.join(tempDir, "project-b");
    for (const dir of [globalHome, projectA, projectB]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    const globalConfig = buildProjectConfig({
      name: "propagation-global",
      marketplace: E2E_SOURCE.sourceDir,
      skills: buildSkillConfigs([REACT], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      projects: [realpathSync(projectA), realpathSync(projectB)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    // Fork provenance, so the round trip owns the copy and the apply may remove it.
    await createLocalSkill(globalHome, REACT, {
      description: "Global react copy",
      metadata: FORKED_FROM_METADATA,
    });

    await writeProjectConfig(projectA, buildRegisteredProjectConfig("project-a"));
    await writeProjectConfig(projectB, buildRegisteredProjectConfig("project-b"));

    const { exitCode, output } = await applyEditFrom(store, WITHOUT_REACT_ID, { dir: globalHome });
    expect(exitCode, `global edit must succeed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    projectAConfig = await loadConfigOrFail(projectA);
    projectBConfig = await loadConfigOrFail(projectB);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // Proof propagation rewrote each project, or the stack assertion below would pass vacuously.
  it("drops the removed global skill from each registered project's inlined skills", () => {
    expect(
      projectAConfig.skills.map((s) => s.id),
      "project-a inlined skills must no longer contain the removed global react",
    ).not.toContain(REACT);
    expect(
      projectBConfig.skills.map((s) => s.id),
      "project-b inlined skills must no longer contain the removed global react",
    ).not.toContain(REACT);
  });

  it("does not leave a stale global-skill reference in a project-scoped agent's stack", () => {
    expect(
      projectAConfig.stack?.[E2E_AGENT["api-developer"].name]?.["web-framework"],
      "project-a api-developer stack must not reference the removed react",
    ).toBeUndefined();
    expect(
      projectBConfig.stack?.[E2E_AGENT["api-developer"].name]?.["web-framework"],
      "project-b api-developer stack must not reference the removed react",
    ).toBeUndefined();
  });
});
