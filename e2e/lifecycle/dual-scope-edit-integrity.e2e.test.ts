import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_AGENTS } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import type { SkillConfig } from "../../src/cli/types/index.js";
import {
  createTestEnvironment,
  initGlobal,
  initGlobalWithEject,
  initProject,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * Dual-scope edit lifecycle E2E test -- agent content and config integrity.
 *
 */

describe("dual-scope edit lifecycle -- agent content and config integrity", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Compiled agents contain only their assigned skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Verify both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
        },
      });

      // web-developer (global) contains its preloaded skills and all selected skills
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: ["web-framework-react"],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["api-framework-hono"],
      });

      // api-developer (project) contains its assigned skill and all selected skills
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        skills: ["api-framework-hono"],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["web-framework-react"],
      });
    },
  );

  it(
    "Cross-cutting meta skills appear in both agents compiled output",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // web-developer (global) contains both cross-cutting meta skills
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["meta-reviewing-reviewing", "meta-methodology-research-methodology"],
      });

      // api-developer (project) also contains both cross-cutting meta skills
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["meta-reviewing-reviewing", "meta-methodology-research-methodology"],
      });
    },
  );
});

/**
 * Marketplace name for the plugin fixture. Matches DEFAULT_PUBLIC_SOURCE_NAME so
 * the saved config source field is exactly this value.
 */
const MARKETPLACE_SOURCE = "agents-inc";

/** Source value recorded for a skill installed as a local copy rather than a plugin. */
const EJECT_SOURCE = "eject";

/**
 * The global-scope skills that Phase B's "set all sources to local" genuinely
 * migrates from the marketplace to a local copy in HOME. api-framework-hono is
 * absent: it moves to project scope, so its global install is never migrated.
 */
const EJECTED_GLOBAL_SKILL_IDS = [
  "meta-methodology-research-methodology",
  "meta-reviewing-cli-reviewing",
  "meta-reviewing-reviewing",
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
];

/** Order skill entries by id so assertions survive config re-serialization. */
const sortedById = (entries: SkillConfig[]): SkillConfig[] =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id));

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- config preservation", () => {
  let pluginFixture: E2EPluginSource;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginFixture = await createE2EPluginSource({ marketplaceName: MARKETPLACE_SOURCE });
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (pluginFixture) await cleanupTempDir(pluginFixture.tempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Config split preserves source fields after edit",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Init global (completeWithDefaults — marketplace source "agents-inc")
      const phaseA = await initGlobal(pluginFixture.sourceDir, pluginFixture.tempDir, fakeHome);
      await expectPhaseSuccess(
        { project: { dir: fakeHome }, exitCode: phaseA.exitCode },
        {
          skillIds: [
            "web-framework-react",
            "web-testing-vitest",
            "web-state-zustand",
            "api-framework-hono",
          ],
          agents: E2E_AGENTS.WEB_AND_API,
          source: MARKETPLACE_SOURCE,
        },
      );
      const { skills: globalSkillsAfterA, ...globalRestAfterA } = await loadConfigOrFail(fakeHome);

      // Pre-state: every global skill is installed from the marketplace, so the
      // migration asserted after Phase B is a real transition, not a no-op.
      expect(sortedById(globalSkillsAfterA)).toStrictEqual([
        { id: "api-framework-hono", scope: "global", source: MARKETPLACE_SOURCE },
        {
          id: "meta-methodology-research-methodology",
          scope: "global",
          source: MARKETPLACE_SOURCE,
        },
        { id: "meta-reviewing-cli-reviewing", scope: "global", source: MARKETPLACE_SOURCE },
        { id: "meta-reviewing-reviewing", scope: "global", source: MARKETPLACE_SOURCE },
        { id: "web-framework-react", scope: "global", source: MARKETPLACE_SOURCE },
        { id: "web-state-zustand", scope: "global", source: MARKETPLACE_SOURCE },
        { id: "web-testing-vitest", scope: "global", source: MARKETPLACE_SOURCE },
      ]);

      // Phase B: Init project with scope toggling (eject for project-scoped skills)
      const phaseB = await initProject(
        pluginFixture.sourceDir,
        pluginFixture.tempDir,
        fakeHome,
        projectDir,
      );
      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: phaseB.exitCode },
        {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
          source: EJECT_SOURCE,
        },
      );

      const {
        skills: globalSkillsAfterB,
        projects: trackedProjects,
        ...globalRestAfterB
      } = await loadConfigOrFail(fakeHome);

      // The scope split records each skill's source truthfully. Phase B's "set
      // all sources to local" really does replace the six still-global plugin
      // installs with local copies in HOME, so the global config now says
      // "eject" for them. api-framework-hono keeps the marketplace source: it
      // moved to project scope, so its global install was never migrated.
      expect(sortedById(globalSkillsAfterB)).toStrictEqual([
        { id: "api-framework-hono", scope: "global", source: MARKETPLACE_SOURCE },
        { id: "meta-methodology-research-methodology", scope: "global", source: EJECT_SOURCE },
        { id: "meta-reviewing-cli-reviewing", scope: "global", source: EJECT_SOURCE },
        { id: "meta-reviewing-reviewing", scope: "global", source: EJECT_SOURCE },
        { id: "web-framework-react", scope: "global", source: EJECT_SOURCE },
        { id: "web-state-zustand", scope: "global", source: EJECT_SOURCE },
        { id: "web-testing-vitest", scope: "global", source: EJECT_SOURCE },
      ]);

      // Filesystem agrees with the recorded source at global scope: every
      // eject-sourced skill has a real directory in HOME, and the one still
      // sourced from the marketplace has none because it is still a plugin.
      await expect({ dir: fakeHome }).toHaveLocalSkills(EJECTED_GLOBAL_SKILL_IDS);
      await expect({ dir: fakeHome }).not.toHaveSkillCopied("api-framework-hono");

      // Filesystem agrees with the recorded source at project scope too: the
      // project-scoped copy of hono is ejected into the project.
      await expect({ dir: projectDir }).toHaveSkillCopied("api-framework-hono");

      // Registering the project is the one global-config change a project init
      // is expected to make.
      expect(trackedProjects, "global config must track the initialised project").toStrictEqual([
        projectDir,
      ]);

      // Nothing else moved: agents, selected agents, domains, stack, name and
      // source all survive the project edit intact.
      expect(
        globalRestAfterB,
        "a project init must not alter any non-skill part of the global config",
      ).toStrictEqual(globalRestAfterA);
    },
  );
});

describe("dual-scope edit lifecycle -- eject scope toggle copies skill to project", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Globally-ejected skill toggled to project scope exists at both paths",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Assert: api-framework-hono exists at both project and global paths
      await expect({ dir: projectDir }).toHaveSkillCopied("api-framework-hono");
      await expect({ dir: fakeHome }).toHaveSkillCopied("api-framework-hono");

      // Assert: dual-scope config and compiled agents are correct
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
        },
      });
    },
  );
});

describe("dual-scope edit lifecycle -- stack field preserves selected agents", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Stack field contains only selected agents and survives passthrough edit",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Global init with eject (all agents selected by default)
      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Load config.ts structurally and read the stack's agent keys
      const readStackAgentKeys = async (): Promise<string[]> => {
        const { stack } = await loadConfigOrFail(fakeHome);
        expect(stack, "Config must have a stack variable").toBeDefined();
        return Object.keys(stack ?? {}).sort();
      };

      const stackKeysAfterInit = await readStackAgentKeys();

      // Stack must contain both agents from the E2E test stack
      expect(stackKeysAfterInit).toContain("web-developer");
      expect(stackKeysAfterInit).toContain("api-developer");

      // Phase B: Edit wizard passthrough (no changes)
      const wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode, "Edit passthrough must succeed").toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // Stack must still contain the same agents (no agents added or removed)
      const stackKeysAfterEdit = await readStackAgentKeys();
      expect(stackKeysAfterEdit).toContain("web-developer");
      expect(stackKeysAfterEdit).toContain("api-developer");
      expect(stackKeysAfterEdit).toStrictEqual(stackKeysAfterInit);
    },
  );
});
