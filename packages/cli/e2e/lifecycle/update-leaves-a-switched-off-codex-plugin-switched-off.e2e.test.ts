import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import { switchOffCodexPlugin } from "../fixtures/codex-plugin-switch.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { offerANewVersionOf, serveOverGit } from "../fixtures/marketplace-moves-on.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupTempDir, readPluginVersions, readTreeSnapshot } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Codex has no update verb, so `update` adds each plugin again, and Codex switches a plugin back on
 * whenever it is added. A git marketplace is refreshed with `marketplace upgrade`, a local folder by
 * adding every plugin of it again, so the two reach that add by different routes.
 *
 * Mutation-checked through the fixture: switching the switched-on plugin off after the update, and
 * skipping the git serving, each reddened the assertion that names it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const SWITCHED_OFF_PLUGIN = E2E_SKILL.react.id;
const SWITCHED_ON_PLUGIN = E2E_SKILL.hono.id;
/** Added straight through Codex from the same marketplace; the project's config does not name it. */
const UNCONFIGURED_PLUGIN = E2E_SKILL.vitest.id;

const SEED_IDS = { git: "UpdOffGt", local: "UpdOffLc" } as const;

const INSTALLED_VERSION = "1.0.0";
const OFFERED_VERSION = "2.0.0";

type MarketplaceKind = keyof typeof SEED_IDS;

describe.each<MarketplaceKind>(["git", "local"])(
  "update over Codex plugins from a %s marketplace, one of them switched off by the user",
  (kind) => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment;

    let switchedOffKey: string;
    let switchedOnKey: string;
    let unconfiguredKey: string;
    let registered: CodexRun;
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
      switchedOffKey = pluginKeyFor(SWITCHED_OFF_PLUGIN, fixture.marketplaceName);
      switchedOnKey = pluginKeyFor(SWITCHED_ON_PLUGIN, fixture.marketplaceName);
      unconfiguredKey = pluginKeyFor(UNCONFIGURED_PLUGIN, fixture.marketplaceName);

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

      store.publish(
        SEED_IDS[kind],
        buildSeedPayload({
          skills: {
            [SWITCHED_OFF_PLUGIN]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [SWITCHED_ON_PLUGIN]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const installed = await runInitFromOnCodex(store, SEED_IDS[kind], project, fixture.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      registered = await runCodex(env.fakeHome, ["plugin", "marketplace", "list"], env.fakeHome);

      const addedByHand = await runCodex(
        env.fakeHome,
        ["plugin", "add", unconfiguredKey],
        env.fakeHome,
      );
      expect(addedByHand.exitCode, `plugin add failed: ${addedByHand.stderr}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      await switchOffCodexPlugin(env.fakeHome, switchedOffKey);
      await switchOffCodexPlugin(env.fakeHome, unconfiguredKey);
      listedBefore = await runCodex(env.fakeHome, ["plugin", "list"], env.fakeHome);

      await offerANewVersionOf(fixture, [
        SWITCHED_OFF_PLUGIN,
        SWITCHED_ON_PLUGIN,
        UNCONFIGURED_PLUGIN,
      ]);
      if (gitMarketplace !== null) await gitMarketplace.publish();
      offeredVersions = await readPluginVersions(fixture.pluginsDir, [
        SWITCHED_OFF_PLUGIN,
        SWITCHED_ON_PLUGIN,
        UNCONFIGURED_PLUGIN,
      ]);

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

    it(`reaches Codex as a ${kind} marketplace offering a newer version than the one installed`, () => {
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
        [SWITCHED_OFF_PLUGIN]: OFFERED_VERSION,
        [SWITCHED_ON_PLUGIN]: OFFERED_VERSION,
        [UNCONFIGURED_PLUGIN]: OFFERED_VERSION,
      });
    });

    it("moves the plugin the user switched off to the offered version and leaves it switched off", () => {
      expect(listedBefore.exitCode, listedBefore.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedBefore.json,
        "the plugin must be switched off before the update, or nothing was at risk",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: switchedOffKey,
              version: INSTALLED_VERSION,
              enabled: false,
            }),
          ]),
        },
      ]);

      expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedAfter.json,
        "the user switched this plugin off; updating it must not switch it back on",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: switchedOffKey,
              version: OFFERED_VERSION,
              enabled: false,
            }),
          ]),
        },
      ]);
    });

    it("moves the plugin left switched on to the offered version and leaves it switched on", () => {
      expect(listedBefore.json).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: switchedOnKey,
              version: INSTALLED_VERSION,
              enabled: true,
            }),
          ]),
        },
      ]);

      expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        listedAfter.json,
        "only the plugin the user switched off stays off; switching every updated plugin off is not the fix",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: switchedOnKey,
              version: OFFERED_VERSION,
              enabled: true,
            }),
          ]),
        },
      ]);
    });

    it("leaves a switched-off plugin of the same marketplace that the config does not name switched off", () => {
      expect(
        listedBefore.json,
        "the plugin must be switched off before the update, or nothing was at risk",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({
              pluginId: unconfiguredKey,
              version: INSTALLED_VERSION,
              enabled: false,
            }),
          ]),
        },
      ]);

      expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
      // Its version is not asserted: whether update moves a plugin its config does not name is not this spec's question.
      expect(
        listedAfter.json,
        "a refresh that adds every plugin of the marketplace again reaches this one too, and must not switch it back on",
      ).toMatchObject([
        {
          installed: expect.arrayContaining([
            expect.objectContaining({ pluginId: unconfiguredKey, enabled: false }),
          ]),
        },
      ]);
    });

    it("says it updated both plugins, and leaves everything in the project byte-identical", () => {
      expect(updateRun.output).toContain(
        `${STEP_TEXT.UPDATE_MARKETPLACE_REFRESHED} ${fixture.marketplaceName}`,
      );
      expect(updateRun.output).toContain(`Updated plugin ${switchedOffKey}`);
      expect(updateRun.output).toContain(`Updated plugin ${switchedOnKey}`);

      expect(Object.keys(projectBefore)).toContain(path.join(DIRS.SOURCE_CODEX, FILES.CONFIG_TS));
      expect(projectAfter).toStrictEqual(projectBefore);
    });
  },
);
