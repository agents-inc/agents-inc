import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLUGIN_NAME } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils.js";
import { ensureRecordedCheckout, linkSharedCache } from "./shared-marketplace-checkout.js";

/**
 * Where a command run under a fake home looks for the default marketplace, spelled out here
 * rather than imported from the module under test.
 *
 * The module's whole job is to put a checkout at the address `fetchFromRemoteSource` computes,
 * and it assembles that address from `sanitizeSourceForCache`. Asking it for the answer and
 * comparing it to itself would pass however wrong the address was, so this is assembled a second
 * time from the same product helpers and the same product constants — which is the only thing
 * either side is allowed to agree on.
 */
function expectedCheckoutDir(cacheDir: string): string {
  return path.join(
    cacheDir,
    DEFAULT_PLUGIN_NAME,
    "sources",
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );
}

const SHARED_CACHE_DIR = path.join(os.tmpdir(), "agents-inc-unit-shared-cache", ".cache");

/**
 * The tarball the record names, mirrored rather than imported: the module keeps it private, and
 * an assertion reading the value it is asserting about cannot fail when that value changes.
 */
const NEVER_REVALIDATED_TARBALL = `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz`;

/**
 * A fetch that writes a checkout's worth of bytes and nothing more, standing in for the ~2.5s
 * download the real one makes.
 *
 * The fetch is a parameter of the mechanism precisely so this file never makes that download and
 * never touches {@link SHARED_CACHE_DIR}'s contents — the rule in `shared-source.ts` covers this
 * module too, and the specs below build under roots they created.
 */
function fetchWriting(name: string): (dir: string) => Promise<void> {
  return async (dir) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), "a checkout\n");
  };
}

/** A fetch that must not be reached. Any call is the failure, reported at the call. */
function fetchThatMustNotRun(): (dir: string) => Promise<void> {
  return vi.fn(() => Promise.reject(new Error("the checkout was already published")));
}

describe("ensureRecordedCheckout", () => {
  let cacheHome: string;

  beforeEach(async () => {
    cacheHome = await createTempDir("cc-checkout-spec-");
    return () => cleanupTempDir(cacheHome);
  });

  /** The address this spec's own cache home resolves, assembled the same way the shared one is. */
  function checkout(): string {
    return expectedCheckoutDir(path.join(cacheHome, ".cache"));
  }

  it("publishes a checkout at the address a fake home resolves, and records it", async () => {
    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
  });

  /**
   * The record is what keeps every worker offline. `classifyCachedCopy` answers `current`
   * without asking the network only when a record exists AND carries no `etag`; a record with
   * one costs a HEAD per file, and no record at all reads as `unrecorded` and re-downloads the
   * whole marketplace — the exact failure this module exists to prevent.
   */
  it("records the copy with no ETag, so nothing revalidates it over the network", async () => {
    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    const record: unknown = JSON.parse(await readFile(fetchRecordPath(checkout()), "utf8"));

    expect(record).toStrictEqual({ tar: NEVER_REVALIDATED_TARBALL });
  });

  it("leaves no staging directory behind for the fetcher to find", async () => {
    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    await expect(lstat(`${checkout()}.staging`)).rejects.toThrow();
  });

  it("fetches nothing once a recorded checkout is there", async () => {
    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));
    await ensureRecordedCheckout(cacheHome, fetchThatMustNotRun());

    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
  });

  /**
   * The crash window, and the reason the record is written unconditionally rather than only on
   * the fetching path.
   *
   * `rename` publishes the checkout and the record is a SIBLING path (`${cacheDir}.etag.json`),
   * so the rename does not carry it — a run killed between the two leaves a directory the guard
   * accepts and a record `classifyCachedCopy` answers `unrecorded` to. Nothing repaired that:
   * every later run returned early over the directory and every worker in every later run
   * re-downloaded the whole marketplace, which is the 31-downloads-per-run defect restored
   * permanently by one interrupted setup.
   *
   * A published checkout is complete by construction, so the repair costs a small write and
   * never a fetch — asserted here, because a repair that re-downloaded would be the same defect
   * paid for once instead of forever.
   */
  it("records a checkout an interruption published but never recorded, without fetching again", async () => {
    await publishWithoutRecording();

    await ensureRecordedCheckout(cacheHome, fetchThatMustNotRun());

    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
  });

  /**
   * The other side of the same window. A fetch that dies has published nothing, so the next run
   * finds no directory, fetches again and completes — where a half-built tree at the published
   * address would be a checkout every later run accepted and no run could describe.
   */
  it("publishes nothing when the fetch fails, so the next run rebuilds", async () => {
    await expect(
      ensureRecordedCheckout(cacheHome, () => Promise.reject(new Error("network down"))),
    ).rejects.toThrow("network down");
    await expect(lstat(checkout())).rejects.toThrow();

    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
  });

  /** The state an interrupted run leaves: the directory published, and nothing beside it. */
  async function publishWithoutRecording(): Promise<void> {
    await mkdir(checkout(), { recursive: true });
    await writeFile(path.join(checkout(), "SKILL.md"), "a checkout\n");
  }
});

/**
 * The shared checkout, read and never written. `vitest.global-setup.ts` publishes it before any
 * worker starts, and these specs assert what it left — building one here would put a second
 * writer on a machine-wide path, which is the rule `shared-source.ts` states for the whole family.
 */
describe("the shared checkout vitest.global-setup.ts publishes", () => {
  it("sits where a fake home's cacheRoot() resolves", async () => {
    const entries = await readdir(expectedCheckoutDir(SHARED_CACHE_DIR));

    expect(entries.length).toBeGreaterThan(0);
  });

  it("carries a record with no ETag, so nothing revalidates it over the network", async () => {
    const raw = await readFile(fetchRecordPath(expectedCheckoutDir(SHARED_CACHE_DIR)), "utf8");
    const record: unknown = JSON.parse(raw);

    expect(record).toStrictEqual({ tar: NEVER_REVALIDATED_TARBALL });
  });

  it("left no staging directory behind for the fetcher to find", async () => {
    const staged = `${expectedCheckoutDir(SHARED_CACHE_DIR)}.staging`;

    await expect(lstat(staged)).rejects.toThrow();
  });
});

describe("linkSharedCache", () => {
  it("points a fake home's .cache at the shared checkout", async () => {
    const tempDir = await createTempDir("cc-shared-checkout-spec-");
    const fakeHome = path.join(tempDir, "fakehome");
    await mkdir(fakeHome, { recursive: true });

    try {
      await linkSharedCache(fakeHome);

      const linked = path.join(fakeHome, ".cache");
      expect((await lstat(linked)).isSymbolicLink()).toBe(true);
      expect(await realpath(linked)).toBe(await realpath(SHARED_CACHE_DIR));

      const entries = await readdir(expectedCheckoutDir(linked));
      expect(entries.length).toBeGreaterThan(0);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  /**
   * The teardown half, and the one that would be catastrophic to get wrong: `cleanupTempDir`
   * removes a fake home while every later test in the run is still reading the checkout through
   * its own link. `fs.rm` unlinks a symlink rather than descending through it — asserted rather
   * than assumed, because a Node that did descend would delete the shared checkout mid-run and
   * the symptom would be a re-download in an unrelated file.
   */
  it("survives the teardown that removes the fake home holding the link", async () => {
    const tempDir = await createTempDir("cc-shared-checkout-spec-");
    const fakeHome = path.join(tempDir, "fakehome");
    await mkdir(fakeHome, { recursive: true });

    await linkSharedCache(fakeHome);
    await cleanupTempDir(tempDir);

    await expect(lstat(tempDir)).rejects.toThrow();
    const entries = await readdir(expectedCheckoutDir(SHARED_CACHE_DIR));
    expect(entries.length).toBeGreaterThan(0);
  });

  it("refuses a second link into the same fake home rather than replacing one", async () => {
    const tempDir = await createTempDir("cc-shared-checkout-spec-");
    const fakeHome = path.join(tempDir, "fakehome");
    await mkdir(fakeHome, { recursive: true });

    try {
      await linkSharedCache(fakeHome);
      await expect(linkSharedCache(fakeHome)).rejects.toThrow(/EEXIST/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
