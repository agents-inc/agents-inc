import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it, vi } from "vitest";

import { cacheRoot, globalInstallRoot } from "../../consts.js";
import { frozenHomeConstantsIn } from "./helpers/frozen-home-declarations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every module the CLI's own source tree holds — the population the declaration gate reads. */
const EVERY_CLI_MODULE = "src/cli/**/*.{ts,tsx}";

/**
 * A floor under the scan, not a census. A glob that matched nothing would report a clean roster
 * for a tree full of modules, and the judgement below would hold for exactly that reason.
 */
const MODULES_THE_TREE_HOLDS = 200;

/**
 * The home the machine actually has, read at this module's load — before any hook has pointed
 * HOME anywhere else, and before any assertion below runs.
 *
 * It is the discriminator the withdrawal pin needs: with the setup file's spy in force
 * `os.homedir()` answers a directory under `os.tmpdir()`, and without it, this. Node's
 * `os.homedir()` reads `$HOME` per call on POSIX, so an assertion made while HOME points at a
 * fake home cannot tell the two apart — which is why the pins below deliberately leave HOME
 * alone.
 */
const MACHINE_HOME = os.homedir();

/**
 * Nothing in the CLI's source freezes the home directory at the moment its module is imported.
 *
 * Two constants did — `CACHE_DIR` and `GLOBAL_INSTALL_ROOT`, both in `consts.ts` — and the
 * damage was invisible to every behavioural spec in the suite. `runCliCommand` drives oclif
 * through `dist/`, which is a SECOND module graph: it is first imported by whichever spec in a
 * file runs a command first, so the value settled on that spec's fake home, and every later
 * spec in the same file read and wrote under a directory its own `afterEach` had removed. The
 * writes succeeded. Two large specs had already grown `Object.defineProperty(consts, …)`
 * workarounds around `GLOBAL_INSTALL_ROOT` without the shape itself ever being named.
 *
 * A shape gate rather than a behavioural one, because the property is about DECLARATIONS: a
 * spec proving that today's two constants follow the home says nothing about the third one
 * somebody adds. The recogniser is `helpers/frozen-home-declarations.ts` and it carries its own
 * tests — this assertion is one of absence, and an absence proves nothing about a reader that
 * has never condemned anything.
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

/**
 * The two constants that carried the class, read the way a second command in the same run reads
 * them: after the home has moved.
 *
 * A frozen constant cannot be caught by asking it once — the first read is always correct. Both
 * assertions therefore move HOME between two reads of the SAME loaded module, which is the
 * arrangement `runCliCommand` produces for free and no single-read assertion can see.
 */
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
 * The setup file's `os.homedir` spy survives a spec that restores all mocks.
 *
 * It was installed in a `beforeAll`, so a single `vi.restoreAllMocks()` — which twenty-three
 * specs in this package call from an `afterEach` — withdrew it for every LATER test in that
 * file, after which `os.homedir()` answered from the developer's own machine. That is how a
 * unit test came to read a real `~/.claude-src/config.ts` and pass on it.
 *
 * **The two cases are one claim read from both ends and neither means anything alone.** The
 * second is an assertion that isolation held, and isolation holding proves nothing unless the
 * withdrawal it survived actually happened: a `restoreAllMocks` that reached no spy would
 * satisfy it for free. The first case is that subject guard — it withdraws the spy and shows
 * the machine's own home coming back through, which is what makes the second a re-installation
 * rather than a mock that was never removed.
 *
 * Neither case touches HOME, and that is load-bearing: node re-reads `$HOME` per call, so with
 * a fake home exported these two would answer identically whether or not the spy was there.
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
