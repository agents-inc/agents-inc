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

/**
 * Propagation gap: when a global skill is removed via `cc edit --from` at global scope,
 * `propagateGlobalChangesToProjects` rewrites each registered project's config.ts
 * via `retainReconciledSkills`/`retainReconciledAgents` (which filter skills[] and
 * agents[]) but never touches `.stack`. The inlined writer only filters the stack
 * down to project-scoped agent names — it does not drop references to skill ids
 * that no longer exist anywhere. A project-scoped agent whose stack referenced the
 * removed global skill is left with a dangling reference.
 *
 * The buildStackForSelection fix cleans the GLOBAL config's own stack, but the
 * propagation write path to registered projects is a separate code path that the
 * fix does not reach.
 */

const REACT = E2E_SKILL.react.id;

/** The global configuration with react left out: its sub-agent on, holding nothing. */
const WITHOUT_REACT_ID = "NoReact1";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// A project-scoped agent whose stack references the GLOBALLY-installed react.
// Legitimate: global skills reach any agent per isScopeCompatible.
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

    // Global install: react is web-developer's only skill / only stack entry.
    // Two registered projects each own a project-scoped api-developer whose
    // stack references the global react.
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

    // Edit at global scope and remove react entirely. This triggers
    // propagateGlobalChangesToProjects for the two registered projects.
    const { exitCode, output } = await applyEditFrom(store, WITHOUT_REACT_ID, { dir: globalHome });
    expect(exitCode, `global edit must succeed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    projectAConfig = await loadConfigOrFail(projectA);
    projectBConfig = await loadConfigOrFail(projectB);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // Proof-of-execution: propagation actually rewrote each project (the removed
  // global react is dropped from the inlined skills[]). If this regresses, the
  // stack assertion below would be a vacuous pass on an untouched file.
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

  // A project-scoped agent's stack must not keep referencing a skill that no longer
  // exists at any scope. propagateGlobalChangesToProjects reconciles .stack against
  // the now-current global data, dropping the dangling reference.
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
