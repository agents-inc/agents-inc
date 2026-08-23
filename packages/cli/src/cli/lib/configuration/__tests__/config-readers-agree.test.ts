import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { writeCorruptTestConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import * as configModule from "../config.js";
import * as projectConfigModule from "../project-config.js";

/**
 * The contract every reader of `.claude-src/config.ts` owes, held here rather than in a table in a
 * report nobody re-reads.
 *
 * Two states, and telling them apart is the whole of it. A file that is NOT THERE is the legitimate
 * state `init` exists for, and answers `null`. A file that IS there and cannot be loaded is a fault,
 * and raises. Collapsing the second into the first is not a cosmetic slip — it is what let
 * `resolveSource` walk past a config naming a private marketplace and install from the public one,
 * and what let `eject` replace a config it could not read with a two-field one under an invented
 * name, reporting success (owner ruling 2026-08-20).
 *
 * **A per-reader roster is what makes this a gate rather than four specs.** The defect closed in
 * 2026-08-20 was closed once before, at `loadProjectConfigFromDir` under D-273, and re-opened
 * because a SECOND reader of the same file was written beside it with the old posture and nothing
 * compared the two. The roster below is asserted against what the two modules actually export, so a
 * fifth reader cannot land without reddening this file and forcing its author to choose.
 */
describe("every reader of .claude-src/config.ts", () => {
  /**
   * A config file that exists and cannot be EVALUATED — the state every reader below used to
   * disagree about, and the one this file exists to hold them to.
   */
  const UNEVALUATABLE_CONFIG = "invalid typescript content {{";

  let tempDir: string;
  let readDir: string;
  let emptyHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-readers-");
    readDir = path.join(tempDir, "read");
    emptyHome = path.join(tempDir, "empty-home");
    await mkdir(readDir, { recursive: true });
    await mkdir(emptyHome, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
  });

  /**
   * One reader, plus however it has to be pointed at `readDir`.
   *
   * `locate: "home"` marks the one that finds the file through `os.homedir()` instead of through an
   * argument. `os.homedir()` is spied for EVERY reader either way, not just for that one — the
   * first run of this file proved why: `loadProjectConfig` takes a directory AND falls back to the
   * home root when that directory has no config, so with the real `os.homedir()` in place its
   * absent-config case read the developer's own `~/.claude-src/config.ts` and answered a loaded
   * config. A spy rather than `process.env.HOME`, because node re-reads that variable per call and
   * bun resolves it once at startup, and this package runs its tests under both.
   */
  type ConfigReader = {
    name: string;
    locate: "argument" | "home";
    read: (dir: string) => Promise<unknown>;
  };

  const READERS = [
    {
      name: "loadProjectSourceConfig",
      locate: "argument",
      read: (dir) => configModule.loadProjectSourceConfig(dir),
    },
    {
      name: "loadGlobalSourceConfig",
      locate: "home",
      read: () => configModule.loadGlobalSourceConfig(),
    },
    {
      name: "loadProjectConfigFromDir",
      locate: "argument",
      read: (dir) => projectConfigModule.loadProjectConfigFromDir(dir),
    },
    {
      name: "loadProjectConfig",
      locate: "argument",
      read: (dir) => projectConfigModule.loadProjectConfig(dir),
    },
  ] as const satisfies readonly ConfigReader[];

  /**
   * Points the reader at `readDir` and puts the home root somewhere with no config in it, so a
   * reader that falls back to home cannot answer out of the machine this test is running on.
   */
  function isolate(reader: ConfigReader): void {
    vi.spyOn(os, "homedir").mockReturnValue(reader.locate === "home" ? readDir : emptyHome);
  }

  it("is one of the four this file holds, so a fifth cannot land untested", () => {
    const exportedReaders = [
      ...Object.keys(configModule),
      ...Object.keys(projectConfigModule),
    ].filter((exported) => exported.startsWith("load"));

    expect(
      exportedReaders.sort(),
      "a reader exported and not listed here is one nothing holds to the contract below",
    ).toStrictEqual(READERS.map((reader) => reader.name).sort());
  });

  describe.each(READERS)("$name", (reader) => {
    it("answers null for a config that is not there, which is what init exists for", async () => {
      isolate(reader);

      expect(await reader.read(readDir)).toBeNull();
    });

    it("raises for a config that is there and cannot be evaluated", async () => {
      const configPath = await writeCorruptTestConfig(readDir, UNEVALUATABLE_CONFIG);
      isolate(reader);

      await expect(reader.read(readDir)).rejects.toThrow(configPath);
    });

    it("reads a config that is there and loads, so neither answer above is unconditional", async () => {
      await writeTestTsConfig(
        readDir,
        buildProjectConfig({ name: "config-readers-fixture", marketplace: "github:acme/skills" }),
      );
      isolate(reader);

      expect(await reader.read(readDir)).not.toBeNull();
    });
  });
});
