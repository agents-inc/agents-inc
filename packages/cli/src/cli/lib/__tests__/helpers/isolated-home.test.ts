import os from "os";
import path from "path";
import { Config } from "@oclif/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_ROOT } from "./cli-runner.js";
import { setupIsolatedHome, useFakeHome } from "./isolated-home.js";
import { createTempDir, cleanupTempDir, directoryExists } from "../test-fs-utils.js";

/**
 * What an isolated home is FOR, held here rather than in each of the thirteen files that
 * ask for one.
 *
 * The promise is not only "HOME points somewhere else while the test runs" — it is that
 * nothing outside this process can write into the directory afterwards. A fake home that
 * a detached third-party process recreates after `cleanup` has removed it is not
 * isolated; it is a leak with a tidy-looking teardown, and it fails as a PASS.
 */
describe("setupIsolatedHome", () => {
  let home: Awaited<ReturnType<typeof setupIsolatedHome>>;

  beforeEach(async () => {
    home = await setupIsolatedHome("cc-isolated-home-spec-");
  });

  afterEach(async () => {
    await home.cleanup();
  });

  it("points HOME and os.homedir() at the fake home", () => {
    expect(process.env.HOME).toBe(home.fakeHome);
    expect(os.homedir()).toBe(home.fakeHome);
  });

  it("chdirs into the project dir, which sits beside the fake home", () => {
    expect(process.cwd()).toBe(home.projectDir);
    expect(path.dirname(home.projectDir)).toBe(home.tempDir);
    expect(path.dirname(home.fakeHome)).toBe(home.tempDir);
  });

  /**
   * The subject is oclif's own predicate, not the variable's spelling: `Config` derives
   * the key from the bin name and accepts only `"1"` or `"true"`, so a misspelled name or
   * a truthy-but-unaccepted value answers `false` here while an assertion on
   * `process.env` would read green.
   *
   * What it buys: `@oclif/plugin-warn-if-update-available`'s init hook spawns a DETACHED,
   * `unref`ed child which `mkdir -p`s and writes `<home>/.cache/agents-inc/version`. That
   * child outlives the test that started it, so it recreates a fake home `cleanup` has
   * already removed — and its `mkdir` landing inside a running recursive remove is the
   * other side of the `ENOTEMPTY: rmdir` this suite sees. Measured on
   * `commands/eject.test.ts`: 26 resurrected `/tmp/cc-eject-test-*` directories in one
   * run of that one file, and 0 with the door closed.
   */
  it("closes oclif's update-check door, so nothing outside this process writes into the home", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")).toBe(true);
  });
});

describe("setupIsolatedHome cleanup", () => {
  it("removes the temp dir and puts back the HOME it found", async () => {
    const before = process.env.HOME;
    const home = await setupIsolatedHome("cc-isolated-home-spec-");

    await home.cleanup();

    expect(process.env.HOME).toBe(before);
    expect(await directoryExists(home.tempDir)).toBe(false);
  });

  it("puts back the update-check setting it found rather than clearing it", async () => {
    const sentinel = "an-earlier-caller-owns-this";
    process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK = sentinel;

    const home = await setupIsolatedHome("cc-isolated-home-spec-");
    await home.cleanup();

    expect(process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK).toBe(sentinel);
    delete process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK;
  });

  it("leaves no update-check setting behind when it found none", async () => {
    delete process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK;

    const home = await setupIsolatedHome("cc-isolated-home-spec-");
    await home.cleanup();

    expect(process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK).toBeUndefined();
  });
});

describe("useFakeHome", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-fake-home-spec-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const fakeHome = useFakeHome(() => tempDir);

  it("points HOME at the fake home it created", () => {
    expect(process.env.HOME).toBe(fakeHome.dir);
    expect(fakeHome.dir).toBe(path.join(tempDir, "fake-home"));
  });

  /** The same door as {@link setupIsolatedHome}'s, for the same reason. */
  it("closes oclif's update-check door", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")).toBe(true);
  });
});
