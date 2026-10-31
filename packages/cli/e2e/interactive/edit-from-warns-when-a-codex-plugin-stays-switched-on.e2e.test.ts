import { rm } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { runInitFromOnCodex } from "../fixtures/codex-install.js";
import {
  codexConfigFile,
  switchOffCodexPlugin,
  switchOffCodexPluginInSingleQuotes,
} from "../fixtures/codex-plugin-switch.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { offerANewVersionOf } from "../fixtures/marketplace-moves-on.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupTempDir, flattenCliOutput, readTestFile } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * `edit --from` refreshes the folder marketplace the installation reads before applying, which adds
 * each plugin Codex holds again and so switches each back on. A switch spelled `[plugins.'<key>']`
 * is one the CLI cannot restore; a config.toml that cannot be written is the other, pinned in the
 * unit suite since Codex replaces the file on every add. Applied at home, where Codex plugins live,
 * and at a terminal, since `edit --from` applies nothing without one.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const SWITCHED_OFF_PLUGIN = E2E_SKILL.react.id;
const SWITCHED_ON_PLUGIN = E2E_SKILL.hono.id;
const PLUGIN_THE_RUN_ADDS = E2E_SKILL.vitest.id;

const OFFERED_VERSION = "2.0.0";

const onWebDeveloper = (skillIds: readonly string[]): SeedPayload =>
  buildSeedPayload({
    skills: Object.fromEntries(
      skillIds.map((id) => [
        id,
        buildSeedSkill({ install: "plugin", scope: "global", assignments: { [WEB_DEV]: "lazy" } }),
      ]),
    ),
    agents: { [WEB_DEV]: { scope: "global" } },
  });

type Arrival = {
  fixture: E2EPluginSource;
  store: SeedConfigStore;
  env: TestEnvironment;
  prompt: InteractivePrompt;
  switchedOffKey: string;
  switchedOnKey: string;
  addedKey: string;
  configBefore: string;
  listedBefore: CodexRun;
  exitCode: number;
  output: string;
  rawOutput: string;
  listedAfter: CodexRun;
};

/** Installed through `init --from` as a person would, before anything is switched off. */
async function editFromOverAnInstallation(
  ids: { installed: string; applied: string },
  switchOff: (home: string, pluginKey: string) => Promise<void>,
  beforeTheRun: (fixture: E2EPluginSource) => Promise<void> = () => Promise.resolve(),
): Promise<Arrival> {
  const fixture = await createE2EPluginSource({ owned: true });
  const store = await startSeedConfigStore();
  const env = await createTestEnvironment({ permissions: false });
  const home = env.fakeHome;
  const switchedOffKey = pluginKeyFor(SWITCHED_OFF_PLUGIN, fixture.marketplaceName);

  store.publish(ids.installed, onWebDeveloper([SWITCHED_OFF_PLUGIN, SWITCHED_ON_PLUGIN]));
  const installed = await runInitFromOnCodex(
    store,
    ids.installed,
    { dir: env.projectDir, globalHome: home },
    fixture.sourceDir,
  );
  expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

  await switchOff(home, switchedOffKey);
  const configBefore = await readTestFile(codexConfigFile(home));
  const listedBefore = await runCodex(home, ["plugin", "list"], home);

  await offerANewVersionOf(fixture, [SWITCHED_OFF_PLUGIN, SWITCHED_ON_PLUGIN]);
  await beforeTheRun(fixture);

  store.publish(
    ids.applied,
    onWebDeveloper([SWITCHED_OFF_PLUGIN, SWITCHED_ON_PLUGIN, PLUGIN_THE_RUN_ADDS]),
  );
  const prompt = new InteractivePrompt(["edit", "--from", ids.applied], home, {
    ...TERMINAL_SIZE.TALL,
    env: { AGENTS_INC_API_URL: store.url, HOME: home },
  });
  await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
  expect(
    prompt.getOutput(),
    "the configuration adds a plugin, so the run must ask before applying it",
  ).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
  await prompt.confirm();
  const exitCode = await prompt.waitForExit(TIMEOUTS.PLUGIN_INSTALL);
  const listedAfter = await runCodex(home, ["plugin", "list"], home);

  return {
    fixture,
    store,
    env,
    prompt,
    switchedOffKey,
    switchedOnKey: pluginKeyFor(SWITCHED_ON_PLUGIN, fixture.marketplaceName),
    addedKey: pluginKeyFor(PLUGIN_THE_RUN_ADDS, fixture.marketplaceName),
    configBefore,
    listedBefore,
    exitCode,
    output: flattenCliOutput(prompt.getOutput()),
    rawOutput: prompt.getRawOutput(),
    listedAfter,
  };
}

async function leave(arrival: Arrival | undefined): Promise<void> {
  if (arrival === undefined) return;
  await arrival.prompt.destroy();
  await arrival.store.close();
  await cleanupTempDir(arrival.fixture.tempDir);
  await cleanupTempDir(arrival.env.tempDir);
}

function expectCodexHeldBoth(arrival: Arrival): void {
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
}

describe("edit --from over a Codex installation with a plugin switched off under a table spelled in single quotes", () => {
  let arrival: Arrival | undefined;

  const arrived = (): Arrival => {
    if (arrival === undefined) throw new Error("the apply never ran");
    return arrival;
  };

  beforeAll(async () => {
    arrival = await editFromOverAnInstallation(
      { installed: "EdtWrnI1", applied: "EdtWrnA1" },
      switchOffCodexPluginInSingleQuotes,
    );
  }, TIMEOUTS.LIFECYCLE);

  afterAll(() => leave(arrival));

  it("reaches Codex holding the installation's plugins, one switched off in single quotes", () => {
    const { configBefore, switchedOffKey } = arrived();

    expectCodexHeldBoth(arrived());
    expect(
      configBefore,
      "the switch must be spelled in single quotes, or the line the CLI looks for is there and nothing can fail",
    ).toContain(`[plugins.'${switchedOffKey}']\nenabled = false`);
  });

  it("exits with an error, so a script running it sees a plugin was left switched on", () => {
    const { exitCode, output } = arrived();

    expect(
      exitCode,
      `a plugin the user switched off is running again; edit must not report success: ${output}`,
    ).toBe(EXIT_CODES.ERROR);
  });

  it("warns naming the plugin it could not switch off, and the line to set in Codex's config.toml", () => {
    const { output, switchedOffKey } = arrived();

    expect(output, "the warning names the plugin that is now switched on").toContain(
      switchedOffKey,
    );
    expect(output, "the warning names the line to set by hand").toContain("enabled = false");
    expect(output, "the warning names the file that line goes in").toContain("config.toml");
  });

  it("no longer says it kept the cached version, since the refresh did move the plugins on", () => {
    const { listedAfter, rawOutput, switchedOffKey } = arrived();

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
    expect(rawOutput, "the run's output was read at all").toContain(
      STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM,
    );
    expect(rawOutput).not.toContain(STEP_TEXT.MARKETPLACE_KEPT_CACHED);
  });

  it("still installs the plugin it was asked for and records it in the config", async () => {
    await expectTheRestRan(arrived());
  });
});

describe("edit --from when refreshing the folder marketplace the installation reads really fails", () => {
  let arrival: Arrival | undefined;

  const arrived = (): Arrival => {
    if (arrival === undefined) throw new Error("the apply never ran");
    return arrival;
  };

  beforeAll(async () => {
    arrival = await editFromOverAnInstallation(
      { installed: "EdtWrnI2", applied: "EdtWrnA2" },
      switchOffCodexPlugin,
      (fixture) => rm(path.join(fixture.pluginsDir, SWITCHED_ON_PLUGIN), { recursive: true }),
    );
  }, TIMEOUTS.LIFECYCLE);

  afterAll(() => leave(arrival));

  it("reaches Codex holding the installation's plugins, one switched off", () => {
    expectCodexHeldBoth(arrived());
  });

  it("keeps today's warning that it continues with the cached version, and exits 0", () => {
    const { exitCode, output } = arrived();

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.MARKETPLACE_KEPT_CACHED);
  });

  it("leaves the plugin the user switched off switched off, with nothing to warn of about it", () => {
    const { listedAfter, output, rawOutput, switchedOffKey } = arrived();

    expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(listedAfter.json).toMatchObject([
      {
        installed: expect.arrayContaining([
          expect.objectContaining({ pluginId: switchedOffKey, enabled: false }),
        ]),
      },
    ]);
    expect(output, "the run's output was read at all").toContain(STEP_TEXT.MARKETPLACE_KEPT_CACHED);
    expect(rawOutput).not.toContain(switchedOffKey);
  });

  it("still installs the plugin it was asked for and records it in the config", async () => {
    await expectTheRestRan(arrived());
  });
});
