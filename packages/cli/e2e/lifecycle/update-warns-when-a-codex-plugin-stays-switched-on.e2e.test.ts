import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import {
  codexConfigFile,
  switchOffCodexPlugin,
  switchOffCodexPluginInSingleQuotes,
} from "../fixtures/codex-plugin-switch.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { offerANewVersionOf, serveOverGit } from "../fixtures/marketplace-moves-on.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  flattenCliOutput,
  readPluginVersions,
  readTestFile,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A switch spelled `[plugins.'<key>']` is the "worded differently" case: Codex keeps that spelling
 * when `plugin add` switches the plugin back on, so the line update has to change is not there.
 * The other failure, a config.toml that cannot be written, is pinned in the unit suite: Codex
 * replaces the file (mode 600) on every add, so the real binary cannot stage it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const UNSWITCHABLE_PLUGIN = E2E_SKILL.react.id;
const SWITCHED_OFF_PLUGIN = E2E_SKILL.vitest.id;
const SWITCHED_ON_PLUGIN = E2E_SKILL.hono.id;

const SEED_IDS = { git: "UpdWrnGt", local: "UpdWrnLc" } as const;

const INSTALLED_VERSION = "1.0.0";
const OFFERED_VERSION = "2.0.0";

type MarketplaceKind = keyof typeof SEED_IDS;

describe.each<MarketplaceKind>(["git", "local"])(
  "update over Codex plugins from a %s marketplace, one switched off under a table spelled in single quotes",
  (kind) => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment;

    let unswitchableKey: string;
    let switchedOffKey: string;
    let switchedOnKey: string;
    let registered: CodexRun;
    let configBefore: string;
    let listedBefore: CodexRun;
    let listedAfter: CodexRun;
    let offeredVersions: Record<string, string | undefined>;
    let updateRun: CLIResult;
    let projectBefore: Awaited<ReturnType<typeof readTreeSnapshot>>;
    let projectAfter: Awaited<ReturnType<typeof readTreeSnapshot>>;

    beforeAll(async () => {
      fixture = await createE2EPluginSource({ owned: true });
      store = await startSeedConfigStore();
      env = await createTestEnvironment({ permissions: false });
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      unswitchableKey = pluginKeyFor(UNSWITCHABLE_PLUGIN, fixture.marketplaceName);
      switchedOffKey = pluginKeyFor(SWITCHED_OFF_PLUGIN, fixture.marketplaceName);
      switchedOnKey = pluginKeyFor(SWITCHED_ON_PLUGIN, fixture.marketplaceName);

      // Registered before the install, which then uses the marketplace Codex already holds.
      const gitMarketplace = kind === "git" ? await serveOverGit(fixture, env.fakeHome) : null;
      if (gitMarketplace !== null) {
        const added = await runCodex(
          env.fakeHome,
          ["plugin", "marketplace", "add", gitMarketplace.url],
          env.fakeHome,
        );
        expect(added.exitCode, `marketplace add failed: ${added.stderr}`).toBe(EXIT_CODES.SUCCESS);
      }

      const pluginSkill = () =>
        buildSeedSkill({ install: "plugin", scope: "global", assignments: { [WEB_DEV]: "lazy" } });
      store.publish(
        SEED_IDS[kind],
        buildSeedPayload({
          skills: {
            [UNSWITCHABLE_PLUGIN]: pluginSkill(),
            [SWITCHED_OFF_PLUGIN]: pluginSkill(),
            [SWITCHED_ON_PLUGIN]: pluginSkill(),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const installed = await runInitFromOnCodex(store, SEED_IDS[kind], project, fixture.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      registered = await runCodex(env.fakeHome, ["plugin", "marketplace", "list"], env.fakeHome);

      await switchOffCodexPluginInSingleQuotes(env.fakeHome, unswitchableKey);
      await switchOffCodexPlugin(env.fakeHome, switchedOffKey);
      configBefore = await readTestFile(codexConfigFile(env.fakeHome));
      listedBefore = await runCodex(env.fakeHome, ["plugin", "list"], env.fakeHome);

      const everyPlugin = [UNSWITCHABLE_PLUGIN, SWITCHED_OFF_PLUGIN, SWITCHED_ON_PLUGIN];
      await offerANewVersionOf(fixture, everyPlugin);
      if (gitMarketplace !== null) await gitMarketplace.publish();
      offeredVersions = await readPluginVersions(fixture.pluginsDir, everyPlugin);

      projectBefore = await readTreeSnapshot(env.projectDir);
      updateRun = await CLI.run(["update"], project);
      projectAfter = await readTreeSnapshot(env.projectDir);
      listedAfter = await runCodex(env.fakeHome, ["plugin", "list"], env.fakeHome);
    }, TIMEOUTS.LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(fixture.tempDir);
      await cleanupTempDir(env.tempDir);
    });

    it(`reaches Codex as a ${kind} marketplace offering a newer version, with two plugins switched off`, () => {
      expect(registered.exitCode, registered.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        registered.json,
        "a git marketplace that fell back to the folder would be refreshed the local way, and this block would test the other route",
      ).toMatchObject([
        {
          marketplaces: [
            { name: fixture.marketplaceName, marketplaceSource: { sourceType: kind } },
          ],
        },
      ]);
      expect(offeredVersions).toStrictEqual({
        [UNSWITCHABLE_PLUGIN]: OFFERED_VERSION,
        [SWITCHED_OFF_PLUGIN]: OFFERED_VERSION,
        [SWITCHED_ON_PLUGIN]: OFFERED_VERSION,
      });

      expect(
        configBefore,
        "the switch must be spelled in single quotes, or the line update looks for is there and nothing can fail",
      ).toContain(`[plugins.'${unswitchableKey}']\nenabled = false`);
      expect(listedBefore.exitCode, listedBefore.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedBefore.json,
        "Codex must read both spellings as switched off, or nothing was at risk",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: unswitchableKey,
              version: INSTALLED_VERSION,
              enabled: false,
            }),
            expect.objectContaining({
              pluginId: switchedOffKey,
              version: INSTALLED_VERSION,
              enabled: false,
            }),
            expect.objectContaining({
              pluginId: switchedOnKey,
              version: INSTALLED_VERSION,
              enabled: true,
            }),
          ]),
        },
      ]);
    });

    it("exits with an error, so a script running it sees a plugin was left switched on", () => {
      expect(
        updateRun.exitCode,
        `a plugin the user switched off is running again; update must not report success: ${updateRun.output}`,
      ).toBe(EXIT_CODES.ERROR);
    });

    it("warns naming the plugin it could not switch off, and the line to set in Codex's config.toml", () => {
      const warnings = flattenCliOutput(updateRun.stderr);

      expect(warnings, "the warning names the plugin that is now switched on").toContain(
        unswitchableKey,
      );
      expect(warnings, "the warning names the line to set by hand").toContain("enabled = false");
      expect(warnings, "the warning names the file that line goes in").toContain("config.toml");
      expect(
        warnings,
        "the plugin whose switch update restored has nothing to warn about",
      ).not.toContain(switchedOffKey);
      expect(warnings, "a plugin left switched on was never at risk").not.toContain(switchedOnKey);
    });

    it("still updates the other plugins, the one switched off staying off and the one switched on staying on", () => {
      expect(updateRun.stdout).toContain(`Updated plugin ${switchedOffKey}`);
      expect(updateRun.stdout).toContain(`Updated plugin ${switchedOnKey}`);

      expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedAfter.json,
        "one plugin whose switch could not be restored must not cost the others theirs",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: switchedOffKey,
              version: OFFERED_VERSION,
              enabled: false,
            }),
            expect.objectContaining({
              pluginId: switchedOnKey,
              version: OFFERED_VERSION,
              enabled: true,
            }),
          ]),
        },
      ]);
    });

    it("moves the plugin it could not switch off to the offered version, in a config Codex still reads", () => {
      expect(
        listedAfter.exitCode,
        `a second table for the same plugin makes Codex refuse the whole file: ${listedAfter.stderr}`,
      ).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedAfter.json,
        "the warning says this plugin is switched on at the new version; the listing must agree",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: unswitchableKey,
              version: OFFERED_VERSION,
              enabled: true,
            }),
          ]),
        },
      ]);
    });

    it("leaves everything in the project byte-identical", () => {
      expect(Object.keys(projectBefore)).toContain(path.join(DIRS.SOURCE_CODEX, FILES.CONFIG_TS));
      expect(projectAfter).toStrictEqual(projectBefore);
    });
  },
);
