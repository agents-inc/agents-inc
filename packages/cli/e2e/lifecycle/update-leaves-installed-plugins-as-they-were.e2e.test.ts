import path from "path";
import { appendFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
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
  cleanupTempDir,
  isClaudeCLIAvailable,
  readPluginVersions,
  readTestFile,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Journey 10's refresh branch, through the real Claude CLI: `update` refreshes the marketplace a
 * plugin install came from, and the installed plugin stays at the version it was installed at.
 *
 * `update` runs `claude plugin marketplace update <name>`, which re-reads the marketplace's listing
 * and installs nothing. So with a newer version on offer, the installed plugin's registry record is
 * the same after the run as before it — and the run's summary must say exactly that, rather than
 * report the update complete.
 *
 * The marketplace moves on the way an author moves it: one line appended to the skill, then the two
 * builds, which take the plugin to its next major version. The source is a private one for that
 * reason, since the shared fixture is frozen.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const SKILL_ID = E2E_SKILL.react.id;
const SEED_ID = "UpdPlug1";

/** What a first build gives every plugin, and what a build after a content change gives it. */
const INSTALLED_VERSION = "1.0.0";
const OFFERED_VERSION = "2.0.0";

const SOURCE_EDIT = "## A section added to the marketplace after installation";

/** Every plugin record in the Claude CLI's registry under `home`, as it wrote them. */
async function registeredPlugins(home: string): Promise<Record<string, unknown[]>> {
  const registryPath = path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON);
  const registry: { plugins: Record<string, unknown[]> } = JSON.parse(
    await readTestFile(registryPath),
  );
  return registry.plugins;
}

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("update over a plugin whose marketplace has moved on", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment;

  let updateRun: CLIResult;
  let pluginKey: string;
  let pluginsBefore: Record<string, unknown[]>;
  let pluginsAfter: Record<string, unknown[]>;
  let offeredVersions: Record<string, string | undefined>;
  let projectBefore: Awaited<ReturnType<typeof readTreeSnapshot>>;
  let projectAfter: Awaited<ReturnType<typeof readTreeSnapshot>>;

  beforeAll(async () => {
    fixture = await createE2EPluginSource({ owned: true });
    store = await startSeedConfigStore();
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    pluginKey = pluginKeyFor(SKILL_ID, fixture.marketplaceName);

    store.publish(
      SEED_ID,
      buildSeedPayload({
        skills: {
          [SKILL_ID]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    const installed = await runInitFrom(store, SEED_ID, project, fixture.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    pluginsBefore = await registeredPlugins(env.fakeHome);

    await appendFile(
      path.join(fixture.sourceDir, SOURCE_PATHS.SKILLS_DIR, SKILL_ID, FILES.SKILL_MD),
      `\n\n${SOURCE_EDIT}\n`,
    );
    for (const build of [
      ["build", "plugins"],
      ["build", "marketplace"],
    ]) {
      const built = await CLI.run(build, { dir: fixture.sourceDir });
      expect(built.exitCode, `${build.join(" ")} failed: ${built.output}`).toBe(EXIT_CODES.SUCCESS);
    }
    offeredVersions = await readPluginVersions(fixture.pluginsDir, [SKILL_ID]);

    projectBefore = await readTreeSnapshot(env.projectDir);
    updateRun = await CLI.run(["update"], project);
    projectAfter = await readTreeSnapshot(env.projectDir);
    pluginsAfter = await registeredPlugins(env.fakeHome);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(fixture.tempDir);
    await cleanupTempDir(env.tempDir);
  });

  it("refreshes the marketplace and leaves the installed plugin at the version it was installed at", () => {
    expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(updateRun.output).toContain(
      `${STEP_TEXT.UPDATE_MARKETPLACE_REFRESHED} ${fixture.marketplaceName}`,
    );

    // A newer version was on offer, so a registry unchanged across the run is one `update` left.
    expect(offeredVersions).toStrictEqual({ [SKILL_ID]: OFFERED_VERSION });
    expect(Object.keys(pluginsBefore)).toStrictEqual([pluginKey]);
    expect(pluginsBefore).toMatchObject({ [pluginKey]: [{ version: INSTALLED_VERSION }] });
    expect(pluginsAfter).toStrictEqual(pluginsBefore);

    expect(Object.keys(projectBefore).length).toBeGreaterThan(0);
    expect(projectAfter).toStrictEqual(projectBefore);
  });

  it("says the listing was refreshed and the installed plugins were not changed", () => {
    expect(
      updateRun.output,
      "the installed plugin kept its version, so the run may not report the update complete",
    ).not.toContain(STEP_TEXT.UPDATE_COMPLETE);
    expect(updateRun.output).toContain(STEP_TEXT.UPDATE_PLUGINS_UNCHANGED);
  });
});
