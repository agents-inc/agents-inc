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
  configTypesTsPath,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  fileExists,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  writeAgentFile,
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
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// References the same global react the removed agent does; removing the agent must leave it.
const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const reactMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.react.display,
  category: "web-framework",
  slug: E2E_SKILL.react.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "b2c3d4e",
});

const WITHOUT_WEB_DEV_ID = "NoWebDv1";

function buildRegisteredProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
    agents: [
      ...buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      ...buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
    ],
    stack: projectStack,
  });
}

describe("global-scope agent removal propagates to registered projects", () => {
  let store: SeedConfigStore;
  let tempDir: string;

  let projectDir: string;
  let projectConfig: FixtureProjectConfig;
  let compiledAgentMdExists: boolean;
  let projectAgentMdExists: boolean;
  let editExitCode: number;
  let editRawOutput: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_WEB_DEV_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: {},
          }),
        },
      }),
    );
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project-a");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    const globalConfig = buildProjectConfig({
      name: "propagation-agent-removal-global",
      marketplace: E2E_SOURCE.sourceDir,
      skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectDir, buildRegisteredProjectConfig("project-a"));

    // The only agent file before the edit, so api-developer.md afterwards proves the recompile.
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, {
      frontmatter: true,
      body: "Stale compiled agent body\n",
    });

    ({ exitCode: editExitCode, output: editRawOutput } = await applyEditFrom(
      store,
      WITHOUT_WEB_DEV_ID,
      { dir: globalHome },
    ));

    projectConfig = await loadConfigOrFail(projectDir);

    compiledAgentMdExists = await fileExists(
      path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`),
    );
    projectAgentMdExists = await fileExists(
      path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`),
    );
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("completes the global-scope edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  it("drops the removed global agent from the project's inlined agents[]", () => {
    expect(
      projectConfig.agents.filter((a) => !a.excluded).map((a) => a.name),
      "project agents[] must no longer contain the removed global web-developer",
    ).not.toContain(E2E_AGENT["web-developer"].name);
  });

  // Read off the emitted union: the name also appears in AgentName, so a whole-file negative could
  // not fail. The positive assertion keeps the union non-empty.
  it("drops the removed global agent from the generated SelectedAgentName union", async () => {
    const configTypes = await readTestFile(configTypesTsPath(projectDir));
    const selectedAgentName = readGeneratedUnion(configTypes, "SelectedAgentName");

    expect(
      selectedAgentName,
      "config-types.ts must declare a SelectedAgentName alias",
    ).toBeDefined();
    expect(
      selectedAgentName,
      "SelectedAgentName must still name the project's own api-developer",
    ).toContain(E2E_AGENT["api-developer"].name);
    expect(
      selectedAgentName,
      "SelectedAgentName must not name the removed global web-developer",
    ).not.toContain(E2E_AGENT["web-developer"].name);
  });

  it("leaves the project-scoped agent's own stack entries untouched", () => {
    expect(
      projectConfig.stack?.[E2E_AGENT["api-developer"].name]?.["web-framework"],
      "project-scoped api-developer stack must still reference react unchanged",
    ).toStrictEqual([{ id: E2E_SKILL.react.id, preloaded: false }]);
  });

  it("keeps the project-scoped api-developer active in agents[]", () => {
    expect(
      projectConfig.agents.filter((a) => !a.excluded).map((a) => a.name),
      "project-scoped api-developer must survive propagation",
    ).toContain(E2E_AGENT["api-developer"].name);
  });

  // Without the recompile, the stale-file half would hold vacuously.
  it("recompiles the project's own agent and leaves the removed global agent's .md in place", () => {
    expect(
      projectAgentMdExists,
      "project .claude/agents/api-developer.md must be written by the project's recompile",
    ).toBe(true);
    expect(
      compiledAgentMdExists,
      "project .claude/agents/web-developer.md survives — a compile pass writes surviving agents and never prunes",
    ).toBe(true);
  });
});
