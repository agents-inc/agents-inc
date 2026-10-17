import os from "os";
import path from "path";
import { Config } from "@oclif/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cacheRoot } from "../../../consts.js";
import { DEFAULT_SOURCE } from "../../configuration/config.js";
import { fetchRecordPath, sanitizeSourceForCache } from "../../loading/source-fetcher.js";
import { claudeStateFile } from "../../installation/install-layout.js";
import { CLI_ROOT } from "./cli-runner.js";
import { setupIsolatedHome, useFakeHome } from "./isolated-home.js";
import { createTempDir, cleanupTempDir, directoryExists, fileExists } from "../test-fs-utils.js";

// Built from the product's helpers, so it is the address `fetchFromRemoteSource` computes.
function defaultCheckoutUnder(cacheDir: string): string {
  return path.join(cacheDir, "sources", sanitizeSourceForCache(DEFAULT_SOURCE));
}

const EXPORTED_CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), "a-developers-claude-config");

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

  // Asks oclif's own predicate, so a misspelled key or unaccepted value fails here.
  it("closes oclif's update-check door, so nothing outside this process writes into the home", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")).toBe(true);
  });

  // Asserted where the product looks, record included: without it the checkout is re-downloaded.
  it("borrows the shared marketplace checkout, so the default source is already downloaded and recorded", async () => {
    const checkout = defaultCheckoutUnder(cacheRoot());

    expect(await directoryExists(checkout)).toBe(true);
    expect(await fileExists(fetchRecordPath(checkout))).toBe(true);
  });
});

describe("setupIsolatedHome cleanup", () => {
  // `vitest.setup.ts` sets the update-check variable once per file; put back what specs displace.
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

  it("keeps Claude Code's state file in the fake home under an exported CLAUDE_CONFIG_DIR, and puts it back", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", EXPORTED_CLAUDE_CONFIG_DIR);

    const home = await setupIsolatedHome("cc-isolated-home-spec-");
    const stateFile = claudeStateFile();
    await home.cleanup();

    expect(path.dirname(stateFile)).toBe(home.fakeHome);
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(EXPORTED_CLAUDE_CONFIG_DIR);
  });

  // Position-dependent: runs after the specs that withdrew the per-file pin.
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

  it("closes oclif's update-check door", async () => {
    const config = await Config.load(CLI_ROOT);

    expect(config.scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")).toBe(true);
  });

  // Not a duplicate: each entry point links the cache from its own call site.
  it("borrows the shared marketplace checkout too", async () => {
    const checkout = defaultCheckoutUnder(cacheRoot());

    expect(await directoryExists(checkout)).toBe(true);
    expect(await fileExists(fetchRecordPath(checkout))).toBe(true);
  });
});

describe("useFakeHome under an exported CLAUDE_CONFIG_DIR", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-fake-home-spec-");
    vi.stubEnv("CLAUDE_CONFIG_DIR", EXPORTED_CLAUDE_CONFIG_DIR);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  const fakeHome = useFakeHome(() => tempDir);

  it("keeps Claude Code's state file in the fake home", () => {
    expect(path.dirname(claudeStateFile())).toBe(fakeHome.dir);
  });
});
