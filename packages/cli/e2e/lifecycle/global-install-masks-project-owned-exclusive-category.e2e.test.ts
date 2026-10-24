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
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { createMockSkillAssignment } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { AgentName, SkillConfig } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [createMockSkillAssignment(E2E_SKILL.vitest.id)],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const vueMetadata = renderMetadataYaml({
  displayName: E2E_SKILL["vue-composition-api"].display,
  category: "web-framework",
  slug: E2E_SKILL["vue-composition-api"].slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "c3d4e5f",
});

const vitestMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.vitest.display,
  category: "web-testing",
  slug: E2E_SKILL.vitest.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "d4e5f6a",
});

const WEB_DEV = E2E_AGENT["web-developer"].name;

const GLOBAL_WITH_REACT = buildSeedPayload({
  skills: {
    [E2E_SKILL.vitest.id]: buildSeedSkill({ scope: "global", assignments: { [WEB_DEV]: "lazy" } }),
    [E2E_SKILL.react.id]: buildSeedSkill({
      scope: "global",
      assignments: { [WEB_DEV]: "preloaded" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "global" } },
});

describe("global install masks a project-owned skill in an exclusive category", () => {
  let store: SeedConfigStore;
  let tempDir: string;
  let globalHome: string;
  let projectDir: string;

  let editExitCode: number;
  let editRawOutput: string;

  let globalReact: SkillConfig[];
  let globalReactInstalled: boolean;
  let projectReact: SkillConfig[];
  let projectVue: SkillConfig[];
  let projectVueStillInstalled: boolean;
  let projectReactInstalled: boolean;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    tempDir = await createTempDir();
    globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "registered-project");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // No framework skill is global yet, so the edit adds React to the exclusive category.
    const globalConfig: FixtureProjectConfig = buildProjectConfig({
      name: "exclusivity-global",
      skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      marketplace: E2E_SOURCE.sourceDir,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
      description: "Global vitest copy",
      metadata: vitestMetadata,
    });

    const projectConfig: FixtureProjectConfig = buildProjectConfig({
      name: "exclusivity-project",
      skills: [
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
        ...buildSkillConfigs([E2E_SKILL["vue-composition-api"].id], {
          scope: "project",
          origin: "eject",
        }),
      ],
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
    });
    await writeProjectConfig(projectDir, projectConfig);
    await createLocalSkill(projectDir, E2E_SKILL["vue-composition-api"].id, {
      description: "Project vue copy",
      metadata: vueMetadata,
    });

    ({ exitCode: editExitCode, output: editRawOutput } = await applyFromSeed(
      store,
      "AddReact1",
      GLOBAL_WITH_REACT,
      { dir: globalHome, home: globalHome },
    ));

    globalReact = await readSkillEntries(globalHome, E2E_SKILL.react.id);
    globalReactInstalled = await directoryExists(
      path.join(skillsPath(globalHome), E2E_SKILL.react.id),
    );
    projectReact = await readSkillEntries(projectDir, E2E_SKILL.react.id);
    projectVue = await readSkillEntries(projectDir, E2E_SKILL["vue-composition-api"].id);
    projectVueStillInstalled = await directoryExists(
      path.join(skillsPath(projectDir), E2E_SKILL["vue-composition-api"].id),
    );
    projectReactInstalled = await directoryExists(
      path.join(skillsPath(projectDir), E2E_SKILL.react.id),
    );
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("completes the global-scope skill addition edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  it("adds the framework skill at global scope in the global config", () => {
    expect(globalReact).toStrictEqual([
      {
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.react.display,
      },
    ]);
  });

  it("physically installs the newly-added framework skill at the global scope path", () => {
    expect(globalReactInstalled).toBe(true);
  });

  // Proves propagation fired, not the shape it wrote.
  it("inlines the new global framework skill into the registered project", () => {
    expect(projectReact.map((entry) => entry.scope)).toStrictEqual(["global"]);
  });

  it("leaves the project-owned framework skill active at project scope", () => {
    expect(projectVue).toStrictEqual([
      { id: E2E_SKILL["vue-composition-api"].id, scope: "project", origin: "eject" },
    ]);
  });

  it("leaves the project-owned framework skill installed on disk", () => {
    expect(projectVueStillInstalled).toBe(true);
  });

  it("does not install the global framework skill into the project scope", () => {
    expect(projectReactInstalled).toBe(false);
  });

  it("masks the colliding global framework skill with a tombstone", () => {
    expect(projectReact).toStrictEqual([
      {
        id: E2E_SKILL.react.id,
        scope: "global",
        origin: "eject",
        displayName: E2E_SKILL.react.display,
        excluded: true,
      },
    ]);
  });
});
