import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
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
 * CLI-979. A global installation made from one marketplace, and a project, made from another, that
 * leaves a plugin at global scope: a project install "only adds to the global one"
 * (guides/global-first-setup.md), so the plugin is installed under the project's marketplace and
 * the global config records it with that `origin` beside its own `marketplaceName`. The user docs
 * say such an entry "is installed as a Claude Code plugin under that marketplace name"
 * (configuration/config-reference.md). `edit --from` at home then applies a configuration that
 * leaves out that plugin and one of its own marketplace's. Measured against the built CLI and the
 * real `claude`: both entries leave the config, the home marketplace's plugin is uninstalled, and
 * the other stays registered and enabled, because the removal is addressed to
 * `<id>@<marketplaceName>` and the host answers that it holds no such plugin.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const PROJECT_MARKETPLACE = `${E2E_MARKETPLACE_PREFIX}team`;
const PROJECT_SKILL = `${PROJECT_MARKETPLACE}-example-skill`;

const HOME_INSTALL_ID = "HomeBoth";
const PROJECT_INSTALL_ID = "TeamGlob";
const HOME_KEEPS_ONE_ID = "HomeKeep";

const atGlobal = (agent: string) =>
  buildSeedSkill({ install: "plugin", scope: "global", assignments: { [agent]: "lazy" } });

const HOME_INSTALL = buildSeedPayload({
  skills: { [E2E_SKILL.react.id]: atGlobal(WEB_DEV), [E2E_SKILL.vitest.id]: atGlobal(WEB_DEV) },
  agents: { [WEB_DEV]: { scope: "global" } },
});

/** Left at global, as a skill the editor's grid was not moved to `project` for. */
const PROJECT_INSTALL = buildSeedPayload({
  skills: { [PROJECT_SKILL]: atGlobal(API_DEV) },
  agents: { [API_DEV]: { scope: "global" } },
});

const HOME_KEEPS_ONE = buildSeedPayload({
  skills: { [E2E_SKILL.react.id]: atGlobal(WEB_DEV) },
  agents: { [WEB_DEV]: { scope: "global" } },
});

describe.skipIf(!claudeAvailable)(
  "edit --from at home, over a global plugin a project installed from its own marketplace",
  () => {
    let homeMarketplace: E2EPluginSource;
    let marketplacesDir: string;
    let projectMarketplaceDir: string;
    let store: SeedConfigStore;
    let env: TestEnvironment;
    let applied: { exitCode: number; rawOutput: string };

    /** Entries as an install from the home marketplace records them. */
    const homeMarketplacePlugins = (skills: { id: string; display: string }[]) =>
      skills.map(({ id, display }) =>
        buildSkillConfig(id, {
          scope: "global",
          origin: homeMarketplace.marketplaceName,
          displayName: display,
        }),
      );

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
      store.publish(HOME_KEEPS_ONE_ID, HOME_KEEPS_ONE);
    }, TIMEOUTS.SETUP);

    beforeAll(async () => {
      env = await createTestEnvironment({ permissions: false });
      const home = { dir: env.fakeHome };
      const project = { dir: env.projectDir, globalHome: env.fakeHome };

      const homeInstall = await runInitFrom(
        store,
        HOME_INSTALL_ID,
        home,
        homeMarketplace.sourceDir,
      );
      expect(homeInstall.exitCode, homeInstall.output).toBe(EXIT_CODES.SUCCESS);
      const projectInstall = await runInitFrom(
        store,
        PROJECT_INSTALL_ID,
        project,
        projectMarketplaceDir,
      );
      expect(projectInstall.exitCode, projectInstall.output).toBe(EXIT_CODES.SUCCESS);

      const globalConfig = await loadConfigOrFail(env.fakeHome);
      expect(
        globalConfig.marketplaceName,
        "the project's install must keep the global config's own marketplace",
      ).toBe(homeMarketplace.marketplaceName);
      expect(
        globalConfig.skills,
        "the plugin the project left at global must be recorded under the project's marketplace",
      ).toStrictEqual([
        ...homeMarketplacePlugins([E2E_SKILL.react, E2E_SKILL.vitest]),
        buildSkillConfig(PROJECT_SKILL, {
          scope: "global",
          origin: PROJECT_MARKETPLACE,
          displayName: SCAFFOLDED_SKILL_DISPLAY_NAME,
        }),
      ]);
      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(
        pluginKeyFor(PROJECT_SKILL, PROJECT_MARKETPLACE),
      );
      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(
        pluginKeyFor(E2E_SKILL.vitest.id, homeMarketplace.marketplaceName),
      );

      const prompt = new InteractivePrompt(["edit", "--from", HOME_KEEPS_ONE_ID], env.fakeHome, {
        ...TERMINAL_SIZE.TALL,
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        const exitCode = await prompt.waitForExit(TIMEOUTS.PLUGIN_INSTALL);
        applied = { exitCode, rawOutput: prompt.getRawOutput() };
      } finally {
        await prompt.destroy();
      }
      expect(applied.exitCode, applied.rawOutput).toBe(EXIT_CODES.SUCCESS);
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(marketplacesDir);
      await cleanupTempDir(env.tempDir);
    });

    it("drops both from the global config, keeping the one the configuration names", async () => {
      const globalConfig = await loadConfigOrFail(env.fakeHome);

      expect(globalConfig.skills).toStrictEqual(homeMarketplacePlugins([E2E_SKILL.react]));
    });

    it("uninstalls the plugin its own marketplace installed", async () => {
      const vitestRef = pluginKeyFor(E2E_SKILL.vitest.id, homeMarketplace.marketplaceName);

      await expect({ dir: env.fakeHome }).not.toHavePluginInRegistry(vitestRef);
      await expect({ dir: env.fakeHome }).not.toHavePlugin(vitestRef);
      await expect({ dir: env.fakeHome }).toHavePluginInRegistry(
        pluginKeyFor(E2E_SKILL.react.id, homeMarketplace.marketplaceName),
      );
    });

    // KNOWN GAP: the removal asks the host for `<id>@<marketplaceName>`, which holds nothing, so the
    // plugin installed as `<id>@<origin>` stays registered and enabled for every project.
    it.fails(
      "uninstalls the plugin the project installed from its own marketplace",
      { retry: 0 },
      async () => {
        const projectPluginRef = pluginKeyFor(PROJECT_SKILL, PROJECT_MARKETPLACE);

        await expect({ dir: env.fakeHome }).not.toHavePluginInRegistry(projectPluginRef);
        await expect({ dir: env.fakeHome }).not.toHavePlugin(projectPluginRef);
      },
    );
  },
);
