import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  readAgentEntriesFor,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { AgentScopeConfig, AgentName, SkillConfig } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
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

const WEB_DEV = E2E_AGENT["web-developer"].name;

const GLOBAL_WITH_VITEST = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      scope: "global",
      assignments: { [WEB_DEV]: "preloaded" },
    }),
    [E2E_SKILL.vitest.id]: buildSeedSkill({ scope: "global", assignments: { [WEB_DEV]: "lazy" } }),
  },
  agents: { [WEB_DEV]: { scope: "global" } },
});

describe("global-scope install tombstones project-owned skills and agents", () => {
  let store: SeedConfigStore;
  let tempDir: string;
  let globalHome: string;
  let projectDir: string;

  let editExitCode: number;
  let editRawOutput: string;
  let globalVitestInstalled: boolean;

  let globalVitest: SkillConfig[];
  let globalWebDeveloper: AgentScopeConfig[];
  let projectVitest: SkillConfig[];
  let projectReact: SkillConfig[];
  let projectWebDeveloper: AgentScopeConfig[];

  beforeAll(async () => {
    store = await startSeedConfigStore();
    tempDir = await createTempDir();
    globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "registered-project");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // vitest is absent so the edit adds it globally: a real project-then-global transition.
    const globalConfig: FixtureProjectConfig = buildProjectConfig({
      name: "tombstone-project-owned-global",
      skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      marketplace: E2E_SOURCE.sourceDir,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    const projectConfig: FixtureProjectConfig = buildProjectConfig({
      name: "tombstone-project-owned",
      skills: [
        ...buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
      ],
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    });
    await writeProjectConfig(projectDir, projectConfig);

    ({ exitCode: editExitCode, output: editRawOutput } = await applyFromSeed(
      store,
      "AddVitest1",
      GLOBAL_WITH_VITEST,
      { dir: globalHome, home: globalHome },
    ));

    globalVitestInstalled = await directoryExists(
      path.join(skillsPath(globalHome), E2E_SKILL.vitest.id),
    );
    globalVitest = await readSkillEntries(globalHome, E2E_SKILL.vitest.id);
    globalWebDeveloper = await readAgentEntriesFor(globalHome, E2E_AGENT["web-developer"].name);
    projectVitest = await readSkillEntries(projectDir, E2E_SKILL.vitest.id);
    projectReact = await readSkillEntries(projectDir, E2E_SKILL.react.id);
    projectWebDeveloper = await readAgentEntriesFor(projectDir, E2E_AGENT["web-developer"].name);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("completes the global-scope skill addition edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  it("adds the selected skill at global scope in the global config", () => {
    expect(globalVitest).toStrictEqual([
      {
        id: E2E_SKILL.vitest.id,
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.vitest.display,
      },
    ]);
  });

  it("physically installs the newly-added skill at the global scope path", () => {
    expect(globalVitestInstalled).toBe(true);
  });

  it("keeps the project-owned agent active at global scope in the global config", () => {
    expect(globalWebDeveloper).toStrictEqual([
      { name: E2E_AGENT["web-developer"].name, scope: "global" },
    ]);
  });

  // Proves propagation fired, not the tombstone shape.
  it("re-inlines both scopes of the project-owned skill into the registered project", () => {
    expect(projectVitest.map((entry) => entry.scope).sort()).toStrictEqual(["global", "project"]);
  });

  it("re-inlines both scopes of the project-owned agent into the registered project", () => {
    expect(projectWebDeveloper.map((entry) => entry.scope).sort()).toStrictEqual([
      "global",
      "project",
    ]);
  });

  it("leaves a purely-inherited global skill as a single active global entry", () => {
    expect(projectReact).toStrictEqual([
      {
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.react.display,
      },
    ]);
  });

  it("writes a global tombstone for the project-owned skill, not a second active install", () => {
    expect(projectVitest).toStrictEqual([
      {
        id: E2E_SKILL.vitest.id,
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.vitest.display,
        excluded: true,
      },
      { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
    ]);
  });

  it("writes a global tombstone for the project-owned agent, not a second active install", () => {
    expect(projectWebDeveloper).toStrictEqual([
      { name: E2E_AGENT["web-developer"].name, scope: "global", excluded: true },
      { name: E2E_AGENT["web-developer"].name, scope: "project" },
    ]);
  });
});
