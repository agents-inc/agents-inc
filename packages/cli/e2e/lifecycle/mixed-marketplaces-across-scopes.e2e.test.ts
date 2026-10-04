import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
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
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * A global installation from one marketplace, and a project installed from another beside it.
 *
 * The namespace ruling keeps the two from ever naming one skill: ids carry their marketplace's
 * prefix. Slugs do not, and every `new marketplace` scaffold gives its example skill the same one,
 * so two scaffolds are the smallest real installation where two marketplaces meet on a slug. Both
 * are built here by the CLI's own scaffolder, exactly as an author starts one, published with
 * `build plugins` and `build marketplace`, and installed with `init --from` at each scope.
 *
 * Every skill in that installation is on a sub-agent at its own scope, and every command can find
 * both of them, so two things the CLI used to say there were false:
 *
 * - `init --from` in the project said the global installation's skill was assigned to no
 *   sub-agent, while the global `web-developer.md` loads it.
 * - every command that loads the project's marketplace said the slug was a duplicate and that it
 *   was "ignoring" the global skill, while `search` lists that skill and the global sub-agent
 *   still loads it.
 *
 * `doctor` in the project also counted the global installation's skill among those the project's
 * marketplace makes available: its `Marketplace Reachable` row counted the merged catalogue, which
 * holds the global installation's ejected skill from the other marketplace, while the
 * `Marketplaces` row in the same report counts what the marketplace ships. That test was observed
 * red against the build before its fix, with both of its subject guards green.
 *
 * Output is read through `flattenCliOutput`, because oclif wraps the unassigned warning across
 * lines and a negative assertion on the raw text cannot see a sentence the wrap has split. Each
 * negative stands beside a positive from the same run, so its silence is about a command that got
 * as far as the warning. The control at the bottom keeps the unassigned check honest: a skill the
 * project's configuration really hands to no sub-agent is still named.
 *
 * Observed red against the unfixed build: the unassigned test and all four duplicate-slug tests,
 * with the precondition, the generated files and the control green. Mutation-checked: silencing
 * the unassigned warning everywhere reddens the control alone. Deleting the duplicate-slug warning
 * outright is caught by `src/cli/lib/matrix/skill-resolution.test.ts`, which pins it for two skills
 * of ONE marketplace, so that control is not repeated here.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/**
 * The marketplace the global installation comes from, and the one the project comes from. Inside
 * {@link E2E_MARKETPLACE_PREFIX} for the reason the `new-marketplace` spec gives.
 */
const GLOBAL_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}acme`;
const PROJECT_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}plain`;

/**
 * The one skill each scaffold ships, in its own marketplace's namespace: two ids. Composed rather
 * than written out, so an id that stopped carrying its marketplace's name would not agree.
 */
const GLOBAL_SKILL = `${GLOBAL_MARKETPLACE}-example-skill`;
const PROJECT_SKILL = `${PROJECT_MARKETPLACE}-example-skill`;

/** The slug every scaffold gives its example skill. Not namespaced, so both skills carry it. */
const SHARED_SLUG = "example-skill";

/** The global installation: the first marketplace's skill on a sub-agent in `~/.claude`. */
const GLOBAL_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [GLOBAL_SKILL]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "global" } },
});

/**
 * The project installation: the second marketplace's skill on a sub-agent pinned to the project.
 * Nothing in it is global, which is what `init --from` requires over an existing global install.
 */
const PROJECT_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [PROJECT_SKILL]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [API_DEV]: "lazy" },
    }),
  },
  agents: { [API_DEV]: { scope: "project" } },
});

/** The same project installation with its skill handed to no sub-agent: what the warning is for. */
const UNASSIGNED_PROJECT_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [PROJECT_SKILL]: buildSeedSkill({ install: "eject", scope: "project", assignments: {} }),
  },
  agents: { [API_DEV]: { on: true, scope: "project" } },
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
      // Published with the two builds an author runs: a marketplace without a valid
      // `.claude-plugin/marketplace.json` is refused by every command that loads it.
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
        buildSkillConfigs([GLOBAL_SKILL], { scope: "global", origin: "eject" }),
      );
      expect(globalConfig.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "global" }));

      const projectConfig = await loadConfigOrFail(env.projectDir);
      expect(projectConfig.marketplace).toBe(projectMarketplaceDir);
      expect(
        projectConfig.skills,
        "the project config lists the global skill beside its own, which is the list the unassigned check reads",
      ).toStrictEqual([
        ...buildSkillConfigs([GLOBAL_SKILL], { scope: "global", origin: "eject" }),
        ...buildSkillConfigs([PROJECT_SKILL], { scope: "project", origin: "eject" }),
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
      // The subject guard: the row reached the project's own marketplace, so the count it prints
      // is a claim about what that marketplace ships.
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
      ).toContain(`Skill '${PROJECT_SKILL}' ${STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT}`);

      // What makes the warning true: the skill is installed, and the sub-agent switched on beside
      // it does not carry it.
      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([PROJECT_SKILL]);
      await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
        noSkillIds: [PROJECT_SKILL],
      });
    });
  });
});
