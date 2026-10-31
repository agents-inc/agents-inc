import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { cacheRoot, globalInstallRoot } from "../../consts.js";

/**
 * Read at load, before any HOME change. With the setup spy `os.homedir()` answers under
 * `os.tmpdir()`, without it this; the pins below leave HOME alone as node re-reads it per call.
 */
const MACHINE_HOME = os.homedir();

/** A frozen constant is right on first read, so HOME moves between two reads of the same module. */
describe("the constants derived from the home directory follow it", () => {
  it("answers the home in force when it is asked, not the one that was in force at import", () => {
    const firstHome = path.join(os.tmpdir(), "cc-home-follows-first");
    const secondHome = path.join(os.tmpdir(), "cc-home-follows-second");
    const homedir = vi.spyOn(os, "homedir");

    homedir.mockReturnValue(firstHome);
    const first = { global: globalInstallRoot(), cache: cacheRoot() };
    homedir.mockReturnValue(secondHome);
    const second = { global: globalInstallRoot(), cache: cacheRoot() };

    expect(first.global).toBe(firstHome);
    expect(second.global).toBe(secondHome);
    expect(first.cache).toBe(path.join(firstHome, ".cache", "agents-inc"));
    expect(second.cache).toBe(path.join(secondHome, ".cache", "agents-inc"));
  });
});

/** The setup file's `os.homedir` spy must survive `vi.restoreAllMocks()`. */
describe("the home-directory isolation survives a spec that restores every mock", () => {
  it("gives the machine's own home back when the spy is withdrawn mid-test", () => {
    vi.restoreAllMocks();

    expect(
      os.homedir(),
      "without the spy this reads the real machine, which is the state the next test must not inherit",
    ).toBe(MACHINE_HOME);
  });

  it("answers a temporary home again in the next test, rather than the machine's", () => {
    expect(
      path.dirname(os.homedir()),
      "the spy is re-installed per test, so the withdrawal above cannot outlive the test that made it",
    ).toBe(realpathSync(os.tmpdir()));
  });
});
