import { Config } from "@oclif/core";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";

/** Named so the pin cannot outlive the plugin whose init hook is the door. */
const UPDATE_CHECK_PLUGIN = "@oclif/plugin-warn-if-update-available";

/** Unscoped: oclif composes the real name from it and `oclif.bin`, so no spelling is pinned. */
const SKIP_NEW_VERSION_CHECK = "SKIP_NEW_VERSION_CHECK";

/** Clears every key `scopedEnvVarTrue` consults (bin and aliases), then restores each as found. */
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
 * Builds no home and mocks nothing on purpose: the door must be shut without any spec opting in,
 * because some specs run `runCliCommand` without an isolated home.
 */
describe("oclif's update-check door", () => {
  it("is closed for a spec that sets up no isolated home", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(
      [...config.plugins.keys()],
      "the plugin whose init hook spawns the version check is gone — the pin in vitest.setup.ts guards nothing and should go with it",
    ).toContain(UPDATE_CHECK_PLUGIN);

    expect(
      config.scopedEnvVarTrue(SKIP_NEW_VERSION_CHECK),
      "the door is open: a spec running a command spawns a detached child that GETs the npm registry and writes into its home",
    ).toBe(true);
  });

  /** The paired open state: a predicate answering `true` regardless would pass the closed case. */
  it("is open again with the pin withdrawn, so the closed state reads the pin rather than a default", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(doorWithoutThePin(config)).toBe(false);
  });
});
