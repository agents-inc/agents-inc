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
 * Regression coverage for the silent plugin-install skip that caused an edit adding a plugin
 * skill to update config.ts but NEVER invoke `claude plugin install`, leaving
 * `.claude/settings.json#enabledPlugins` out of sync with the project config. They assert the
 * full chain: edit adds -> applyPluginChanges -> claudePluginInstall -> settings.json updated.
 * Verifying both config.ts AND settings.json enabledPlugins is the only way to detect the
 * original regression; the pre-fix code silently skipped the install.
 *
 * The fix is written up in changelogs/0.133.0.md under the `cc edit` silent-skip entry —
 * a release note records what a version closed and is not rewritten afterwards, so it keeps
 * resolving where a finding file may not.
 *
 * User memory: feedback_no_plugin_to_eject_fallback.md
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The project's React plus Pinia, both as plugins: applying it adds Pinia. */
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

    /**
     * The precise regression reproduction: project config.ts has plugin-sourced
     * skills but LACKS the `marketplaceName` field. This is the legacy-install state
     * that made `sourceResult.marketplace` undefined, triggering the silent skip.
     *
     * After the fix, `requireMarketplace` lazily resolves the marketplace via
     * `ensureMarketplace` (reading the source's marketplace.json) and plugin
     * install proceeds. This test exists so that removing the lazy resolution
     * (or reintroducing the silent gate) immediately breaks CI.
     */
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

        // The added plugin must be installed into settings.json even though
        // the original config had no marketplace name.
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
