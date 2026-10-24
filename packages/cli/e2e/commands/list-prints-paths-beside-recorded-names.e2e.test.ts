import path from "path";
import { rename } from "fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
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
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  isClaudeCLIAvailable,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Over a pipe `list` names each skill as its install recorded it, one line under the `Skills:`
 * count with its scope (CLI-978, owner 2026-10-24: "Yes: list them by display name in plain text"),
 * though no catalogue the CLI ships lists the fixture's namespaced ids; and every path line stays a
 * file or folder a user can open — the filesystem-block rule in packages/cli/CLAUDE.md. Its
 * installations are the ones `interactive/list-names-skills-by-display-name` draws at a terminal,
 * where the panel shows the same rows. The output is held whole (the runner drops its final
 * newline), so a line printed anywhere in it fails. The path lines were checked by removing the
 * global sub-agent's file before the run, which reddened it on the `Agents:` lines alone.
 *
 * A plugin leaves no copy, and its marketplace folder is moved away before the run, so the name its
 * install recorded is the only thing left that names it.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const BOTH_SCOPES_ID = "ListPath1";
const PLUGINS_ID = "ListPathPlugins1";

describe("list over a pipe beside skills whose install records their names", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      BOTH_SCOPES_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Runs `list` on a pipe and holds that it wrote nothing at either scope. */
  async function listOverAPipe(installation: TestEnvironment): Promise<string> {
    // Not HOME whole: the project sits inside it.
    const installSurfaces = [
      installation.projectDir,
      path.join(installation.fakeHome, DIRS.CLAUDE),
      path.join(installation.fakeHome, DIRS.SOURCE_ROOT),
    ];
    const before = await Promise.all(installSurfaces.map(readTreeSnapshot));
    expect(
      before.map((snapshot) => Object.keys(snapshot).length > 0),
      "each install surface holds files, or the equality after the run holds for nothing",
    ).toStrictEqual([true, true, true]);

    const { exitCode, stdout } = await CLI.run(["list"], {
      dir: installation.projectDir,
      globalHome: installation.fakeHome,
    });

    expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    expect(
      await Promise.all(installSurfaces.map(readTreeSnapshot)),
      "list reads the installation and writes nothing at either scope",
    ).toStrictEqual(before);
    return stdout;
  }

  it(
    "lists each skill by the name its install recorded, with its scope, and prints the config file and each scope's agents folder as paths",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const installed = await runInitFrom(
        store,
        BOTH_SCOPES_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      const stdout = await listOverAPipe(env);

      expect(
        stdout,
        "each skill is named as its install recorded it, and the config and agents lines are paths, global agents first",
      ).toBe(
        [
          "",
          "Installation: project",
          "  Mode:    Eject",
          "  Skills:  2",
          "    E2E Hono (project)",
          "    E2E React (global)",
          "  Agents:  2",
          `  Config:  ${configTsPath(env.projectDir)}`,
          `  Agents:  ${agentsPath(env.fakeHome)}`,
          `  Agents:  ${agentsPath(env.projectDir)}`,
          "",
        ].join("\n"),
      );
    },
  );

  describe.skipIf(!claudeAvailable)("with plugins whose marketplace folder has gone", () => {
    let fixture: E2EPluginSource;

    beforeAll(() => {
      store.publish(
        PLUGINS_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
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

    afterEach(async () => {
      await cleanupFixture(fixture);
    });

    it(
      "lists plugin skills at either scope by the name their install recorded",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const installed = await runInitFrom(
          store,
          PLUGINS_ID,
          { dir: env.projectDir, globalHome: env.fakeHome },
          fixture.sourceDir,
        );
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.fakeHome }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.react.id, fixture.marketplaceName),
        );
        await expect({ dir: env.projectDir }).toHavePlugin(
          pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
        );
        await rename(fixture.sourceDir, `${fixture.sourceDir}-moved`);
        expect(
          await directoryExists(fixture.sourceDir),
          "the marketplace folder must be gone, or the run could still read a plugin's name from it",
        ).toBe(false);

        const stdout = await listOverAPipe(env);

        expect(
          stdout,
          "each plugin is named as its install recorded, with no copy and no marketplace left to name it",
        ).toBe(
          [
            "",
            "Installation: project",
            "  Mode:    Plugin",
            "  Skills:  2",
            "    E2E Hono (project)",
            "    E2E React (global)",
            "  Agents:  2",
            `  Config:  ${configTsPath(env.projectDir)}`,
            `  Agents:  ${agentsPath(env.fakeHome)}`,
            `  Agents:  ${agentsPath(env.projectDir)}`,
            "",
          ].join("\n"),
        );
      },
    );
  });
});
