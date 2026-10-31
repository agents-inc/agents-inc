import { rm } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CLIResult } from "../fixtures/cli.js";
import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { codexGlobalAgentsDir, readCodexAgentRoles } from "../fixtures/codex-agent-roles.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import {
  codexConfigFile,
  switchOffCodexPlugin,
  switchOffCodexPluginInSingleQuotes,
} from "../fixtures/codex-plugin-switch.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { offerANewVersionOf } from "../fixtures/marketplace-moves-on.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupTempDir, flattenCliOutput, readTestFile } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Codex holds a folder marketplace whose plugins it was given directly; `init --from` refreshes it
 * before installing, which adds each of them again and so switches each back on. A switch spelled
 * `[plugins.'<key>']` is one the CLI cannot restore; a config.toml that cannot be written is the
 * other, pinned in the unit suite since Codex replaces the file on every add.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const SWITCHED_OFF_PLUGIN = E2E_SKILL.react.id;
const SWITCHED_ON_PLUGIN = E2E_SKILL.hono.id;
const PLUGIN_THE_RUN_ADDS = E2E_SKILL.vitest.id;

const OFFERED_VERSION = "2.0.0";

type Arrival = {
  fixture: E2EPluginSource;
  store: SeedConfigStore;
  env: TestEnvironment;
  switchedOffKey: string;
  switchedOnKey: string;
  addedKey: string;
  registered: CodexRun;
  configBefore: string;
  listedBefore: CodexRun;
  initRun: CLIResult;
  listedAfter: CodexRun;
};

/** Codex holds two of the marketplace's plugins, one switched off by `switchOff`. */
async function initFromOverHeldPlugins(
  seedId: string,
  switchOff: (home: string, pluginKey: string) => Promise<void>,
  beforeTheRun: (fixture: E2EPluginSource) => Promise<void> = () => Promise.resolve(),
): Promise<Arrival> {
  const fixture = await createE2EPluginSource({ owned: true });
  const store = await startSeedConfigStore();
  const env = await createTestEnvironment({ permissions: false });
  const home = env.fakeHome;
  const switchedOffKey = pluginKeyFor(SWITCHED_OFF_PLUGIN, fixture.marketplaceName);
  const switchedOnKey = pluginKeyFor(SWITCHED_ON_PLUGIN, fixture.marketplaceName);

  for (const args of [
    ["plugin", "marketplace", "add", fixture.sourceDir],
    ["plugin", "add", switchedOffKey],
    ["plugin", "add", switchedOnKey],
  ]) {
    const ran = await runCodex(home, args, home);
    expect(ran.exitCode, `codex ${args.join(" ")} failed: ${ran.stderr}`).toBe(EXIT_CODES.SUCCESS);
  }
  const registered = await runCodex(home, ["plugin", "marketplace", "list"], home);

  await switchOff(home, switchedOffKey);
  const configBefore = await readTestFile(codexConfigFile(home));
  const listedBefore = await runCodex(home, ["plugin", "list"], home);

  await offerANewVersionOf(fixture, [SWITCHED_OFF_PLUGIN, SWITCHED_ON_PLUGIN]);
  await beforeTheRun(fixture);

  store.publish(
    seedId,
    buildSeedPayload({
      skills: {
        [PLUGIN_THE_RUN_ADDS]: buildSeedSkill({
          install: "plugin",
          scope: "global",
          assignments: { [WEB_DEV]: "lazy" },
        }),
      },
      agents: { [WEB_DEV]: { scope: "global" } },
    }),
  );
  const initRun = await runInitFromOnCodex(
    store,
    seedId,
    { dir: env.projectDir, globalHome: home },
    fixture.sourceDir,
  );
  const listedAfter = await runCodex(home, ["plugin", "list"], home);

  return {
    fixture,
    store,
    env,
    switchedOffKey,
    switchedOnKey,
    addedKey: pluginKeyFor(PLUGIN_THE_RUN_ADDS, fixture.marketplaceName),
    registered,
    configBefore,
    listedBefore,
    initRun,
    listedAfter,
  };
}

async function leave(arrival: Arrival | undefined): Promise<void> {
  if (arrival === undefined) return;
  await arrival.store.close();
  await cleanupTempDir(arrival.fixture.tempDir);
  await cleanupTempDir(arrival.env.tempDir);
}

function expectCodexHeldBoth(arrival: Arrival): void {
  expect(arrival.registered.exitCode, arrival.registered.stderr).toBe(EXIT_CODES.SUCCESS);
  expect(
    arrival.registered.json,
    "a git marketplace is refreshed by `marketplace upgrade`, which adds nothing again",
  ).toMatchObject([
    {
      marketplaces: [
        { name: arrival.fixture.marketplaceName, marketplaceSource: { sourceType: "local" } },
      ],
    },
  ]);
  expect(arrival.listedBefore.exitCode, arrival.listedBefore.stderr).toBe(EXIT_CODES.SUCCESS);
  expect(
    arrival.listedBefore.json,
    "Codex must read the plugin as switched off, or nothing was at risk",
  ).toMatchObject([
    {
      installed: expect.arrayContaining([
        expect.objectContaining({ pluginId: arrival.switchedOffKey, enabled: false }),
        expect.objectContaining({ pluginId: arrival.switchedOnKey, enabled: true }),
      ]),
    },
  ]);
}

async function expectTheRestRan(arrival: Arrival): Promise<void> {
  expect(arrival.listedAfter.exitCode, arrival.listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
  expect(
    arrival.listedAfter.json,
    "the plugin the run asked for is still added after the refresh",
  ).toMatchObject([
    {
      installed: expect.arrayContaining([
        expect.objectContaining({ pluginId: arrival.addedKey, enabled: true }),
      ]),
    },
  ]);
  expect(
    await readTestFile(path.join(arrival.env.fakeHome, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
    "the config still records the plugin the run installed",
  ).toContain(PLUGIN_THE_RUN_ADDS);
  expect(
    Object.keys(await readCodexAgentRoles(codexGlobalAgentsDir(arrival.env.fakeHome))),
    "the sub-agent is still compiled",
  ).toContain(`${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`);
}

describe("init --from over a folder marketplace Codex holds, with a plugin switched off under a table spelled in single quotes", () => {
  let arrival: Arrival | undefined;

  const arrived = (): Arrival => {
    if (arrival === undefined) throw new Error("the install never ran");
    return arrival;
  };

  beforeAll(async () => {
    arrival = await initFromOverHeldPlugins("InitWrnSq", switchOffCodexPluginInSingleQuotes);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(() => leave(arrival));

  it("reaches Codex holding the marketplace's plugins, one switched off in single quotes", () => {
    const { configBefore, switchedOffKey } = arrived();

    expectCodexHeldBoth(arrived());
    expect(
      configBefore,
      "the switch must be spelled in single quotes, or the line the CLI looks for is there and nothing can fail",
    ).toContain(`[plugins.'${switchedOffKey}']\nenabled = false`);
  });

  it("exits with an error, so a script running it sees a plugin was left switched on", () => {
    const { initRun } = arrived();

    expect(
      initRun.exitCode,
      `a plugin the user switched off is running again; init must not report success: ${initRun.output}`,
    ).toBe(EXIT_CODES.ERROR);
  });

  it("warns naming the plugin it could not switch off, and the line to set in Codex's config.toml", () => {
    const { initRun, switchedOffKey, switchedOnKey } = arrived();
    const warnings = flattenCliOutput(initRun.stderr);

    expect(warnings, "the warning names the plugin that is now switched on").toContain(
      switchedOffKey,
    );
    expect(warnings, "the warning names the line to set by hand").toContain("enabled = false");
    expect(warnings, "the warning names the file that line goes in").toContain("config.toml");
    expect(warnings, "a plugin left switched on was never at risk").not.toContain(switchedOnKey);
  });

  it("no longer says it kept the cached version, since the refresh did move the plugins on", () => {
    const { initRun, listedAfter, switchedOffKey } = arrived();

    expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(
      listedAfter.json,
      "the warning says this plugin is switched on at the new version; the listing must agree",
    ).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({
            pluginId: switchedOffKey,
            version: OFFERED_VERSION,
            enabled: true,
          }),
        ]),
      },
    ]);
    expect(flattenCliOutput(initRun.output)).not.toContain(STEP_TEXT.MARKETPLACE_KEPT_CACHED);
  });

  it("still installs the plugin it was asked for and compiles the sub-agent", async () => {
    await expectTheRestRan(arrived());
  });
});

describe("init --from when refreshing the folder marketplace Codex holds really fails", () => {
  let arrival: Arrival | undefined;

  const arrived = (): Arrival => {
    if (arrival === undefined) throw new Error("the install never ran");
    return arrival;
  };

  beforeAll(async () => {
    arrival = await initFromOverHeldPlugins("InitWrnGn", switchOffCodexPlugin, (fixture) =>
      rm(path.join(fixture.pluginsDir, SWITCHED_ON_PLUGIN), { recursive: true }),
    );
  }, TIMEOUTS.LIFECYCLE);

  afterAll(() => leave(arrival));

  it("reaches Codex holding the marketplace's plugins, one switched off", () => {
    expectCodexHeldBoth(arrived());
  });

  it("keeps today's warning that it continues with the cached version, and exits 0", () => {
    const { initRun } = arrived();

    expect(initRun.exitCode, initRun.output).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(initRun.stderr)).toContain(STEP_TEXT.MARKETPLACE_KEPT_CACHED);
  });

  it("leaves the plugin the user switched off switched off, with nothing to warn of about it", () => {
    const { initRun, listedAfter, switchedOffKey } = arrived();

    expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(listedAfter.json).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({ pluginId: switchedOffKey, enabled: false }),
        ]),
      },
    ]);
    expect(flattenCliOutput(initRun.stderr)).not.toContain(switchedOffKey);
  });

  it("still installs the plugin it was asked for and compiles the sub-agent", async () => {
    await expectTheRestRan(arrived());
  });
});
