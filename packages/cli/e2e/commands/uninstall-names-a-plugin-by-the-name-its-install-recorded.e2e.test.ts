import { rename } from "fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
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
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, REMOVED_MARKER, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A plugin records no name on disk, and its marketplace folder is moved away before the run, so
 * the only thing left that names it is the name its install recorded on its config.ts entry. The
 * fixture's namespaced id is in no catalogue the CLI ships, so a row read from anywhere else is
 * the id. The whole-panel lines are this run at the 80 columns a pipe measures, and end on the line
 * after the panel. The marketplace is a private copy built per test, so a retry finds it in place.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const PLUGIN_RECORDED_ID = "PluginRecorded1";

describe.skipIf(!claudeAvailable)(
  "uninstall --yes names a plugin whose marketplace has gone by the name its install recorded",
  () => {
    let store: SeedConfigStore;
    let fixture: E2EPluginSource;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      store = await startSeedConfigStore();
      store.publish(
        PLUGIN_RECORDED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "global",
              assignments: { [WEB_DEV]: "preloaded" },
            }),
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
        }),
      );
    });

    beforeEach(async () => {
      fixture = await createE2EPluginSource({ owned: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
    });

    afterEach(async () => {
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
      await cleanupFixture(fixture);
    });

    it(
      "names the plugin it removes by the name its install recorded, beside the global copy it keeps",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        const installed = await runInitFrom(store, PLUGIN_RECORDED_ID, project, fixture.sourceDir);
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.projectDir }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
        );
        const globalCopiesBefore = await readTreeSnapshot(skillsPath(env.fakeHome));
        const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

        await rename(fixture.sourceDir, `${fixture.sourceDir}-moved`);
        expect(
          await directoryExists(fixture.sourceDir),
          "the marketplace folder must be gone, or the run could still read the plugin's name from it",
        ).toBe(false);

        const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

        expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.projectDir }).toHaveNoPlugins();
        await expectCleanUninstall(env.projectDir, { removeConfig: true });
        expect(
          await readTreeSnapshot(skillsPath(env.fakeHome)),
          "a project uninstall keeps every global copy byte for byte",
        ).toStrictEqual(globalCopiesBefore);
        expect(
          await loadConfigOrFail(env.fakeHome),
          "a project uninstall deregisters the project and changes nothing else in the global config",
        ).toStrictEqual({ ...globalConfigBefore, projects: [] });
        expect(
          stdout,
          "the plugin it removes is named as its install recorded, with its marketplace gone",
        ).toContain(
          [
            "│  Skills                                         │  Agents                    │",
            "│                                                 │                            │",
            "│   Project                                       │   Project                  │",
            "│  - E2E Hono                                     │  - api-developer           │",
            "│                                                 │                            │",
            "│   Global                                        │   Global                   │",
            "│  • E2E React ⏏                                  │  • web-developer           │",
            "└──────────────────────────────────────────────────────────────────────────────┘",
            `${REMOVED_MARKER} ${configTsPath(env.projectDir)}`,
            "",
          ].join("\n"),
        );
      },
    );
  },
);
