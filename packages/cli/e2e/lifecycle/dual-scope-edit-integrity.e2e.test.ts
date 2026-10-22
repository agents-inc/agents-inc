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
import { E2E_MARKETPLACE_NAME, EJECT_SOURCE_NAME, TIMEOUTS } from "../pages/constants.js";
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

      // Under relevance-scoped assignment the api skill never reaches web-developer.
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: [E2E_SKILL.react.id],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        notContains: [E2E_SKILL.hono.id],
      });

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
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.reviewing.id, E2E_SKILL["research-methodology"].id],
      });

      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.reviewing.id, E2E_SKILL["research-methodology"].id],
      });
    },
  );
});

/** Not `agents-inc`: that is the public catalogue's namespace, refused by `build marketplace`. */
const MARKETPLACE_SOURCE = E2E_MARKETPLACE_NAME;

/**
 * Every skill the global install owns, all plugin-sourced; hono's project-scope ejected copy leaves
 * the global one as is.
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

/** Sorted by id so assertions survive config re-serialization. */
const sortedById = (entries: SkillConfig[]): SkillConfig[] =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id));

const PLUGIN_STACK_ID = "PlugStk1";

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
          origin: EJECT_SOURCE_NAME,
        },
      );

      const {
        skills: globalSkillsAfterB,
        projects: trackedProjects,
        ...globalRestAfterB
      } = await loadConfigOrFail(fakeHome);

      // A project init has no authority over the sources of the global install it inherits.
      expect(sortedById(globalSkillsAfterB)).toStrictEqual(sortedById(globalSkillsAfterA));

      for (const skillId of GLOBAL_SKILL_IDS) {
        await expect({ dir: fakeHome }).not.toHaveSkillCopied(skillId);
      }

      // Proof the phase acted at all: hono's ejected copy lands in the project tree.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

      // Registering the project is the one global-config change a project init makes.
      expect(trackedProjects, "global config must track the initialised project").toStrictEqual([
        projectDir,
      ]);

      expect(
        globalRestAfterB,
        "a project init must not alter any non-skill part of the global config",
      ).toStrictEqual(globalRestAfterA);
    },
  );
});
