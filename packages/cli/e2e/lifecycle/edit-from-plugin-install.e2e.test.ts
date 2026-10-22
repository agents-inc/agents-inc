import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { applyFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { cleanupFixture, cleanupTempDir, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * An edit adding a plugin skill must run `claude plugin install`, so `.claude/settings.json`
 * `enabledPlugins` matches config.ts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;

const WITH_PINIA = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "plugin",
      scope: "project",
      assignments: { [WEB_DEV]: "preloaded" },
    }),
    [E2E_SKILL.pinia.id]: buildSeedSkill({
      install: "plugin",
      scope: "project",
      assignments: { [WEB_DEV]: "lazy" },
    }),
  },
  agents: { [WEB_DEV]: { scope: "project" } },
});

describe.skipIf(!claudeAvailable)(
  "edit --from -> add plugin skill: plugin install must run",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let tempDir: string | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      store.reset();
      if (tempDir) await cleanupTempDir(tempDir);
      tempDir = undefined;
    });

    it(
      "should install the newly added plugin and update project settings.json",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          marketplace: fixture.sourceDir,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        const { output } = await applyFromSeed(store, "AddPinia1", WITH_PINIA, {
          dir: project.dir,
          home: tempDir,
        });

        const addedPluginKey = `${E2E_SKILL.pinia.id}@${fixture.marketplaceName}`;

        await expect(project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
          origin: fixture.marketplaceName,
        });

        await expect(project).toHavePlugin(addedPluginKey);
        expect(output).toContain("Installed");
        expect(output).not.toContain("Failed to install plugin");
      },
    );

    /** Plugin skills but no `marketplaceName` still install: the marketplace resolves lazily. */
    it(
      "should lazily resolve marketplace and install the newly added plugin",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          marketplace: fixture.sourceDir,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
          omitMarketplaceField: true,
        });
        tempDir = path.dirname(project.dir);

        const { output } = await applyFromSeed(store, "AddPinia2", WITH_PINIA, {
          dir: project.dir,
          home: tempDir,
        });

        const addedPluginKey = `${E2E_SKILL.pinia.id}@${fixture.marketplaceName}`;

        await expect(project).toHavePlugin(addedPluginKey);

        await expect(project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
        });

        expect(output).toContain("Installed");
        expect(output).not.toContain("Failed to install plugin");
      },
    );
  },
);
