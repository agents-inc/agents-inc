import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { pluginKeyFor, readPluginRegistrations } from "../fixtures/plugin-install-state.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  SCAFFOLDED_SKILL_DISPLAY_NAME,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * A global installation made from one marketplace, and a project made from another: a skill id
 * belongs to the marketplace its name begins with, so the project shows the global installation's
 * skills from the marketplace they came from. `edit --from` in the project takes one of them into
 * the project and sends the project's own skill out to the global installation. The user docs say
 * a skill whose `origin` names a marketplace "is installed as a Claude Code plugin under that
 * marketplace name" (configuration/config-reference.md), so each lands at its new scope under the
 * marketplace its entry names, and the global plugin stays for the other projects.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const PROJECT_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}team`;
const PROJECT_SKILL = `${PROJECT_MARKETPLACE}-example-skill`;
const TAKEN_IN = E2E_SKILL.react;

const HOME_INSTALL_ID = "HomeReac";
const PROJECT_INSTALL_ID = "TeamProj";
const PROJECT_MOVES_ID = "TeamMove";

const onApiDeveloper = (scope: "global" | "project") =>
  buildSeedSkill({ install: "plugin", scope, assignments: { [API_DEV]: "lazy" } });

const HOME_INSTALL = buildSeedPayload({
  skills: {
    [TAKEN_IN.id]: buildSeedSkill({
      install: "plugin",
      scope: "global",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "global" } },
});

const PROJECT_INSTALL = buildSeedPayload({
  skills: { [PROJECT_SKILL]: onApiDeveloper("project") },
  agents: { [API_DEV]: { scope: "project" } },
});

const PROJECT_MOVES = buildSeedPayload({
  skills: {
    [TAKEN_IN.id]: onApiDeveloper("project"),
    [PROJECT_SKILL]: onApiDeveloper("global"),
  },
  agents: { [API_DEV]: { scope: "project" } },
});

describe.skipIf(!claudeAvailable)(
  "edit --from in a project made from another marketplace than its global installation",
  () => {
    let homeMarketplace: E2EPluginSource;
    let marketplacesDir: string;
    let projectMarketplaceDir: string;
    let store: SeedConfigStore;
    let env: TestEnvironment;

    const takenInKey = () => pluginKeyFor(TAKEN_IN.id, homeMarketplace.marketplaceName);
    const projectSkillKey = pluginKeyFor(PROJECT_SKILL, PROJECT_MARKETPLACE);
    const scopesRegistered = async (pluginKey: string) =>
      (await readPluginRegistrations(env.fakeHome, pluginKey)).map(({ scope }) => scope).sort();

    async function applyFrom(id: string): Promise<{ exitCode: number; rawOutput: string }> {
      const prompt = new InteractivePrompt(["edit", "--from", id], env.projectDir, {
        ...TERMINAL_SIZE.TALL,
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        const exitCode = await prompt.waitForExit(TIMEOUTS.PLUGIN_INSTALL);
        return { exitCode, rawOutput: prompt.getRawOutput() };
      } finally {
        await prompt.destroy();
      }
    }

    beforeAll(async () => {
      homeMarketplace = await createE2EPluginSource();
      marketplacesDir = await createTempDir();
      projectMarketplaceDir = path.join(marketplacesDir, PROJECT_MARKETPLACE);

      const scaffold = await CLI.run(["new", "marketplace", PROJECT_MARKETPLACE], {
        dir: marketplacesDir,
      });
      expect(scaffold.exitCode, scaffold.output).toBe(EXIT_CODES.SUCCESS);
      for (const build of [
        ["build", "plugins"],
        ["build", "marketplace"],
      ]) {
        const built = await CLI.run(build, { dir: projectMarketplaceDir });
        expect(built.exitCode, built.output).toBe(EXIT_CODES.SUCCESS);
      }

      store = await startSeedConfigStore();
      store.publish(HOME_INSTALL_ID, HOME_INSTALL);
      store.publish(PROJECT_INSTALL_ID, PROJECT_INSTALL);
      store.publish(PROJECT_MOVES_ID, PROJECT_MOVES);
    }, TIMEOUTS.SETUP);

    beforeAll(async () => {
      env = await createTestEnvironment({ permissions: false });

      const homeInstall = await runInitFrom(
        store,
        HOME_INSTALL_ID,
        { dir: env.fakeHome },
        homeMarketplace.sourceDir,
      );
      expect(homeInstall.exitCode, homeInstall.output).toBe(EXIT_CODES.SUCCESS);
      const projectInstall = await runInitFrom(
        store,
        PROJECT_INSTALL_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        projectMarketplaceDir,
      );
      expect(projectInstall.exitCode, projectInstall.output).toBe(EXIT_CODES.SUCCESS);

      expect(await scopesRegistered(takenInKey())).toStrictEqual(["user"]);
      expect(await scopesRegistered(projectSkillKey)).toStrictEqual(["project"]);
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(marketplacesDir);
      await cleanupTempDir(env.tempDir);
    });

    describe("taking a global plugin into the project, and sending the project's own out", () => {
      let applied: { exitCode: number; rawOutput: string };

      beforeAll(async () => {
        applied = await applyFrom(PROJECT_MOVES_ID);
      }, TIMEOUTS.EXTENDED_LIFECYCLE);

      it("finishes without a failure", () => {
        expect(applied.exitCode, applied.rawOutput).toBe(EXIT_CODES.SUCCESS);
      });

      it("records each move under the marketplace its skill came from", async () => {
        const skills = (await loadConfigOrFail(env.projectDir)).skills;

        expect(skills.filter(({ scope }) => scope === "project").map(({ id }) => id)).toStrictEqual(
          [TAKEN_IN.id],
        );
        expect(skills).toContainEqual(
          buildSkillConfig(TAKEN_IN.id, {
            scope: "project",
            origin: homeMarketplace.marketplaceName,
            displayName: TAKEN_IN.display,
          }),
        );
        expect(skills).toContainEqual(
          buildSkillConfig(PROJECT_SKILL, {
            scope: "global",
            origin: PROJECT_MARKETPLACE,
            displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
          }),
        );
      });

      it("installs the skill it took in from the marketplace it came from, keeping the global plugin", async () => {
        expect(await scopesRegistered(takenInKey())).toStrictEqual(["project", "user"]);
        await expect({ dir: env.projectDir }).toHavePlugin(takenInKey());
        await expect({ dir: env.fakeHome }).toHavePlugin(takenInKey());
      });

      it("moves the project's own plugin out to the global installation", async () => {
        expect(await scopesRegistered(projectSkillKey)).toStrictEqual(["user"]);
        await expect({ dir: env.fakeHome }).toHavePlugin(projectSkillKey);
      });
    });
  },
);
