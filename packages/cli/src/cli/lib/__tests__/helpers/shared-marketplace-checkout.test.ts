import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLUGIN_NAME } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils.js";
import { ensureRecordedCheckout, linkSharedCache } from "./shared-marketplace-checkout.js";

// Assembled independently of the module under test, so a wrong address there can fail.
function expectedCheckoutDir(cacheDir: string): string {
  return path.join(
    cacheDir,
    DEFAULT_PLUGIN_NAME,
    "sources",
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );
}

const SHARED_CACHE_DIR = path.join(os.tmpdir(), "agents-inc-unit-shared-cache", ".cache");

// Mirrored rather than imported, so the assertion can fail if the value changes.
const NEVER_REVALIDATED_TARBALL = `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz`;

function fetchWriting(name: string): (dir: string) => Promise<void> {
  return async (dir) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), "a checkout\n");
  };
}

function fetchThatMustNotRun(): (dir: string) => Promise<void> {
  return vi.fn(() => Promise.reject(new Error("the checkout was already published")));
}

describe("ensureRecordedCheckout", () => {
  let cacheHome: string;

  beforeEach(async () => {
    cacheHome = await createTempDir("cc-checkout-spec-");
    return () => cleanupTempDir(cacheHome);
  });

  function checkout(): string {
    return expectedCheckoutDir(path.join(cacheHome, ".cache"));
  }

  it("publishes a checkout at the address a fake home resolves, and records it", async () => {
    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
  });

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

  // The record is a sibling path the rename doesn't carry; a killed run can leave it missing.
  it("records a checkout an interruption published but never recorded, without fetching again", async () => {
    await publishWithoutRecording();

    await ensureRecordedCheckout(cacheHome, fetchThatMustNotRun());

    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
  });

  it("publishes nothing when the fetch fails, so the next run rebuilds", async () => {
    await expect(
      ensureRecordedCheckout(cacheHome, () => Promise.reject(new Error("network down"))),
    ).rejects.toThrow("network down");
    await expect(lstat(checkout())).rejects.toThrow();

    await ensureRecordedCheckout(cacheHome, fetchWriting("SKILL.md"));

    expect(await readdir(checkout())).toStrictEqual(["SKILL.md"]);
    expect(await fileExists(fetchRecordPath(checkout()))).toBe(true);
  });

  async function publishWithoutRecording(): Promise<void> {
    await mkdir(checkout(), { recursive: true });
    await writeFile(path.join(checkout(), "SKILL.md"), "a checkout\n");
  }
});

// Read only: a second writer on a machine-wide path would race globalSetup.
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

  // Asserts fs.rm unlinks rather than descends; descending would delete the shared checkout.
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
