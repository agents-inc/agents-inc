import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_MARKETPLACE_NAME, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import type { SkillConfig } from "../../src/cli/types/index.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload, installDualScopeStack } from "../fixtures/e2e-stack-seed.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * Dual-scope edit lifecycle E2E test -- agent content and config integrity.
 *
 */

describe("dual-scope edit lifecycle -- agent content and config integrity", () => {
  let store: SeedConfigStore;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    ({
      tempDir: testTempDir,
      fakeHome,
      projectDir,
    } = await installDualScopeStack(store, E2E_SOURCE.sourceDir));
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
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
 * installs it at PROJECT scope as the project's own ejected copy, which leaves the global install
 * exactly as it was.
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

/** The stack at home, every skill installed as a plugin. */
const PLUGIN_STACK_ID = "PlugStk1";

/** The project's own configuration: the API skill ejected into it, on its own API sub-agent. */
const PROJECT_HONO_ID = "ProjHon1";

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- config preservation", () => {
  let pluginFixture: E2EPluginSource;
  let store: SeedConfigStore;

  beforeAll(async () => {
    pluginFixture = await createE2EPluginSource({ marketplaceName: MARKETPLACE_SOURCE });
    store = await startSeedConfigStore();
    store.publish(PLUGIN_STACK_ID, e2eStackPayload({ scope: "global", install: "plugin" }));
    store.publish(
      PROJECT_HONO_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.hono.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [E2E_AGENT["api-developer"].name]: "preloaded" },
          }),
        },
        agents: { [E2E_AGENT["api-developer"].name]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
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
    "Config split preserves source fields after a project install",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Init global, every skill a plugin from the fixture marketplace
      const phaseA = await runInitFrom(
        store,
        PLUGIN_STACK_ID,
        { dir: fakeHome },
        pluginFixture.sourceDir,
      );
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
      // sources asserted after Phase B are compared against a known start.
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

      // Phase B: Init the project with its own ejected API skill
      const phaseB = await runInitFrom(
        store,
        PROJECT_HONO_ID,
        { dir: projectDir, globalHome: fakeHome },
        pluginFixture.sourceDir,
      );
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
      expect(sortedById(globalSkillsAfterB)).toStrictEqual(sortedById(globalSkillsAfterA));

      // Filesystem agrees with the recorded source at global scope: nothing global was migrated,
      // so no global skill has a local copy under HOME.
      for (const skillId of GLOBAL_SKILL_IDS) {
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(skillId);
      }

      // Proof the phase acted at all: hono is the one skill Phase B installs at project scope,
      // where the project owns it, and its ejected copy lands in the project tree. Without this, every claim above would hold
      // just as well for a Phase B that did nothing.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

      // Registering the project is the one global-config change a project init
      // is expected to make.
      expect(trackedProjects, "global config must track the initialised project").toStrictEqual([
        projectDir,
      ]);

      // Nothing else moved: agents, selected agents, domains, stack, name and
      // source all survive the project install intact.
      expect(
        globalRestAfterB,
        "a project init must not alter any non-skill part of the global config",
      ).toStrictEqual(globalRestAfterA);
    },
  );
});
