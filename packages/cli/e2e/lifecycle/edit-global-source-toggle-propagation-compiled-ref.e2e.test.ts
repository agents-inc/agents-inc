import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
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
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * The stale agent is a real `compile`'s output. No Claude CLI needed: the plugin uninstall is
 * best-effort.
 */

const REACT_PLUGIN_REF = `${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`;

const MARKET = "test-marketplace";

// Tracks react's source, proving the current context was recompiled.
const globalStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// Preloads the same global react, so its frontmatter carries whichever form the source dictates.
const projectStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const reactMetadata = renderMetadataYaml({
  domain: "web",
  author: "@agents-inc",
  displayName: E2E_SKILL.react.display,
  category: "web-framework",
  slug: E2E_SKILL.react.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "b2c3d4e",
});

const REACT_EJECTED_ID = "ReactEj1";

function buildRegisteredProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
    agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    stack: projectStack,
  });
}

describe("global-scope source change propagates to registered projects", () => {
  let store: SeedConfigStore;
  let tempDir: string;

  let fakeHome: string;
  let projectDir: string;

  let compileExitCode: number;
  let compileOutput: string;
  let preEditProjectAgent: string;
  let editExitCode: number;
  let editOutput: string;
  let projectConfig: FixtureProjectConfig;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      REACT_EJECTED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [E2E_AGENT["api-developer"].name]: "preloaded" },
          }),
        },
        agents: { [E2E_AGENT["api-developer"].name]: { scope: "global" } },
      }),
    );
    tempDir = await createTempDir();
    fakeHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project-a");
    for (const dir of [fakeHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    await writeProjectConfig(
      fakeHome,
      buildProjectConfig({
        name: "propagation-source-toggle-global",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      }),
    );
    // The ref format follows the config `source` string, not where the content lives.
    await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectDir, buildRegisteredProjectConfig("project-a"));

    const compiled = await runCLI(["compile"], projectDir, {
      env: { HOME: fakeHome },
    });
    compileExitCode = compiled.exitCode;
    compileOutput = compiled.combined;
    preEditProjectAgent = await readTestFile(
      path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`),
    );

    // HOME and cwd both the fake home, or this becomes a project edit.
    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(store, REACT_EJECTED_ID, {
      dir: fakeHome,
    }));

    projectConfig = await loadConfigOrFail(projectDir);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("compiles the registered project's agent in plugin-ref form while react is marketplace-sourced", () => {
    expect(compileExitCode, `project compile must succeed: ${compileOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      preEditProjectAgent,
      "a marketplace-sourced skill must compile to the plugin ref form",
    ).toContain(REACT_PLUGIN_REF);
  });

  it("completes the global-scope source change successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // A switch keeps the skill installed, so one `~` line; a `-`/`+` pair would read as two changes.
  it("reports the install-mode switch as one ~ line in the change summary", () => {
    expect(
      editOutput,
      "a plugin -> eject switch is a modification, not a removal and an addition",
    ).toContain(`~ ${E2E_SKILL.react.display}`);
    expect(editOutput, "the summary must not double the switch as a removal").not.toContain(
      `- ${E2E_SKILL.react.display}`,
    );
    expect(editOutput, "the summary must not double the switch as an addition").not.toContain(
      `+ ${E2E_SKILL.react.display}`,
    );
  });

  // Proof propagation rewrote the project, so the compiled-agent assertions test the recompile.
  it("records the new eject source in the registered project's inlined skills", () => {
    expect(
      projectConfig.skills.filter((s) => s.id === E2E_SKILL.react.id),
      "the registered project's inlined react entry must record the eject source",
    ).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], {
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.react.display,
      }),
    );
  });

  it("recompiles the current context's global agent to the bare skill reference", async () => {
    await expect({ dir: fakeHome }).toHaveAgentFrontmatter(E2E_AGENT["api-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
    await expect({ dir: fakeHome }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  it("drops the plugin-form skill reference from the registered project's compiled agent", async () => {
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  it("emits the bare skill id in the registered project's compiled agent frontmatter", async () => {
    await expect({ dir: projectDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
  });
});
