import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { finishWizard } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, ProjectConfig, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Propagation gap: when a global skill is removed via `cc edit` at global scope,
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

const REACT = "web-framework-react";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

// A project-scoped agent whose stack references the GLOBALLY-installed react.
// Legitimate: global skills reach any agent per isScopeCompatible.
const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: REACT, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const reactMetadata = renderMetadataYaml({
  displayName: REACT,
  category: "web-framework",
  slug: "react",
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "b2c3d4e",
});

function buildRegisteredProjectConfig(name: string): ProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
    agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
    selectedAgents: [E2E_AGENT["api-developer"].name],
    stack: projectStack,
  });
}

describe("global-scope skill removal propagates to registered projects", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;

  let projectAConfig: ProjectConfig;
  let projectBConfig: ProjectConfig;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

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
      skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      domains: ["web"],
      selectedAgents: [E2E_AGENT["web-developer"].name],
      stack: globalStack,
      projects: [realpathSync(projectA), realpathSync(projectB)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, REACT, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectA, buildRegisteredProjectConfig("project-a"));
    await writeProjectConfig(projectB, buildRegisteredProjectConfig("project-b"));

    // Edit at global scope and remove react entirely. This triggers
    // propagateGlobalChangesToProjects for the two registered projects.
    const wizard = await EditWizard.launch({
      projectDir: globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: globalHome },
      ...TERMINAL_SIZE.TALL,
    });
    await wizard.build.selectSkill(REACT);
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    const { exitCode, output } = await finishWizard(result);
    expect(exitCode, `global edit must succeed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    projectAConfig = await loadConfigOrFail(projectA);
    projectBConfig = await loadConfigOrFail(projectB);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
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
