import { Config } from "@oclif/core";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";

/**
 * The plugin whose init hook is the door. Named so the pin cannot outlive its subject: drop the
 * plugin from `oclif.plugins` and everything below still passes, having guarded nothing.
 */
const UPDATE_CHECK_PLUGIN = "@oclif/plugin-warn-if-update-available";

/**
 * The UNSCOPED key. oclif composes the real variable name from this and `oclif.bin`, so nothing
 * here spells `AGENTS_INC_SKIP_NEW_VERSION_CHECK` — a spelling assertion goes green against a
 * variable the plugin has stopped reading, which is the failure this file exists to avoid.
 */
const SKIP_NEW_VERSION_CHECK = "SKIP_NEW_VERSION_CHECK";

/**
 * The same predicate, answered with the pin gone — every name it could be written under, since
 * `scopedEnvVarTrue` consults the bin's key and each bin alias's. Each is put back as it was
 * found, absent included, so nothing downstream reads a door this test left standing open.
 */
function doorWithoutThePin(config: Config): boolean {
  const pinned = config
    .scopedEnvVarKeys(SKIP_NEW_VERSION_CHECK)
    .map((key) => ({ key, value: process.env[key] }));

  for (const { key } of pinned) delete process.env[key];

  try {
    return config.scopedEnvVarTrue(SKIP_NEW_VERSION_CHECK);
  } finally {
    for (const { key, value } of pinned) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * The update-check door, closed for the whole suite rather than for one fake home at a time.
 *
 * This file builds no home, mocks nothing and installs no hook — deliberately. That is the state
 * every spec is in before it asks for anything, and it is the state the pin has to hold in:
 * `helpers/isolated-home.ts` sets the same variable per fake home, so the specs it covers were
 * never the ones that leaked. The one that did asked for no home at all — `commands/edit.test.ts`'s
 * `describe("no installation found")` runs `runCliCommand` against a bare temp project, which is
 * every bit as much a door as a hand-rolled home is, and the reason the pin cannot live in a
 * helper anybody has to call.
 *
 * `vitest.setup.ts` carries what leaks and what it costs. What belongs here is that the door is
 * shut without anyone opting in, which is a claim only a spec that opts into nothing can make.
 */
describe("oclif's update-check door", () => {
  it("is closed for a spec that sets up no isolated home", async () => {
    const config = await Config.load(CLI_ROOT);

    // Subject guard. The pin names a variable this plugin reads and nothing else does, so with
    // the plugin gone there is no door and the assertion below is a statement about an unused
    // string — green, and worth nothing.
    expect(
      [...config.plugins.keys()],
      "the plugin whose init hook spawns the version check is gone — the pin in vitest.setup.ts guards nothing and should go with it",
    ).toContain(UPDATE_CHECK_PLUGIN);

    expect(
      config.scopedEnvVarTrue(SKIP_NEW_VERSION_CHECK),
      "the door is open: a spec running a command spawns a detached child that GETs the npm registry and writes into its home",
    ).toBe(true);
  });

  /**
   * The paired open state, without which the assertion above cannot fail. `scopedEnvVarTrue`
   * derives its own key and accepts only `"1"` and `"true"`, so a bin rename, a misspelled pin or
   * a truthy-but-unaccepted value all answer `false` — and a predicate that answered `true`
   * regardless would satisfy the closed case for a reason having nothing to do with the pin.
   */
  it("is open again with the pin withdrawn, so the closed state reads the pin rather than a default", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(doorWithoutThePin(config)).toBe(false);
  });
});
