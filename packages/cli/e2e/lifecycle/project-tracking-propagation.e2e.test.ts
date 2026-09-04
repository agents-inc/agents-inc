import { realpathSync } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, initProjectAllGlobal } from "../fixtures/dual-scope-helpers.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_CUSTOM_SKILL, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
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
  writeProjectConfig,
} from "../helpers/test-utils.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { readGeneratedUnionMembers } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import type { AgentName, Category, SkillId } from "../../src/cli/types/index.js";

/**
 * Project tracking and propagation E2E tests.
 *
 * Verifies:
 * 1. Project paths are registered in global config's `projects` field after init
 * 2. Global config changes propagate config-types.ts to registered projects
 * 3. `uninstall` deregisters the project from global config
 * 4. Stale project paths are filtered during registration
 */

let source: E2EPluginSource;

const claudeAvailable = await isClaudeCLIAvailable();

beforeAll(async () => {
  if (!claudeAvailable) return;
  source = await createE2EPluginSource();
}, TIMEOUTS.SETUP_DUAL);

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

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      const globalExitCode = await globalResult.exitCode;
      expect(globalExitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit (global install already exists)
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Init project-2 via dashboard → Edit
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Verification: Global config should contain projects field with both paths
      const globalConfigPath = configTsPath(fakeHome);
      expect(await fileExists(globalConfigPath), "Global config must exist").toBe(true);

      const globalConfig = await readTestFile(globalConfigPath);
      expect(globalConfig, "Global config must contain projects field").toContain("projects:");

      // Both project paths should be registered (realpath-normalized)
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

      // Phase A: Init from HOME (global) — establishes the global config-types.ts
      // that the project's config-types.ts must import from.
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Verify global install emitted the standalone (inlined) config-types — the
      // global types file is the source of truth for GlobalSkillId / GlobalAgentName.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesContent = await readTestFile(globalConfigTypesPath);
      expect(globalTypesContent, "Global config-types must inline skill IDs").toContain(
        E2E_SKILL.react.id,
      );
      expect(globalTypesContent, "Global config-types must NOT import from itself").not.toContain(
        "as GlobalSkillId",
      );

      // Phase B: Init project via dashboard → Edit with all skills kept at global scope.
      const proj = await initProjectAllGlobal(source, fakeHome, projectDir);
      expect(proj.exitCode, "Project init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Project's config-types.ts must be the IMPORT-AND-EXTEND form, not the
      // standalone/inlined form.
      const projectConfigTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(projectConfigTypesPath), "Project config-types.ts must exist").toBe(
        true,
      );

      const configTypesContent = await readTestFile(projectConfigTypesPath);
      expect(configTypesContent, "config-types.ts must be auto-generated").toContain(
        "AUTO-GENERATED",
      );

      // Must import GlobalSkillId / GlobalAgentName / GlobalDomain / GlobalCategory
      // from the global config-types.ts
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

      // The union EXTENDS the imported alias rather than restating the global list:
      // a standalone write would name no GlobalSkillId at all.
      expect(
        configTypesContent,
        "Project SkillId must extend GlobalSkillId, not replace it",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // With initProjectAllGlobal every skill stays global-scoped, and the project's
      // own config.ts inlines each of those rows — so its own union has to name them
      // too. Covered by the alias alone, this file goes red the moment a later
      // global-scope run drops one of them.
      expect(
        configTypesContent,
        "Project config-types must name the global skill IDs its config.ts inlines",
      ).toContain(`'${E2E_SKILL.react.id}'`);

      // Global config should have project registered
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);
      const realProjectDir = realpathSync(projectDir);
      expect(globalConfig, "Global config must contain project path").toContain(realProjectDir);
    },
  );

  it(
    "cc edit at HOME adding a new global skill preserves project import-and-extend config-types",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A: Global init at HOME with the default stack. Installs the
      // baseline stack skills; `web-framework-vue-composition-api` is
      // deliberately NOT in the default stack, so adding it in Phase C is a
      // genuine global-scope addition — not a scope toggle.
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Project init via dashboard → Edit, keeping all skills at
      // global scope. Produces the import-and-extend project config-types.ts
      // that must survive the Phase C global edit unchanged.
      const proj = await initProjectAllGlobal(source, fakeHome, projectDir);
      expect(proj.exitCode, "Project init should succeed").toBe(EXIT_CODES.SUCCESS);

      const projectConfigTypesPath = configTypesTsPath(projectDir);
      const projectTypesBefore = await readTestFile(projectConfigTypesPath);
      // Pre-condition: project types START in the import-and-extend form. If
      // this fails, Phase B regressed — the Phase C assertion would be a
      // vacuous pass because `propagateGlobalChangesToProjects` is the only
      // code path that could restore the import form.
      expect(
        projectTypesBefore,
        "Pre-condition: Phase B must emit import-and-extend project types",
      ).toContain("SkillId as GlobalSkillId");
      expect(projectTypesBefore).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // Phase C: `cc edit` at HOME and add `Vue Composition Api` to the
      // global install. This is a new global skill (not in the default
      // stack), so the write path sees a globally-added item and must
      // rewrite every registered project's config-types.ts via
      // `propagateGlobalChangesToProjects`, using the import-and-extend
      // form.
      const editWizard = await EditWizard.launch({
        projectDir: fakeHome,
        source,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        // Select Vue in the Web domain, then advance through remaining
        // domains (API, Methodology) to reach Sources. The generic
        // passthrough is required because edit-at-HOME carries all domains
        // where the global install has skills — not just Web.
        await editWizard.build.selectSkill(E2E_SKILL["vue-composition-api"].display);
        const sources = await editWizard.build.passThroughAllDomainsGeneric();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode, "Global edit should succeed").toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } catch (e) {
        await editWizard.destroy();
        throw e;
      }

      // Sanity: the global install must actually have grown — otherwise any
      // downstream assertion about propagation is testing the wrong state.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesAfter = await readTestFile(globalConfigTypesPath);
      expect(
        globalTypesAfter,
        "Pre-condition: global config-types must inline the newly-added skill after Phase C",
      ).toContain(E2E_SKILL["vue-composition-api"].id);

      // Contract: project config-types.ts must STILL be the import-and-extend
      // form after the global edit. A regression would replace the import
      // form with a standalone/inlined union, flipping every registered
      // project's types file on every global edit.
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

      // Still the extend form: the imported alias is the head of the union, not a
      // standalone list that happens to hold the same ids.
      expect(
        projectTypesAfter,
        "Project SkillId must still extend GlobalSkillId after the global edit",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // A standalone write is discriminated by the absence of the import block
      // and of the `GlobalSkillId` union head, both asserted above. The extend
      // form additionally declares the global rows its sibling config.ts inlines,
      // so their presence is expected rather than evidence of a standalone write:
      // the imported unions cover those rows only for as long as the global
      // config still holds them.
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

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Init project-2 via dashboard → Edit
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Pre-check: Both projects should be registered
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

      // Phase D: Uninstall from project-2 (deregistration is now the default)
      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: project2Dir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, "Uninstall should succeed").toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // Verification: Global config should no longer contain project-2
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

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit (registers it)
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Delete project-1's .claude-src/ directory to make it stale
      const project1ConfigDir = path.join(project1Dir, DIRS.CLAUDE_SRC);
      await rm(project1ConfigDir, { recursive: true, force: true });

      // Phase D: Init project-2 via dashboard → Edit (triggers registration + stale filtering)
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Verification: Global config should only contain project-2, not stale project-1
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);

      const realProject2 = realpathSync(project2Dir);
      expect(globalConfig, "Global config must contain project-2 path").toContain(realProject2);

      // Project-1 should have been filtered out as stale (its config.ts no longer exists)
      const realProject1 = realpathSync(project1Dir);
      expect(globalConfig, "Global config should not contain stale project-1 path").not.toContain(
        realProject1,
      );
    },
  );
});

/**
 * The catalogue a fan-out reads when it rewrites a registered project's pair.
 *
 * A global-scope run rewrites every registered project's `config-types.ts`, and it derived
 * that project's type unions from the TRIGGERING command's catalogue. A skill the project
 * holds ITSELF — one written into its own `.claude/skills/`, or one belonging to the
 * marketplace its own config names — is in nobody else's catalogue, so its category
 * resolved to nothing and left the project's `Category` and `Domain` unions. The project's
 * own next `compile` derived them from its own catalogue and put them straight back, so the
 * two commands undid each other for as long as both were run.
 *
 * The two members of the union are chosen so exactly one of them can go missing.
 * `web-framework` reaches the project two ways the global seat can always resolve — the
 * global skill row the project inlines, and the project's own stack key. `web-tooling`
 * reaches it only through {@link E2E_CUSTOM_SKILL}, a skill this project wrote for itself
 * that is in no marketplace and therefore in no other installation's catalogue, and that is
 * deliberately assigned to no sub-agent: a stack key is read off the config record rather
 * than looked up, so a skill in a stack keeps its category whichever catalogue is seated.
 *
 * **The assertion no per-installation check can make is the byte comparison of the SAME
 * file across the three runs.** Each write is internally consistent — its `config.ts` and
 * its `config-types.ts` agree with each other, the skill row is present throughout, and the
 * pair type-checks — so a difference that is consistent WITHIN each installation is
 * invisible to every check made at one end. That is the shape `CLAUDE.md` records for the
 * key-order defect, and its testing corollary is what this reads: compare the two ends'
 * generated artefacts, not each end against its own config. It is also what carries the
 * `Domain` half here, which the membership assertion below cannot — this fixture's own
 * skill and the global one share the `web` domain.
 *
 * The permitted case sits beside it, on the same union and the same fan-out: a global-scope
 * addition in a category the project does not yet name MUST widen these unions. A refusal
 * pinned on its own cannot tell a correctly-scoped rule from one that has stopped writing
 * the project's types at all — both leave the file identical across the round trip.
 */

/** The one skill the global installation holds. A public-catalogue id, so every seat resolves it. */
const GLOBAL_SKILL_ID = "web-framework-react" satisfies SkillId;

/** The skill a later global-scope run ADDS, in a category nothing else in this fixture supplies. */
const ADDED_GLOBAL_SKILL_ID = "api-framework-hono" satisfies SkillId;

/** The sub-agent the global installation compiles, and whose stack carries the global skill. */
const GLOBAL_AGENT_NAME = "web-developer" satisfies AgentName;

/** The sub-agent the project owns, so its own `compile` pass has something to write. */
const PROJECT_AGENT_NAME = "api-developer" satisfies AgentName;

/**
 * The project's `Category` union, in the sorted order the writer emits.
 *
 * Members rather than a count: a count cannot see a swap, and the whole subject here is
 * which member is present.
 */
const PROJECT_CATEGORIES = ["web-framework", "web-tooling"] as const satisfies readonly Category[];

/** The same union after a global-scope addition legitimately widens it. */
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

/** The project's own stack: its sub-agent takes the global skill, and never the local one. */
const projectStack = {
  [PROJECT_AGENT_NAME]: {
    "web-framework": [{ id: GLOBAL_SKILL_ID, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The global config, at whichever point in the round trip it is written. */
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

  /** Every compile of the round trip, in order, so a failing exit code names its own run. */
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

    // The permitted case: a genuine global-scope addition, in a category the project's
    // types do not yet name. Written through the same helper the opening state used, so
    // the only difference between the two global configs is the added skill row.
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

  // Proof of execution. Every assertion below reads a file one of these runs wrote, so a
  // run that failed would leave them reading whatever the previous one left behind.
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

  // The membership, at every point of the round trip at once. Read off the alias rather
  // than the whole file: `web-tooling` is also a prefix of the project's own skill id,
  // which the file names in `SkillId` throughout, so a whole-file assertion could not fail.
  it("keeps the project's own skill's category in its Category union at every step", () => {
    expect(
      [typesAfterFirstGlobal, typesAfterProject, typesAfterSecondGlobal].map((types) =>
        readGeneratedUnionMembers(types, "Category"),
      ),
      "a global fan-out must not drop the category of a skill only the project's catalogue carries",
    ).toStrictEqual([PROJECT_CATEGORIES, PROJECT_CATEGORIES, PROJECT_CATEGORIES]);
  });

  // The assertion no per-installation check can make. Each write is internally consistent,
  // so only the SAME file compared across the three runs can see the disagreement.
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

  // The permitted case, on the same union and through the same fan-out. Without it the
  // assertions above hold just as well for a fan-out that stopped writing the file at all.
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
