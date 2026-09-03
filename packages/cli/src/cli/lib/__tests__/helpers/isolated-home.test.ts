import os from "os";
import path from "path";
import { Config } from "@oclif/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cacheRoot } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { CLI_ROOT } from "./cli-runner.js";
import { setupIsolatedHome, useFakeHome } from "./isolated-home.js";
import { createTempDir, cleanupTempDir, directoryExists, fileExists } from "../test-fs-utils.js";

/**
 * Where a command run under a fake home looks for the default marketplace, assembled from the
 * product's own helpers rather than spelled — `cacheRoot()` reads `os.homedir()` at call time and
 * the spy in `vitest.setup.ts` answers it with `process.env.HOME`, so under a fake home this IS
 * the address `fetchFromRemoteSource` computes.
 */
function defaultCheckoutUnder(cacheDir: string): string {
  return path.join(cacheDir, "sources", sanitizeSourceForCache(DEFAULT_SOURCE));
}

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

  /**
   * The ONE thing in a fake home that is not private to the test, and the only pin on it.
   *
   * `helpers/shared-marketplace-checkout.ts` has specs of its own, but they cover the helper;
   * nothing covered the WIRING, so both `linkSharedCache` calls could be deleted from
   * `isolated-home.ts` and the entire suite stayed green. What comes back when they go is a
   * download of `agents-inc/skills` per test — 31 across the `commands` project, and about 86
   * seconds — and its only symptom is a timeout, which reads as flake and costs an investigation
   * to name.
   *
   * Asserted at the address the PRODUCT computes rather than at the symlink, because the symlink
   * being present is not the promise: the promise is that `fetchFromRemoteSource` finds a
   * recorded copy where it looks. The record is half of that — without it `classifyCachedCopy`
   * answers `unrecorded` and re-downloads over a checkout that is sitting right there.
   */
  it("borrows the shared marketplace checkout, so the default source is already downloaded and recorded", async () => {
    const checkout = defaultCheckoutUnder(cacheRoot());

    expect(await directoryExists(checkout)).toBe(true);
    expect(await fileExists(fetchRecordPath(checkout))).toBe(true);
  });
});

describe("setupIsolatedHome cleanup", () => {
  /**
   * Two specs below take oclif's update-check pin away, to see what the helper does when it finds
   * none. `vitest.setup.ts` sets that variable ONCE for the whole file, so a withdrawal is not a
   * local fixture — it is a process-wide door left open behind whoever ran it. `vi.stubEnv`
   * records what it displaced and this puts it back, from a hook that runs whether the assertion
   * passed or threw.
   */
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes the temp dir and puts back the HOME it found", async () => {
    const before = process.env.HOME;
    const home = await setupIsolatedHome("cc-isolated-home-spec-");

    await home.cleanup();

    expect(process.env.HOME).toBe(before);
    expect(await directoryExists(home.tempDir)).toBe(false);
  });

  it("puts back the update-check setting it found rather than clearing it", async () => {
    const sentinel = "an-earlier-caller-owns-this";
    vi.stubEnv("AGENTS_INC_SKIP_NEW_VERSION_CHECK", sentinel);

    const home = await setupIsolatedHome("cc-isolated-home-spec-");
    await home.cleanup();

    expect(process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK).toBe(sentinel);
  });

  it("leaves no update-check setting behind when it found none", async () => {
    vi.stubEnv("AGENTS_INC_SKIP_NEW_VERSION_CHECK", undefined);

    const home = await setupIsolatedHome("cc-isolated-home-spec-");
    await home.cleanup();

    expect(process.env.AGENTS_INC_SKIP_NEW_VERSION_CHECK).toBeUndefined();
  });

  /**
   * The victim, and the reason its POSITION carries the assertion: it runs after the two specs
   * above, which is the only vantage point from which their handling of the process-wide pin is
   * visible at all. `vitest.setup.ts` sets `AGENTS_INC_SKIP_NEW_VERSION_CHECK` once per file, so a
   * spec that takes it away and does not put it back leaves oclif's update-check door open for
   * every spec that follows it here. That leak has no symptom of its own: the specs that follow
   * today ask for a fake home, which re-sets the variable on the way in, so this is the one place
   * the withdrawal can be seen before it costs somebody a resurrected temp directory.
   */
  it("leaves oclif's update-check door closed behind the specs that withdrew the pin", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")).toBe(true);
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

  /**
   * The same borrowed checkout as {@link setupIsolatedHome}'s, and a SECOND pin rather than a
   * duplicate: the two entry points link the cache from two separate call sites, so one
   * assertion covers one of them and leaves the other deletable in silence.
   */
  it("borrows the shared marketplace checkout too", async () => {
    const checkout = defaultCheckoutUnder(cacheRoot());

    expect(await directoryExists(checkout)).toBe(true);
    expect(await fileExists(fetchRecordPath(checkout))).toBe(true);
  });
});
