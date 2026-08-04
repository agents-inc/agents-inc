import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { createMockSkillAssignment } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type {
  AgentName,
  ProjectConfig,
  SkillConfig,
  StackAgentConfig,
} from "../../src/cli/types/index.js";

/**
 * Category exclusivity across scopes.
 *
 * `web-framework` is an exclusive + required category: a project may hold at
 * most one active framework skill. Cross-scope reconciliation, however, is keyed
 * on skill-id equality and knows nothing about categories, so a project that
 * owns Vue at PROJECT scope keeps that entry active while a GLOBAL install of
 * React is re-inlined as a SECOND active entry — two active skills in one
 * exclusive category inside the project's config.ts.
 *
 * Expected shape: the project's own skill wins locally and the global install is
 * masked with a `{ scope: "global", excluded: true }` tombstone, exactly as a
 * same-id dual-scope `[P][G]` pair is written today.
 *
 * User-visible consequence: re-opening `cc edit` at project scope renders the
 * exclusive Framework category as `(2 of 1)` — both frameworks selected at once.
 */

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [createMockSkillAssignment(E2E_SKILL.vitest.id)],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

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

describe("global install masks a project-owned skill in an exclusive category", () => {
  let sourceDir: string;
  let sourceTempDir: string;
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
  let frameworkSelectedCount: number;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    tempDir = await createTempDir();
    globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "registered-project");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Global install: vitest only. No framework skill is active globally yet, so
    // the Phase-2 edit ADDS React to the exclusive web-framework category — the
    // genuine project-then-global collision. The project is pre-registered so
    // the global save fans out to it.
    const globalConfig: ProjectConfig = buildProjectConfig({
      name: "exclusivity-global",
      skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", source: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      domains: ["web"],
      selectedAgents: [E2E_AGENT["web-developer"].name],
      stack: globalStack,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
      description: "Global vitest copy",
      metadata: vitestMetadata,
    });

    // Registered project P: owns Vue at PROJECT scope in the exclusive
    // web-framework category, and inherits vitest from the global install.
    const projectConfig: ProjectConfig = buildProjectConfig({
      name: "exclusivity-project",
      skills: [
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", source: "eject" }),
        ...buildSkillConfigs([E2E_SKILL["vue-composition-api"].id], {
          scope: "project",
          source: "eject",
        }),
      ],
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedAgents: [E2E_AGENT["web-developer"].name],
    });
    await writeProjectConfig(projectDir, projectConfig);
    await createLocalSkill(projectDir, E2E_SKILL["vue-composition-api"].id, {
      description: "Project vue copy",
      metadata: vueMetadata,
    });

    // Phase 2: `cc edit` at HOME, add React at global scope. The global save
    // propagates to the registered project.
    const wizard = await EditWizard.launchInGlobal({
      projectDir: globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      ...TERMINAL_SIZE.TALL,
    });
    try {
      await wizard.build.selectSkill(E2E_SKILL.react.display);
      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      // Adding a new skill otherwise defaults to plugin mode, which the local
      // test source cannot resolve.
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      editExitCode = await result.exitCode;
      editRawOutput = result.rawOutput;
      await result.destroy();
    } catch (e) {
      await wizard.destroy();
      throw e;
    }

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

    // Phase 3: re-open `cc edit` at PROJECT scope and read the exclusive
    // Framework category's live selection counter, then abort without saving.
    const projectWizard = await EditWizard.launchInProject({
      projectDir,
      globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      ...TERMINAL_SIZE.TALL,
    });
    try {
      frameworkSelectedCount = await projectWizard.build.getExclusiveCategorySelectedCount(
        STEP_TEXT.CATEGORY_FRAMEWORK,
      );
    } finally {
      await projectWizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    }
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("completes the global-scope skill addition edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // Proof the collision was actually created: React is now a single active
  // global framework skill, backed by a real install on disk.
  it("adds the framework skill at global scope in the global config", () => {
    expect(globalReact).toStrictEqual([
      { id: E2E_SKILL.react.id, scope: "global", source: "eject" },
    ]);
  });

  it("physically installs the newly-added framework skill at the global scope path", () => {
    expect(globalReactInstalled).toBe(true);
  });

  // Proof-of-execution: propagation reached the registered project and inlined
  // a global entry for React. Holds on both the buggy and the fixed code — it
  // only asserts propagation FIRED, not the shape it wrote.
  it("inlines the new global framework skill into the registered project", () => {
    expect(projectReact.map((entry) => entry.scope)).toStrictEqual(["global"]);
  });

  // The project's own framework skill is untouched by a global change.
  it("leaves the project-owned framework skill active at project scope", () => {
    expect(projectVue).toStrictEqual([
      { id: E2E_SKILL["vue-composition-api"].id, scope: "project", source: "eject" },
    ]);
  });

  it("leaves the project-owned framework skill installed on disk", () => {
    expect(projectVueStillInstalled).toBe(true);
  });

  it("does not install the global framework skill into the project scope", () => {
    expect(projectReactInstalled).toBe(false);
  });

  // RED on current main: React is inlined as a second ACTIVE entry, so the
  // project holds two active skills in one exclusive category.
  it("masks the colliding global framework skill with a tombstone", () => {
    expect(projectReact).toStrictEqual([
      { id: E2E_SKILL.react.id, scope: "global", source: "eject", excluded: true },
    ]);
  });

  // RED on current main: the exclusive category renders "(2 of 1)" — both
  // frameworks selected at once in a category that permits one.
  it("shows a single selected skill in the exclusive category on a project-scope edit", () => {
    expect(
      frameworkSelectedCount,
      "an exclusive category must render exactly one selected skill",
    ).toBe(1);
  });
});
