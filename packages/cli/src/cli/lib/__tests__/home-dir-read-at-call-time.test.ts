import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it, vi } from "vitest";

import { cacheRoot, globalInstallRoot } from "../../consts.js";
import { frozenHomeConstantsIn } from "./helpers/frozen-home-declarations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EVERY_CLI_MODULE = "src/cli/**/*.{ts,tsx}";

/** A floor, not a census: a glob matching nothing would report a clean roster. */
const MODULES_THE_TREE_HOLDS = 200;

/**
 * Read at load, before any HOME change. With the setup spy `os.homedir()` answers under
 * `os.tmpdir()`, without it this; the pins below leave HOME alone as node re-reads it per call.
 */
const MACHINE_HOME = os.homedir();

/**
 * `runCliCommand` drives a second module graph through `dist/`, so a home-derived constant frozen
 * at import settles on the first spec's fake home. A shape gate, so a new constant is caught too;
 * the recogniser `helpers/frozen-home-declarations.ts` carries its own tests.
 */
describe("no constant in the CLI's source freezes the home directory at import", () => {
  it("names no exported constant derived from os.homedir(), across every module", async () => {
    const files = await fg(EVERY_CLI_MODULE, { cwd: CLI_ROOT });
    expect(
      files.length,
      "a glob matching nothing would report a clean tree without reading one",
    ).toBeGreaterThan(MODULES_THE_TREE_HOLDS);

    const frozen = (
      await Promise.all(
        files.sort().map(async (file) => {
          const source = await readFile(path.join(CLI_ROOT, file), "utf8");
          return frozenHomeConstantsIn(source).map((name) => `${file}:${name}`);
        }),
      )
    ).flat();

    expect(
      frozen,
      "a constant derived from os.homedir() freezes whichever home its module was first imported under — export a function instead, as globalInstallRoot() and cacheRoot() do",
    ).toStrictEqual([]);
  });
});

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

/**
 * The setup file's `os.homedir` spy must survive `vi.restoreAllMocks()`. The first case withdraws
 * it and sees the machine's home (subject guard); the second sees it re-installed. Neither touches
 * HOME.
 */
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
    ).toBe(os.tmpdir());
  });
});
