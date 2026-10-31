import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { seedDefaultSourceCache } from "../fixtures/default-source-cache.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION } from "../fixtures/seed-wire-contract.js";
import {
  agentsPath,
  cleanupTempDir,
  createTempDir,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  PUBLIC_MARKETPLACE_NAME,
  PUBLIC_MARKETPLACE_SOURCE,
  SCAFFOLDED_SKILL_DISPLAY_NAME,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { useClaudeStub } from "../../src/cli/lib/__tests__/helpers/claude-stub.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import type { SkillId } from "../../src/cli/types/index.js";

/** Output is flattened because oclif wraps the warning. */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const GLOBAL_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}acme`;
const PROJECT_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}plain`;

/** Composed, so an id that stopped carrying its marketplace's name would not agree. */
const GLOBAL_SKILL = `${GLOBAL_MARKETPLACE}-example-skill`;
const PROJECT_SKILL = `${PROJECT_MARKETPLACE}-example-skill`;

/** Not namespaced, so both skills carry it. */
const SHARED_SLUG = "example-skill";

/** Each configuration describes itself, as a shared stack's description travels. */
const GLOBAL_DESCRIPTION = "The acme skills, for every project";
const PROJECT_DESCRIPTION = "The plain skills, for this project alone";

const GLOBAL_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  description: GLOBAL_DESCRIPTION,
  skills: {
    [GLOBAL_SKILL]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "global" } },
});

/** Nothing in it is global, as `init --from` requires over an existing global install. */
const PROJECT_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  description: PROJECT_DESCRIPTION,
  skills: {
    [PROJECT_SKILL]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [API_DEV]: "lazy" },
    }),
  },
  agents: { [API_DEV]: { scope: "project" } },
});

const UNASSIGNED_PROJECT_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [PROJECT_SKILL]: buildSeedSkill({ install: "eject", scope: "project", assignments: {} }),
  },
  agents: { [API_DEV]: { on: true, scope: "project" } },
});

/** Constrained to `SkillId`, so retiring either from the public catalogue reddens this line. */
const PUBLIC_SKILL = "web-framework-react" as const satisfies SkillId;
const PUBLIC_PLUGIN_SKILL = "web-testing-vitest" as const satisfies SkillId;

/** The cache fixture's own parameter; it only has to be a skill no payload here asks for. */
const NOT_IN_THE_CHECKOUT = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

const onTheProjectApiDeveloper = (install: "eject" | "plugin") =>
  buildSeedSkill({ install, scope: "project", assignments: { [API_DEV]: "lazy" } });

/** No `marketplace` field, as the editor and `share` mint an id for the public catalogue. */
const PUBLIC_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: { [PUBLIC_SKILL]: onTheProjectApiDeveloper("eject") },
  agents: { [API_DEV]: { scope: "project" } },
});

const PUBLIC_CONFIGURATION_ADDING_A_PLUGIN = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [PUBLIC_SKILL]: onTheProjectApiDeveloper("eject"),
    [PUBLIC_PLUGIN_SKILL]: onTheProjectApiDeveloper("plugin"),
  },
  agents: { [API_DEV]: { scope: "project" } },
});

/** The installed record copies the catalogue's display name. */
function catalogueDisplayName(skillId: SkillId): string {
  const skill = BUILT_IN_MATRIX.skills[skillId];
  if (skill === undefined) throw new Error(`The public catalogue has no skill '${skillId}'`);
  return skill.displayName;
}

const acmeGlobalSkillAsTheProjectListsIt = () =>
  buildSkillConfigs([GLOBAL_SKILL], {
    scope: "global",
    origin: "eject",
    displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
  });

const publicSkillAsTheProjectListsIt = () =>
  buildSkillConfig(PUBLIC_SKILL, {
    scope: "project",
    origin: "eject",
    displayName: catalogueDisplayName(PUBLIC_SKILL),
  });

describe("a global installation from one marketplace under a project from another", () => {
  let marketplacesDir: string;
  let globalMarketplaceDir: string;
  let projectMarketplaceDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    marketplacesDir = await createTempDir();
    globalMarketplaceDir = path.join(marketplacesDir, GLOBAL_MARKETPLACE);
    projectMarketplaceDir = path.join(marketplacesDir, PROJECT_MARKETPLACE);

    for (const name of [GLOBAL_MARKETPLACE, PROJECT_MARKETPLACE]) {
      const scaffold = await CLI.run(["new", "marketplace", name], { dir: marketplacesDir });
      expect(scaffold.exitCode, scaffold.output).toBe(EXIT_CODES.SUCCESS);
      // A marketplace without a valid `.claude-plugin/marketplace.json` is refused everywhere.
      const marketplaceDir = { dir: path.join(marketplacesDir, name) };
      const plugins = await CLI.run(["build", "plugins"], marketplaceDir);
      expect(plugins.exitCode, plugins.output).toBe(EXIT_CODES.SUCCESS);
      const manifest = await CLI.run(["build", "marketplace"], marketplaceDir);
      expect(manifest.exitCode, manifest.output).toBe(EXIT_CODES.SUCCESS);
    }

    store = await startSeedConfigStore();
    store.publish("GlobalX1", GLOBAL_CONFIGURATION);
    store.publish("ProjectY", PROJECT_CONFIGURATION);
    store.publish("NoAgent1", UNASSIGNED_PROJECT_CONFIGURATION);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(marketplacesDir);
  });

  it.each([
    [GLOBAL_MARKETPLACE, GLOBAL_SKILL],
    [PROJECT_MARKETPLACE, PROJECT_SKILL],
  ])("%s ships its one skill, %s, under the shared slug", async (marketplace, skillId) => {
    const skillsDir = path.join(marketplacesDir, marketplace, SOURCE_PATHS.SKILLS_DIR);

    expect(await listFiles(skillsDir)).toStrictEqual([skillId]);
    expect(
      await readTestFile(path.join(skillsDir, skillId, FILES.METADATA_YAML)),
      "both marketplaces must publish the slug for the assertions below to be about a shared one",
    ).toContain(`slug: ${SHARED_SLUG}`);
  });

  describe("installed at each scope with init --from", () => {
    let env: TestEnvironment;
    let projectInstall: CLIResult;

    beforeAll(async () => {
      env = await createTestEnvironment({ permissions: false });

      const globalInstall = await runInitFrom(
        store,
        "GlobalX1",
        { dir: env.fakeHome },
        globalMarketplaceDir,
      );
      expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);

      projectInstall = await runInitFrom(
        store,
        "ProjectY",
        { dir: env.projectDir, globalHome: env.fakeHome },
        projectMarketplaceDir,
      );
      expect(projectInstall.exitCode, projectInstall.output).toBe(EXIT_CODES.SUCCESS);
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(env.tempDir);
    });

    it("installs each scope from its own marketplace, with each sub-agent loading its own skill", async () => {
      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(globalConfig.marketplace).toBe(globalMarketplaceDir);
      expect(globalConfig.skills).toStrictEqual(
        buildSkillConfigs([GLOBAL_SKILL], {
          scope: "global",
          origin: "eject",
          displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
        }),
      );
      expect(globalConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "global" }));

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(projectConfig.marketplace).toBe(projectMarketplaceDir);
      expect(
        projectConfig.skills,
        "the project config lists the global skill beside its own, which is the list the unassigned check reads",
      ).toStrictEqual([
        ...buildSkillConfigs([GLOBAL_SKILL], {
          scope: "global",
          origin: "eject",
          displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
        }),
        ...buildSkillConfigs([PROJECT_SKILL], {
          scope: "project",
          origin: "eject",
          displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
        }),
      ]);

      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([GLOBAL_SKILL]);
      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
      expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${WEB_DEV}.md`]);
      expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${API_DEV}.md`]);

      await expect({ dir: env.fakeHome }).toHaveAgentDynamicSkills(WEB_DEV, {
        skillIds: [GLOBAL_SKILL],
        noSkillIds: [PROJECT_SKILL],
      });
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
        skillIds: [PROJECT_SKILL],
        noSkillIds: [GLOBAL_SKILL],
      });
    });

    it("describes each scope as its own configuration does", async () => {
      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(globalConfig.description).toBe(GLOBAL_DESCRIPTION);

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(
        projectConfig.description,
        "the project took the global installation's description over the one its own configuration carried",
      ).toBe(PROJECT_DESCRIPTION);
    });

    it("does not report the global installation's skill as assigned to no sub-agent", () => {
      const said = flattenCliOutput(projectInstall.output);

      expect(said, "the install must have run past the point the warning is printed").toContain(
        STEP_TEXT.INIT_SUCCESS,
      );
      expect(
        said,
        "every skill here is on a sub-agent at its own scope, the global one on the global web-developer",
      ).not.toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
    });

    it("lists both skills from search in the project, and reports no duplicate slug", async () => {
      const { exitCode, output } = await CLI.run(["search", SHARED_SLUG], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(
        said,
        "the global installation's copy is merged into the project's catalogue",
      ).toContain(GLOBAL_SKILL);
      expect(said, "the project marketplace's own skill is found beside it").toContain(
        PROJECT_SKILL,
      );
      expect(
        said,
        "a slug two marketplaces share is legal, since only ids carry a namespace, and nothing here is ignored",
      ).not.toContain(STEP_TEXT.DUPLICATE_SLUG);
    });

    it("reports no duplicate slug from doctor in the project", async () => {
      const { exitCode, output } = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said, "the report must have run to its summary").toContain(STEP_TEXT.DOCTOR_SUMMARY);
      expect(
        said,
        "a slug two marketplaces share is not a defect in this installation",
      ).not.toContain(STEP_TEXT.DUPLICATE_SLUG);
    });

    it("counts only the skills the project's marketplace ships as available from it, from doctor in the project", async () => {
      const { exitCode, output } = await CLI.run(["doctor"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);
      expect(said).toContain(`${STEP_TEXT.DOCTOR_SOURCE_LOCAL} ${projectMarketplaceDir}`);
      expect(
        said,
        "the project's marketplace ships one skill; the global installation's, ejected from the other marketplace, is not available from it",
      ).toContain(STEP_TEXT.DOCTOR_ONE_SKILL_AVAILABLE);
    });

    it("recompiles the project without reporting a duplicate slug", async () => {
      const { exitCode, output } = await CLI.run(["compile"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said).toContain(STEP_TEXT.COMPILE_COMPLETE);
      expect(
        said,
        "a slug two marketplaces share is not a defect in this installation",
      ).not.toContain(STEP_TEXT.DUPLICATE_SLUG);
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
        skillIds: [PROJECT_SKILL],
      });
    });

    it("recompiles at home, into the project as well, without reporting a duplicate slug", async () => {
      const { exitCode, output } = await CLI.run(["compile"], { dir: env.fakeHome });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(
        said,
        "the recompile must reach the project, where the two marketplaces meet",
      ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
      expect(
        said,
        "a slug two marketplaces share is not a defect in this installation",
      ).not.toContain(STEP_TEXT.DUPLICATE_SLUG);
      await expect(
        { dir: env.fakeHome },
        "the skill the warning claimed to ignore is still loaded by the global sub-agent",
      ).toHaveAgentDynamicSkills(WEB_DEV, { skillIds: [GLOBAL_SKILL] });
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
        skillIds: [PROJECT_SKILL],
      });
    });
  });

  describe("a project skill handed to no sub-agent, over the same global installation", () => {
    let env: TestEnvironment | undefined;

    afterAll(async () => {
      if (env) await cleanupTempDir(env.tempDir);
    });

    it("is still named as assigned to no sub-agent", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
      env = await createTestEnvironment({ permissions: false });

      const globalInstall = await runInitFrom(
        store,
        "GlobalX1",
        { dir: env.fakeHome },
        globalMarketplaceDir,
      );
      expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);

      const { exitCode, output } = await runInitFrom(
        store,
        "NoAgent1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        projectMarketplaceDir,
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(
        flattenCliOutput(output),
        "a skill this configuration selected and gave to no sub-agent is loaded by nothing, so the user is told",
      ).toContain(
        `Skill '${SCAFFOLDED_SKILL_DISPLAY_NAME}' ${STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT}`,
      );

      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
        noSkillIds: [PROJECT_SKILL],
      });
    });
  });

  describe("a project from the public catalogue, under a global installation from a custom marketplace", () => {
    const PUBLIC_ID = "PublicP1";
    const PUBLIC_PLUGIN_ID = "PublicP2";
    const NAMES_PLAIN_ID = "NamesPln";
    const NAMES_ACME_ID = "NamesAcm";

    const claude = useClaudeStub();
    let env: TestEnvironment | undefined;
    let prompt: InteractivePrompt | undefined;

    beforeAll(() => {
      store.publish(PUBLIC_ID, PUBLIC_CONFIGURATION);
      store.publish(PUBLIC_PLUGIN_ID, PUBLIC_CONFIGURATION_ADDING_A_PLUGIN);
      store.publish(NAMES_PLAIN_ID, {
        ...PROJECT_CONFIGURATION,
        marketplace: projectMarketplaceDir,
      });
      // Names a marketplace that ships nothing the payload asks for, so only the flag can install it.
      store.publish(NAMES_ACME_ID, { ...PROJECT_CONFIGURATION, marketplace: globalMarketplaceDir });
    });

    afterEach(async () => {
      await prompt?.destroy();
      prompt = undefined;
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    /** Holds a checkout of the public catalogue, so installing from it is offline. */
    async function takeEnvironmentWithAcmeGlobal(): Promise<TestEnvironment> {
      const environment = await createTestEnvironment({ permissions: false });
      await seedDefaultSourceCache(environment.fakeHome, { omitting: NOT_IN_THE_CHECKOUT });

      const globalInstall = await runInitFrom(
        store,
        "GlobalX1",
        { dir: environment.fakeHome },
        globalMarketplaceDir,
      );
      expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);
      const globalConfig = await loadConfigOrFail(environment.fakeHome);
      expect(
        { marketplace: globalConfig.marketplace, marketplaceName: globalConfig.marketplaceName },
        "precondition: a global installation recording the custom marketplace and its name",
      ).toStrictEqual({ marketplace: globalMarketplaceDir, marketplaceName: GLOBAL_MARKETPLACE });
      return environment;
    }

    /** No `--marketplace`: what the id carries decides the marketplace. */
    function initFromWithoutTheFlag(environment: TestEnvironment, id: string): Promise<CLIResult> {
      return CLI.run(
        ["init", "--from", id],
        { dir: environment.projectDir, globalHome: environment.fakeHome },
        { env: { AGENTS_INC_API_URL: store.url } },
      );
    }

    it(
      "installs an id that names no marketplace from the public catalogue, and records it under its own name",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();

        const { exitCode, output } = await initFromWithoutTheFlag(env, PUBLIC_ID);

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(
          flattenCliOutput(output),
          "a public-catalogue id is not resolved against the global installation's marketplace",
        ).not.toContain(STEP_TEXT.CATALOG_DOES_NOT_KNOW);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);

        const projectConfig = await loadConfigOrFail(env.projectDir);
        expect(projectConfig.skills).toStrictEqual([
          ...acmeGlobalSkillAsTheProjectListsIt(),
          buildSkillConfig(PUBLIC_SKILL, {
            scope: "project",
            origin: "eject",
            displayName: catalogueDisplayName(PUBLIC_SKILL),
          }),
        ]);
        expect(
          {
            marketplace: projectConfig.marketplace,
            marketplaceName: projectConfig.marketplaceName,
          },
          "the project's marketplace is the public catalogue, under the public catalogue's own name",
        ).toStrictEqual({
          marketplace: PUBLIC_MARKETPLACE_SOURCE,
          marketplaceName: PUBLIC_MARKETPLACE_NAME,
        });
        await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
          skillIds: [PUBLIC_SKILL],
        });
      },
    );

    it(
      "records the public catalogue named by the flag under its own name, not the global installation's",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();

        const { exitCode, output } = await runInitFrom(
          store,
          PUBLIC_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          PUBLIC_MARKETPLACE_SOURCE,
        );

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);
        const projectConfig = await loadConfigOrFail(env.projectDir);
        expect(
          {
            marketplace: projectConfig.marketplace,
            marketplaceName: projectConfig.marketplaceName,
          },
          "a name labels only the marketplace it was read beside; the global's names another",
        ).toStrictEqual({
          marketplace: PUBLIC_MARKETPLACE_SOURCE,
          marketplaceName: PUBLIC_MARKETPLACE_NAME,
        });
      },
    );

    it(
      "installs a public plugin a later edit --from adds under the public catalogue's name",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();
        const projectInstall = await runInitFrom(
          store,
          PUBLIC_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          PUBLIC_MARKETPLACE_SOURCE,
        );
        expect(projectInstall.exitCode, projectInstall.output).toBe(EXIT_CODES.SUCCESS);

        prompt = new InteractivePrompt(["edit", "--from", PUBLIC_PLUGIN_ID], env.projectDir, {
          env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
        });
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

        expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
        expect(
          await claude.changes(),
          "the plugin is asked for under the marketplace it ships from, not the global installation's",
        ).toStrictEqual([
          "plugin marketplace add agents-inc/skills",
          `plugin install ${PUBLIC_PLUGIN_SKILL}@${PUBLIC_MARKETPLACE_NAME} --scope project`,
        ]);
        expect((await loadConfigOrFail(env.projectDir)).skills).toStrictEqual([
          ...acmeGlobalSkillAsTheProjectListsIt(),
          buildSkillConfig(PUBLIC_SKILL, {
            scope: "project",
            origin: "eject",
            displayName: catalogueDisplayName(PUBLIC_SKILL),
          }),
          buildSkillConfig(PUBLIC_PLUGIN_SKILL, {
            scope: "project",
            origin: PUBLIC_MARKETPLACE_NAME,
            displayName: catalogueDisplayName(PUBLIC_PLUGIN_SKILL),
          }),
        ]);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);
      },
    );

    it(
      "installs an id naming a custom marketplace from that marketplace",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();

        const { exitCode, output } = await initFromWithoutTheFlag(env, NAMES_PLAIN_ID);

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
        const projectConfig = await loadConfigOrFail(env.projectDir);
        expect(projectConfig.skills).toStrictEqual([
          ...acmeGlobalSkillAsTheProjectListsIt(),
          ...buildSkillConfigs([PROJECT_SKILL], {
            scope: "project",
            origin: "eject",
            displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
          }),
        ]);
        expect({
          marketplace: projectConfig.marketplace,
          marketplaceName: projectConfig.marketplaceName,
        }).toStrictEqual({
          marketplace: projectMarketplaceDir,
          marketplaceName: PROJECT_MARKETPLACE,
        });
      },
    );

    it(
      "installs from the marketplace the flag names over the one the id names",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();

        const { exitCode, output } = await runInitFrom(
          store,
          NAMES_ACME_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          projectMarketplaceDir,
        );

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
        const projectConfig = await loadConfigOrFail(env.projectDir);
        expect({
          marketplace: projectConfig.marketplace,
          marketplaceName: projectConfig.marketplaceName,
        }).toStrictEqual({
          marketplace: projectMarketplaceDir,
          marketplaceName: PROJECT_MARKETPLACE,
        });
      },
    );

    // The CI recipe: CC_MARKETPLACE applies "when neither --marketplace nor the id names one".
    it(
      "installs an id that names no marketplace from the one CC_MARKETPLACE names",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithAcmeGlobal();

        const { exitCode, output } = await CLI.run(
          ["init", "--from", "ProjectY"],
          { dir: env.projectDir, globalHome: env.fakeHome },
          { env: { AGENTS_INC_API_URL: store.url, CC_MARKETPLACE: projectMarketplaceDir } },
        );

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
        const projectConfig = await loadConfigOrFail(env.projectDir);
        expect({
          marketplace: projectConfig.marketplace,
          marketplaceName: projectConfig.marketplaceName,
        }).toStrictEqual({
          marketplace: projectMarketplaceDir,
          marketplaceName: PROJECT_MARKETPLACE,
        });
      },
    );
  });

  describe("a project from the public catalogue, before a global installation from a custom marketplace", () => {
    const PUBLIC_ID = "PublicB1";
    const PUBLIC_PLUGIN_ID = "PublicB2";

    const claude = useClaudeStub();
    let env: TestEnvironment | undefined;
    let prompt: InteractivePrompt | undefined;

    beforeAll(() => {
      store.publish(PUBLIC_ID, PUBLIC_CONFIGURATION);
      store.publish(PUBLIC_PLUGIN_ID, PUBLIC_CONFIGURATION_ADDING_A_PLUGIN);
    });

    afterEach(async () => {
      await prompt?.destroy();
      prompt = undefined;
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    /** No global installation yet; the seeded checkout keeps installing from the public catalogue offline. */
    async function takeEnvironmentWithPublicProject(): Promise<TestEnvironment> {
      const environment = await createTestEnvironment({ permissions: false });
      await seedDefaultSourceCache(environment.fakeHome, { omitting: NOT_IN_THE_CHECKOUT });

      const projectInstall = await CLI.run(
        ["init", "--from", PUBLIC_ID],
        { dir: environment.projectDir, globalHome: environment.fakeHome },
        { env: { AGENTS_INC_API_URL: store.url } },
      );
      expect(projectInstall.exitCode, projectInstall.output).toBe(EXIT_CODES.SUCCESS);
      return environment;
    }

    async function installAcmeGlobal(environment: TestEnvironment): Promise<void> {
      const globalInstall = await runInitFrom(
        store,
        "GlobalX1",
        { dir: environment.fakeHome },
        globalMarketplaceDir,
      );
      expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);
    }

    async function applyAddingAPublicPlugin(environment: TestEnvironment): Promise<number> {
      prompt = new InteractivePrompt(["edit", "--from", PUBLIC_PLUGIN_ID], environment.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: environment.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      return prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    }

    it(
      "keeps the project's own marketplace and name when the global installation arrives",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithPublicProject();
        const before = await loadConfigOrFail(env.projectDir);
        expect(before.marketplace, "precondition: a project set up from the public catalogue").toBe(
          PUBLIC_MARKETPLACE_SOURCE,
        );

        await installAcmeGlobal(env);

        const after = await loadConfigOrFail(env.projectDir);
        expect(
          after.skills,
          "the global installation is written into the project's config",
        ).toStrictEqual([
          ...acmeGlobalSkillAsTheProjectListsIt(),
          publicSkillAsTheProjectListsIt(),
        ]);
        expect(
          { marketplace: after.marketplace, marketplaceName: after.marketplaceName },
          "a global installation from another marketplace leaves the project's marketplace and its name as they were",
        ).toStrictEqual({
          marketplace: before.marketplace,
          marketplaceName: before.marketplaceName,
        });
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);
      },
    );

    it(
      "installs a public plugin a later edit --from adds under the public catalogue's name",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithPublicProject();
        await installAcmeGlobal(env);

        const exitCode = await applyAddingAPublicPlugin(env);

        expect(exitCode, `apply failed: ${prompt?.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
        expect(
          await claude.changes(),
          "the plugin is asked for under the marketplace it ships from, not the global installation's",
        ).toStrictEqual([
          "plugin marketplace add agents-inc/skills",
          `plugin install ${PUBLIC_PLUGIN_SKILL}@${PUBLIC_MARKETPLACE_NAME} --scope project`,
        ]);
        expect((await loadConfigOrFail(env.projectDir)).skills).toStrictEqual([
          ...acmeGlobalSkillAsTheProjectListsIt(),
          publicSkillAsTheProjectListsIt(),
          buildSkillConfig(PUBLIC_PLUGIN_SKILL, {
            scope: "project",
            origin: PUBLIC_MARKETPLACE_NAME,
            displayName: catalogueDisplayName(PUBLIC_PLUGIN_SKILL),
          }),
        ]);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);
      },
    );

    it(
      "installs a public plugin a later edit --from adds under the public catalogue's name, with no global installation",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await takeEnvironmentWithPublicProject();

        const exitCode = await applyAddingAPublicPlugin(env);

        expect(exitCode, `apply failed: ${prompt?.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
        expect(await claude.changes()).toStrictEqual([
          "plugin marketplace add agents-inc/skills",
          `plugin install ${PUBLIC_PLUGIN_SKILL}@${PUBLIC_MARKETPLACE_NAME} --scope project`,
        ]);
        expect((await loadConfigOrFail(env.projectDir)).skills).toStrictEqual([
          publicSkillAsTheProjectListsIt(),
          buildSkillConfig(PUBLIC_PLUGIN_SKILL, {
            scope: "project",
            origin: PUBLIC_MARKETPLACE_NAME,
            displayName: catalogueDisplayName(PUBLIC_PLUGIN_SKILL),
          }),
        ]);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PUBLIC_SKILL]);
      },
    );
  });
});
