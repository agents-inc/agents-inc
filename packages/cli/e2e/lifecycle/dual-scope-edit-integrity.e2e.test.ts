import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_MARKETPLACE_NAME, EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
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
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);
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
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: [...E2E_AGENTS.API],
        },
      });

      // web-developer (global) carries its own domain's skills alone — under
      // relevance-scoped assignment the api skill never reaches it.
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: [E2E_SKILL.react.id],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        notContains: [E2E_SKILL.hono.id],
      });

      // api-developer (project) mirrors it: its own skill, none of the web ones.
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        skills: [E2E_SKILL.hono.id],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
        notContains: [E2E_SKILL.react.id],
      });
    },
  );

  it(
    "Cross-cutting meta skills appear in both agents compiled output",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // web-developer (global) contains both cross-cutting meta skills
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.reviewing.id, E2E_SKILL["research-methodology"].id],
      });

      // api-developer (project) also contains both cross-cutting meta skills
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.reviewing.id, E2E_SKILL["research-methodology"].id],
      });
    },
  );
});

/**
 * Marketplace name for the plugin fixture, and therefore the exact value the saved
 * config's `origin` field carries for every plugin-installed skill.
 *
 * The fixture's own shared name, not `DEFAULT_PUBLIC_SOURCE_NAME`: a marketplace's
 * name is the namespace its skill ids are written in, and `agents-inc` is the
 * public catalogue's — reserved, and refused by `build marketplace`. The assertions
 * below only need the recorded value to be knowable, which any stable name gives.
 */
const MARKETPLACE_SOURCE = E2E_MARKETPLACE_NAME;

/** Source value recorded for a skill installed as a local copy rather than a plugin. */
const EJECT_SOURCE = "eject";

/**
 * Every skill the Phase A global install owns. All seven are plugin-sourced when Phase A ends,
 * and a project init has no authority over any of them, so all seven must still be plugin-sourced
 * — with no local copy under HOME — when Phase B ends. api-framework-hono is on the list: Phase B
 * moves it to PROJECT scope and switches the project's own copy to eject, which leaves the global
 * install it masks exactly as it was.
 */
const GLOBAL_SKILL_IDS = [
  E2E_SKILL.hono.id,
  E2E_SKILL["research-methodology"].id,
  E2E_SKILL["cli-reviewing"].id,
  E2E_SKILL.reviewing.id,
  E2E_SKILL.react.id,
  E2E_SKILL.zustand.id,
  E2E_SKILL.vitest.id,
];

/** Order skill entries by id so assertions survive config re-serialization. */
const sortedById = (entries: SkillConfig[]): SkillConfig[] =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id));

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- config preservation", () => {
  let pluginFixture: E2EPluginSource;

  beforeAll(async () => {
    pluginFixture = await createE2EPluginSource({ marketplaceName: MARKETPLACE_SOURCE });
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(pluginFixture);
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
      // Phase A: Init global (completeWithDefaults — the fixture marketplace is the source)
      const phaseA = await initGlobal(pluginFixture, fakeHome);
      await expectPhaseSuccess(
        { project: { dir: fakeHome }, exitCode: phaseA.exitCode },
        {
          skillIds: [
            E2E_SKILL.react.id,
            E2E_SKILL.vitest.id,
            E2E_SKILL.zustand.id,
            E2E_SKILL.hono.id,
          ],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: MARKETPLACE_SOURCE,
        },
      );
      const { skills: globalSkillsAfterA, ...globalRestAfterA } = await loadConfigOrFail(fakeHome);

      // Pre-state: every global skill is installed from the marketplace, so the
      // migration asserted after Phase B is a real transition, not a no-op.
      expect(sortedById(globalSkillsAfterA)).toStrictEqual([
        { id: E2E_SKILL.hono.id, scope: "global", origin: MARKETPLACE_SOURCE },
        {
          id: E2E_SKILL["research-methodology"].id,
          scope: "global",
          origin: MARKETPLACE_SOURCE,
        },
        { id: E2E_SKILL["cli-reviewing"].id, scope: "global", origin: MARKETPLACE_SOURCE },
        { id: E2E_SKILL.reviewing.id, scope: "global", origin: MARKETPLACE_SOURCE },
        { id: E2E_SKILL.react.id, scope: "global", origin: MARKETPLACE_SOURCE },
        { id: E2E_SKILL.zustand.id, scope: "global", origin: MARKETPLACE_SOURCE },
        { id: E2E_SKILL.vitest.id, scope: "global", origin: MARKETPLACE_SOURCE },
      ]);

      // Phase B: Init project with scope toggling (eject for project-scoped skills)
      const phaseB = await initProject(pluginFixture, fakeHome, projectDir);
      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: phaseB.exitCode },
        {
          skillIds: [E2E_SKILL.hono.id],
          agents: [...E2E_AGENTS.API],
          origin: EJECT_SOURCE,
        },
      );

      const {
        skills: globalSkillsAfterB,
        projects: trackedProjects,
        ...globalRestAfterB
      } = await loadConfigOrFail(fakeHome);

      // The scope split records each skill's source truthfully, and a project init has no
      // authority to change the sources of the GLOBAL install it inherits, so the global skills
      // array comes out of Phase B exactly as Phase A left it.
      //
      // This expectation was inverted deliberately. It used to name `eject` for the six
      // still-global skills, because Phase B's "set all sources to local" was a bulk hotkey that
      // rewrote every active entry regardless of scope, and the run then performed those
      // migrations for real under $HOME. That key is withdrawn and `setInstallMode` refuses a
      // project-context call against an inherited global slot, so the six are untouched. The
      // assertion was pinning the defect; naming the new values is the fix landing, not a
      // weakened claim — it is still `toStrictEqual` over the whole array.
      expect(sortedById(globalSkillsAfterB)).toStrictEqual(sortedById(globalSkillsAfterA));

      // Filesystem agrees with the recorded source at global scope: nothing global was migrated,
      // so no global skill has a local copy under HOME.
      for (const skillId of GLOBAL_SKILL_IDS) {
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(skillId);
      }

      // Proof the phase acted at all: hono is the one skill Phase B moves to project scope, where
      // the project owns it — so it is the one the per-row source switch legitimately reaches, and
      // its ejected copy lands in the project tree. Without this, every claim above would hold
      // just as well for a Phase B that did nothing.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

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
      await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);

      // Assert: api-framework-hono exists at both project and global paths
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.hono.id);

      // Assert: dual-scope config and compiled agents are correct
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: [...E2E_AGENTS.API],
        },
      });
    },
  );
});

describe("dual-scope edit lifecycle -- stack field preserves selected agents", () => {
  let testTempDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Stack field contains only selected agents and survives passthrough edit",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Global init with eject (all agents selected by default)
      const phaseA = await initGlobalWithEject(E2E_SOURCE, fakeHome);
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
        source: E2E_SOURCE,
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
