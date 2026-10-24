import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  EXIT_CODES,
  LOCAL_COPY_MARK,
  REMOVED_MARKER,
  TIMEOUTS,
  UNCHANGED_MARKER,
  panelRow,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `uninstall --yes` prints its panel, so the header reaches what a pipe reads. The header names the
 * marketplace of what the run removes. The first two runs keep the same global copy, so only what
 * they remove from the project — a plugin, or a copy — tells their headers apart. Header lines are
 * this run at the 80 columns a pipe measures, and end on the Stack row under the Marketplace row.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const KEPT_COPY_REMOVED_PLUGIN_ID = "KeptCopyRmPlugin1";
const KEPT_COPY_REMOVED_COPY_ID = "KeptCopyRmCopy1";
const KEPT_NOTHING_REMOVED_PLUGINS_ID = "KeptNoneRmPlugins1";

/** The global copy the first two keep, on a global sub-agent. */
const KEPT_GLOBAL_REACT = buildSeedSkill({
  scope: "global",
  assignments: { [WEB_DEV]: "preloaded" },
});

describe("uninstall --yes names no marketplace when it removes only a copy and keeps only a copy", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      KEPT_COPY_REMOVED_COPY_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: KEPT_GLOBAL_REACT,
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "says every skill is ejected above the copy it removes and the global copy it keeps",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      const installed = await runInitFrom(
        store,
        KEPT_COPY_REMOVED_COPY_ID,
        project,
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      const globalCopiesBefore = await readTreeSnapshot(skillsPath(env.fakeHome));
      const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

      const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the panel removes the project copy").toContain(
        panelRow(REMOVED_MARKER, `${E2E_SKILL.hono.display} ${LOCAL_COPY_MARK}`),
      );
      expect(stdout, "the panel keeps the global copy").toContain(
        panelRow(UNCHANGED_MARKER, `${E2E_SKILL.react.display} ${LOCAL_COPY_MARK}`),
      );
      expect(
        stdout,
        "with only copies removed and only copies kept, no skill in the panel names a marketplace",
      ).toContain(
        [
          "┌──────────────────────────────────────────────────────────────────────────────┐",
          "│  Marketplace All skills ejected                                              │",
          "│  Stack none                                                                  │",
        ].join("\n"),
      );
      await expectCleanUninstall(env.projectDir, { removeConfig: true });
      expect(
        await readTreeSnapshot(skillsPath(env.fakeHome)),
        "a project uninstall keeps every global copy byte for byte",
      ).toStrictEqual(globalCopiesBefore);
      expect(
        await loadConfigOrFail(env.fakeHome),
        "a project uninstall deregisters the project and changes nothing else in the global config",
      ).toStrictEqual({ ...globalConfigBefore, projects: [] });
    },
  );
});

/** Plugin mode needs the real Claude binary and the built plugin marketplace. */
describe.skipIf(!claudeAvailable)(
  "uninstall --yes names the marketplace of the plugins it removes",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();
      store.publish(
        KEPT_COPY_REMOVED_PLUGIN_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: KEPT_GLOBAL_REACT,
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
        }),
      );
      store.publish(
        KEPT_NOTHING_REMOVED_PLUGINS_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "preloaded" },
            }),
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "project" } },
        }),
      );
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    it(
      "names the marketplace of the plugin it removes, not every skill as ejected, when the skill it keeps is a copy",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        const installed = await runInitFrom(
          store,
          KEPT_COPY_REMOVED_PLUGIN_ID,
          project,
          fixture.sourceDir,
        );
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.projectDir }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
        );
        const globalCopiesBefore = await readTreeSnapshot(skillsPath(env.fakeHome));
        const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

        const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

        expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
        expect(stdout, "the panel removes the plugin").toContain(
          panelRow(REMOVED_MARKER, E2E_SKILL.hono.display),
        );
        expect(stdout, "the panel keeps the global copy").toContain(
          panelRow(UNCHANGED_MARKER, `${E2E_SKILL.react.display} ${LOCAL_COPY_MARK}`),
        );
        expect(
          stdout,
          "the header names the marketplace of the plugin the run removes, not the copy it keeps",
        ).toContain(
          [
            "┌──────────────────────────────────────────────────────────────────────────────┐",
            "│  Marketplace e2e-test-fixture                                                │",
            "│  Stack none                                                                  │",
          ].join("\n"),
        );
        expect(
          stdout,
          "with a plugin among the removals, the header does not say every skill is ejected",
        ).not.toContain("All skills ejected");
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
      },
    );

    it(
      "names the marketplace of the plugins it removes when it keeps nothing",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        const installed = await runInitFrom(
          store,
          KEPT_NOTHING_REMOVED_PLUGINS_ID,
          project,
          fixture.sourceDir,
        );
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.projectDir }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName),
        );
        await expect({ dir: env.projectDir }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
        );

        const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

        expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
        expect(stdout, "the panel removes both plugins").toContain(
          panelRow(REMOVED_MARKER, E2E_SKILL.react.display),
        );
        expect(stdout, "the panel removes both plugins").toContain(
          panelRow(REMOVED_MARKER, E2E_SKILL.hono.display),
        );
        expect(
          stdout,
          "keeping nothing, the header names the marketplace of the plugins the run removes",
        ).toContain(
          [
            "┌──────────────────────────────────────────────────────────────────────────────┐",
            "│  Marketplace e2e-test-fixture                                                │",
            "│  Stack none                                                                  │",
          ].join("\n"),
        );
        await expect({ dir: env.projectDir }).toHaveNoPlugins();
        await expectCleanUninstall(env.projectDir, { removeConfig: true });
      },
    );
  },
);
