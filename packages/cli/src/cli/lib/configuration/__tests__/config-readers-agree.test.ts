import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { writeRawTestConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { renderSchemaViolatingConfigTs } from "../../__tests__/factories/unloadable-config-factories.js";
import * as configModule from "../config.js";
import * as projectConfigModule from "../project-config.js";

/**
 * The contract every reader of an agents-inc `config.ts` owes, held here rather than in a table in
 * a report nobody re-reads. All but one read an INSTALLATION's config, wherever the scope keeps
 * it; that one reads a marketplace source repo's own declaration, which is a different file and is
 * why `sourceFolder` is a field of the roster below rather than one fixture path for all.
 *
 * Two states, and telling them apart is the whole of it. A file that is NOT THERE is the legitimate
 * state `init` exists for, and answers `null`. A file that IS there and cannot be loaded is a fault,
 * and raises. Collapsing the second into the first is not a cosmetic slip — it is what let
 * `resolveSource` walk past a config naming a private marketplace and install from the public one,
 * and what let `eject` replace a config it could not read with a two-field one under an invented
 * name, reporting success (owner ruling 2026-08-20).
 *
 * **A per-reader roster is what makes this a gate rather than a spec per reader.** The defect
 * closed in 2026-08-20 was closed once before, at `loadProjectConfigFromDir` under D-273, and
 * re-opened because a SECOND reader of the same file was written beside it with the old posture and
 * nothing compared the two. The roster below is asserted against what the two modules actually
 * export, so a new reader cannot land without reddening this file and forcing its author to choose.
 */
describe("every reader of an agents-inc config.ts", () => {
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
   * absent-config case read the developer's own global config and answered a loaded
   * config. A spy rather than `process.env.HOME`, because node re-reads that variable per call and
   * bun resolves it once at startup, and this package runs its tests under both.
   */
  type ConfigReader = {
    name: string;
    locate: "argument" | "home";
    /**
     * The folder under the scope root this reader's file lives in, or `undefined` for those that
     * read an INSTALLATION's config and therefore take whichever folder the scope is on.
     *
     * Stated per reader rather than assumed shared, because one of them is not: a marketplace
     * source repo declares its layout at `.agents-inc/config.ts`, with no provider folder after
     * it, and a fixture written where an installation's config goes is a file it never opens — so
     * both of its fault cases would answer `null` and read as the absent case passing.
     */
    sourceFolder?: string;
    read: (dir: string) => Promise<unknown>;
  };

  /** A folder the resolver never picks, so only a reader told the path finds the fixture. */
  const CALLER_NAMED_FOLDER = "named-by-the-caller";

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
      read: (dir) => projectConfigModule.loadProjectConfigFromDir(dir, "claude"),
    },
    {
      name: "loadProjectConfig",
      locate: "argument",
      read: (dir) => projectConfigModule.loadProjectConfig(dir),
    },
    {
      // The sibling of `loadProjectConfigFromDir` that READS the provider off the directory
      // rather than being told one. It owes the same two answers, and its absent case is the
      // one that would hide a resolution bug: a directory holding no installation at all still
      // has to answer `null` rather than a config out of some other folder.
      name: "loadInstalledConfig",
      locate: "argument",
      read: (dir) => projectConfigModule.loadInstalledConfig(dir),
    },
    {
      // `loadProjectConfigFromDir` at a path the caller names, which the resolver never picks —
      // so the fixture goes in a folder only the caller knows.
      name: "loadProjectConfigAt",
      locate: "argument",
      sourceFolder: CALLER_NAMED_FOLDER,
      read: (dir) =>
        projectConfigModule.loadProjectConfigAt(
          path.join(dir, CALLER_NAMED_FOLDER, "config.ts"),
          dir,
          "claude",
        ),
    },
    {
      // A marketplace source repo's own declaration, which reads a DIFFERENT file from the readers
      // above — `<dir>/.agents-inc/config.ts`, not inside a provider folder — and owes the same two answers about it.
      name: "loadSourceRepoConfig",
      locate: "argument",
      // A literal: the folder is text on a marketplace author's disk, and an assertion that
      // imported the constant the product reads would move with it and could never fail.
      sourceFolder: ".agents-inc",
      read: (dir) => configModule.loadSourceRepoConfig(dir),
    },
  ] as const satisfies readonly ConfigReader[];

  /**
   * Points the reader at `readDir` and puts the home root somewhere with no config in it, so a
   * reader that falls back to home cannot answer out of the machine this test is running on.
   */
  function isolate(reader: ConfigReader): void {
    vi.spyOn(os, "homedir").mockReturnValue(reader.locate === "home" ? readDir : emptyHome);
  }

  it("is one of the readers this file holds, so a new one cannot land untested", () => {
    const exportedReaders = [
      ...Object.keys(configModule),
      ...Object.keys(projectConfigModule),
    ].filter((exported) => exported.startsWith("load"));

    expect(
      exportedReaders.sort(),
      "a reader exported and not listed here is one nothing holds to the contract below",
    ).toStrictEqual(READERS.map((reader) => reader.name).sort());
  });

  describe.each<ConfigReader>(READERS)("$name", (reader) => {
    it("answers null for a config that is not there, which is what init exists for", async () => {
      isolate(reader);

      expect(await reader.read(readDir)).toBeNull();
    });

    it("raises for a config that is there and cannot be evaluated", async () => {
      const configPath = await writeRawTestConfig(
        readDir,
        UNEVALUATABLE_CONFIG,
        reader.sourceFolder,
      );
      isolate(reader);

      await expect(reader.read(readDir)).rejects.toThrow(configPath);
    });

    it("reads a config that is there and loads, so neither answer above is unconditional", async () => {
      await writeTestTsConfig(
        readDir,
        buildProjectConfig({ name: "config-readers-fixture", marketplace: "github:acme/skills" }),
        reader.sourceFolder,
      );
      isolate(reader);

      expect(await reader.read(readDir)).not.toBeNull();
    });
  });

  /**
   * The two other ways an installation's config can be there and unusable, held for every reader
   * of an INSTALLATION's config. The source repo's declaration is left out: it is a different file
   * read against a different schema, and whether these shapes are faults there is its own question.
   *
   * Both pass the settings schema, which declares only the settings fields and lets the rest
   * through — so a reader judging the file by that schema alone reads the empty one as absence and
   * the other as a usable marketplace, while the installation loader refuses both.
   */
  const INSTALLATION_READERS = READERS.filter(
    (reader: ConfigReader) => reader.sourceFolder === undefined,
  );

  /** A config that exports nothing at all — what `: > config.ts` leaves behind. */
  const EXPORTS_NOTHING = "";

  describe.each<ConfigReader>(INSTALLATION_READERS)("$name, reading an installation", (reader) => {
    it("raises for a config that is there and exports nothing, which is not the same as absent", async () => {
      const configPath = await writeRawTestConfig(readDir, EXPORTS_NOTHING);
      isolate(reader);

      await expect(reader.read(readDir)).rejects.toThrow(configPath);
    });

    it("raises for a config naming a marketplace beside a field the installation schema refuses", async () => {
      const configPath = await writeRawTestConfig(
        readDir,
        renderSchemaViolatingConfigTs("github:acme/skills"),
      );
      isolate(reader);

      await expect(reader.read(readDir)).rejects.toThrow(configPath);
    });
  });
});
