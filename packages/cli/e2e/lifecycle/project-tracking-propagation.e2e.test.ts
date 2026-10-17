import { realpathSync } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { E2E_AGENT, E2E_CUSTOM_SKILL, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  createPermissionsFile,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
  renderMetadataYaml,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { readGeneratedUnionMembers } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import type { AgentName, Category, SkillId } from "../../src/cli/types/index.js";

/**
 * Project registration in the global config's `projects`, config-types propagation to registered
 * projects, deregistration on uninstall, and stale-path filtering.
 */

let source: E2EPluginSource;
let store: SeedConfigStore;

const claudeAvailable = await isClaudeCLIAvailable();

beforeAll(async () => {
  if (!claudeAvailable) return;
  source = await createE2EPluginSource();
  store = await startSeedConfigStore();
}, TIMEOUTS.SETUP_DUAL);

afterAll(async () => {
  if (!claudeAvailable) return;
  await store.close();
});

/** The E2E stack as plugins, every skill and sub-agent at global scope, installed at `dir`. */
function installPlugins(dir: string, home: string) {
  return installFromSeed(
    store,
    "Plugins1",
    e2eStackPayload({ install: "plugin" }),
    { dir, home },
    source.sourceDir,
  );
}

describe.skipIf(!claudeAvailable)("project tracking -- registration", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should register project paths in global config after init",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      await installPlugins(fakeHome, fakeHome);

      await installPlugins(project1Dir, fakeHome);

      await installPlugins(project2Dir, fakeHome);

      const globalConfigPath = configTsPath(fakeHome);
      expect(await fileExists(globalConfigPath), "Global config must exist").toBe(true);

      const globalConfig = await readTestFile(globalConfigPath);
      expect(globalConfig, "Global config must contain projects field").toContain("projects:");

      const realProject1 = realpathSync(project1Dir);
      const realProject2 = realpathSync(project2Dir);
      expect(globalConfig, "Global config must contain project-1 path").toContain(realProject1);
      expect(globalConfig, "Global config must contain project-2 path").toContain(realProject2);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- config-types propagation", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "project config-types.ts imports from global install and extends GlobalSkillId",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await installPlugins(fakeHome, fakeHome);

      // The global types are standalone: the source the project's file imports from.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesContent = await readTestFile(globalConfigTypesPath);
      expect(globalTypesContent, "Global config-types must inline skill IDs").toContain(
        E2E_SKILL.react.id,
      );
      expect(globalTypesContent, "Global config-types must NOT import from itself").not.toContain(
        "as GlobalSkillId",
      );

      await installPlugins(projectDir, fakeHome);

      // The project's types import and extend the global ones rather than inlining them.
      const projectConfigTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(projectConfigTypesPath), "Project config-types.ts must exist").toBe(
        true,
      );

      const configTypesContent = await readTestFile(projectConfigTypesPath);
      expect(configTypesContent, "config-types.ts must be auto-generated").toContain(
        "AUTO-GENERATED",
      );

      expect(
        configTypesContent,
        "Project config-types must import SkillId as GlobalSkillId",
      ).toContain("SkillId as GlobalSkillId");
      expect(
        configTypesContent,
        "Project config-types must import AgentName as GlobalAgentName",
      ).toContain("AgentName as GlobalAgentName");
      expect(
        configTypesContent,
        "Project config-types must import Domain as GlobalDomain",
      ).toContain("Domain as GlobalDomain");
      expect(
        configTypesContent,
        "Project config-types must import Category as GlobalCategory",
      ).toContain("Category as GlobalCategory");

      // A standalone write would name no GlobalSkillId at all.
      expect(
        configTypesContent,
        "Project SkillId must extend GlobalSkillId, not replace it",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // The project's config.ts inlines every global row, so its own union must name them too.
      expect(
        configTypesContent,
        "Project config-types must name the global skill IDs its config.ts inlines",
      ).toContain(`'${E2E_SKILL.react.id}'`);

      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);
      const realProjectDir = realpathSync(projectDir);
      expect(globalConfig, "Global config must contain project path").toContain(realProjectDir);
    },
  );

  it(
    "an edit at HOME adding a new global skill preserves project import-and-extend config-types",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // `web-framework-vue-composition-api` is not in the default stack, so the later edit is a
      // genuine global addition, not a scope toggle.
      await installPlugins(fakeHome, fakeHome);

      await installPlugins(projectDir, fakeHome);

      const projectConfigTypesPath = configTypesTsPath(projectDir);
      const projectTypesBefore = await readTestFile(projectConfigTypesPath);
      // Precondition, or the post-edit assertion would pass vacuously.
      expect(
        projectTypesBefore,
        "Pre-condition: Phase B must emit import-and-extend project types",
      ).toContain("SkillId as GlobalSkillId");
      expect(projectTypesBefore).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // A new global skill: the write must rewrite every registered project's config-types.ts.
      await applyFromSeed(
        store,
        "WithVue1",
        e2eStackPayload({
          install: "plugin",
          without: [E2E_SKILL.react.id],
          plus: { [E2E_SKILL["vue-composition-api"].id]: [E2E_AGENT["web-developer"].name] },
        }),
        { dir: fakeHome, home: fakeHome },
      );

      // The global install must have grown, or the propagation assertions test the wrong state.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesAfter = await readTestFile(globalConfigTypesPath);
      expect(
        globalTypesAfter,
        "Pre-condition: global config-types must inline the newly-added skill after Phase C",
      ).toContain(E2E_SKILL["vue-composition-api"].id);

      const projectTypesAfter = await readTestFile(projectConfigTypesPath);

      expect(projectTypesAfter, "Project config-types must stay AUTO-GENERATED").toContain(
        "AUTO-GENERATED",
      );
      expect(
        projectTypesAfter,
        "Project config-types must still import SkillId as GlobalSkillId after global edit",
      ).toContain("SkillId as GlobalSkillId");
      expect(
        projectTypesAfter,
        "Project config-types must still import AgentName as GlobalAgentName after global edit",
      ).toContain("AgentName as GlobalAgentName");
      expect(
        projectTypesAfter,
        "Project config-types must still import Domain as GlobalDomain after global edit",
      ).toContain("Domain as GlobalDomain");
      expect(
        projectTypesAfter,
        "Project config-types must still import Category as GlobalCategory after global edit",
      ).toContain("Category as GlobalCategory");

      expect(
        projectTypesAfter,
        "Project SkillId must still extend GlobalSkillId after the global edit",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // The global rows the sibling config.ts inlines are expected here, not evidence of a
      // standalone write.
      expect(
        projectTypesAfter,
        "the extend form must declare the newly-added global skill its config.ts now inlines",
      ).toContain(`'${E2E_SKILL["vue-composition-api"].id}'`);

      // Proof the fan-out reached this project rather than leaving it untouched.
      expect(
        projectTypesAfter,
        "the global edit must have rewritten the registered project's config-types",
      ).not.toStrictEqual(projectTypesBefore);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- deregistration on uninstall", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should deregister project on uninstall",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      await installPlugins(fakeHome, fakeHome);

      await installPlugins(project1Dir, fakeHome);

      await installPlugins(project2Dir, fakeHome);

      const globalConfigPath = configTsPath(fakeHome);
      const configBefore = await readTestFile(globalConfigPath);
      const realProject1 = realpathSync(project1Dir);
      const realProject2 = realpathSync(project2Dir);
      expect(configBefore, "Both projects should be registered before uninstall").toContain(
        realProject1,
      );
      expect(configBefore, "Both projects should be registered before uninstall").toContain(
        realProject2,
      );

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: project2Dir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, "Uninstall should succeed").toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      const configAfter = await readTestFile(globalConfigPath);
      expect(configAfter, "Global config should still contain project-1").toContain(realProject1);
      expect(
        configAfter,
        "Global config should not contain project-2 after uninstall",
      ).not.toContain(realProject2);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- stale path filtering", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should filter stale project paths during registration",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      await installPlugins(fakeHome, fakeHome);

      await installPlugins(project1Dir, fakeHome);

      // Makes project-1 stale.
      const project1ConfigDir = sourceFolderIn(project1Dir);
      await rm(project1ConfigDir, { recursive: true, force: true });

      // Triggers registration and stale filtering.
      await installPlugins(project2Dir, fakeHome);

      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);

      const realProject2 = realpathSync(project2Dir);
      expect(globalConfig, "Global config must contain project-2 path").toContain(realProject2);

      const realProject1 = realpathSync(project1Dir);
      expect(globalConfig, "Global config should not contain stale project-1 path").not.toContain(
        realProject1,
      );
    },
  );
});

/**
 * A fan-out rewriting a registered project's config-types.ts must resolve categories from the
 * project's own catalogue too: `web-tooling` reaches the project only via its own custom skill.
 * The file stays byte-identical across global/project/global runs; a real global addition still
 * widens it.
 */

/** A public-catalogue id, so every seat resolves it. */
const GLOBAL_SKILL_ID = "web-framework-react" satisfies SkillId;

/** Added by a later global run, in a category nothing else here supplies. */
const ADDED_GLOBAL_SKILL_ID = "api-framework-hono" satisfies SkillId;

const GLOBAL_AGENT_NAME = "web-developer" satisfies AgentName;

/** Project-owned, so the project's own `compile` has something to write. */
const PROJECT_AGENT_NAME = "api-developer" satisfies AgentName;

const PROJECT_CATEGORIES = ["web-framework", "web-tooling"] as const satisfies readonly Category[];

const PROJECT_CATEGORIES_AFTER_GLOBAL_ADDITION = [
  "api-api",
  "web-framework",
  "web-tooling",
] as const satisfies readonly Category[];

const globalSkillMetadata = renderMetadataYaml({
  displayName: "React",
  category: "web-framework",
  domain: "web",
  slug: "react",
  cliDescription: "The global installation's skill",
  contentHash: "a1b2c3d",
});

const addedGlobalSkillMetadata = renderMetadataYaml({
  displayName: "Hono",
  category: "api-api",
  domain: "api",
  slug: "hono",
  cliDescription: "The skill a later global run adds",
  contentHash: "d4e5f6a",
});

/** Takes the global skill, never the local one. */
const projectStack = {
  [PROJECT_AGENT_NAME]: {
    "web-framework": [{ id: GLOBAL_SKILL_ID, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

function buildGlobalConfig(skillIds: readonly string[], projectDir: string): FixtureProjectConfig {
  return buildProjectConfig({
    name: "propagation-project-catalogue-global",
    skills: buildSkillConfigs(skillIds, { scope: "global", origin: "eject" }),
    agents: buildAgentConfigs([GLOBAL_AGENT_NAME], { scope: "global" }),
    selectedDomains: ["web"],
    stack: {
      [GLOBAL_AGENT_NAME]: { "web-framework": [{ id: GLOBAL_SKILL_ID, preloaded: true }] },
    },
    projects: [realpathSync(projectDir)],
  });
}

describe("project tracking -- a fan-out reads each registered project's own catalogue", () => {
  let tempDir: string;
  let globalHome: string;
  let projectDir: string;

  /** Every compile in order, so a failing exit code names its run. */
  const runs: { label: string; exitCode: number; output: string }[] = [];

  let typesAfterFirstGlobal: string;
  let typesAfterProject: string;
  let typesAfterSecondGlobal: string;
  let typesAfterGlobalAddition: string;

  async function compileIn(label: string, dir: string): Promise<void> {
    const result = await CLI.run(["compile"], { dir }, { env: { HOME: globalHome } });
    runs.push({ label, exitCode: result.exitCode, output: result.output });
  }

  beforeAll(async () => {
    const environment = await createTestEnvironment();
    tempDir = environment.tempDir;
    globalHome = environment.fakeHome;
    projectDir = environment.projectDir;

    await writeProjectConfig(globalHome, buildGlobalConfig([GLOBAL_SKILL_ID], projectDir));
    await createLocalSkill(globalHome, GLOBAL_SKILL_ID, {
      description: "The global installation's own copy",
      metadata: globalSkillMetadata,
    });

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "propagation-project-catalogue-project",
        skills: [
          ...buildSkillConfigs([GLOBAL_SKILL_ID], { scope: "global", origin: "eject" }),
          ...buildSkillConfigs([E2E_CUSTOM_SKILL.id], { scope: "project", origin: "eject" }),
        ],
        agents: [
          ...buildAgentConfigs([GLOBAL_AGENT_NAME], { scope: "global" }),
          ...buildAgentConfigs([PROJECT_AGENT_NAME], { scope: "project" }),
        ],
        selectedDomains: ["web"],
        stack: projectStack,
      }),
    );
    await createLocalSkill(projectDir, E2E_CUSTOM_SKILL.id, {
      description: "A skill this project wrote for itself",
      metadata: renderMetadataYaml({
        custom: true,
        displayName: E2E_CUSTOM_SKILL.display,
        category: E2E_CUSTOM_SKILL.category,
        domain: E2E_CUSTOM_SKILL.domain,
        slug: E2E_CUSTOM_SKILL.slug,
        cliDescription: "House tooling conventions",
        contentHash: "c0ffee1",
      }),
    });

    await compileIn("first global compile", globalHome);
    typesAfterFirstGlobal = await readTestFile(configTypesTsPath(projectDir));

    await compileIn("project compile", projectDir);
    typesAfterProject = await readTestFile(configTypesTsPath(projectDir));

    await compileIn("second global compile", globalHome);
    typesAfterSecondGlobal = await readTestFile(configTypesTsPath(projectDir));

    // Same helper as the opening state, so the added skill row is the only difference.
    await writeProjectConfig(
      globalHome,
      buildGlobalConfig([GLOBAL_SKILL_ID, ADDED_GLOBAL_SKILL_ID], projectDir),
    );
    await createLocalSkill(globalHome, ADDED_GLOBAL_SKILL_ID, {
      description: "Added to the global installation after the round trip",
      metadata: addedGlobalSkillMetadata,
    });

    await compileIn("global compile after the addition", globalHome);
    typesAfterGlobalAddition = await readTestFile(configTypesTsPath(projectDir));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("completes every compile of the round trip", () => {
    expect(
      runs.map(({ label, exitCode }) => ({ label, exitCode })),
      `each compile must succeed:\n${runs.map((r) => `--- ${r.label}\n${r.output}`).join("\n")}`,
    ).toStrictEqual([
      { label: "first global compile", exitCode: EXIT_CODES.SUCCESS },
      { label: "project compile", exitCode: EXIT_CODES.SUCCESS },
      { label: "second global compile", exitCode: EXIT_CODES.SUCCESS },
      { label: "global compile after the addition", exitCode: EXIT_CODES.SUCCESS },
    ]);
  });

  // Read off the alias: `web-tooling` also prefixes the project's own skill id, so a whole-file
  // assertion could not fail.
  it("keeps the project's own skill's category in its Category union at every step", () => {
    expect(
      [typesAfterFirstGlobal, typesAfterProject, typesAfterSecondGlobal].map((types) =>
        readGeneratedUnionMembers(types, "Category"),
      ),
      "a global fan-out must not drop the category of a skill only the project's catalogue carries",
    ).toStrictEqual([PROJECT_CATEGORIES, PROJECT_CATEGORIES, PROJECT_CATEGORIES]);
  });

  it("leaves the project's config-types.ts byte-identical across global, project and global", () => {
    expect(
      typesAfterProject,
      "the project's own compile must not have to repair what the global fan-out wrote",
    ).toStrictEqual(typesAfterFirstGlobal);

    expect(
      typesAfterSecondGlobal,
      "a second global fan-out must not undo what the project's own compile wrote",
    ).toStrictEqual(typesAfterProject);
  });

  it("still widens the project's Category union when a global addition legitimately does", () => {
    expect(
      readGeneratedUnionMembers(typesAfterGlobalAddition, "Category"),
      "the added global skill's category must arrive, and the project's own must survive it",
    ).toStrictEqual(PROJECT_CATEGORIES_AFTER_GLOBAL_ADDITION);

    expect(
      typesAfterGlobalAddition,
      "a global change with consequences for the project's types must rewrite them",
    ).not.toStrictEqual(typesAfterSecondGlobal);
  });
});
