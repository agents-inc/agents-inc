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
 * Every reader of a `config.ts`: an absent file answers `null`, a present unloadable one throws.
 * Asserted against the modules' exports, so a new reader cannot land without joining the roster.
 */
describe("every reader of an agents-inc config.ts", () => {
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

  /** `os.homedir()` is spied for every reader: `loadProjectConfig` falls back to the home root. */
  type ConfigReader = {
    name: string;
    locate: "argument" | "home";
    /** Set for the source-repo reader, whose file sits in no provider folder. */
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
      // Falls back to the global config for a project config declaring nothing, as for none.
      name: "loadConfigInPlay",
      locate: "argument",
      read: (dir) => projectConfigModule.loadConfigInPlay(dir),
    },
    {
      // Reads the provider off the directory; a dir with no installation must still answer `null`.
      name: "loadInstalledConfig",
      locate: "argument",
      read: (dir) => projectConfigModule.loadInstalledConfig(dir),
    },
    {
      // At a path only the caller knows.
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
      // A source repo's own declaration: `<dir>/.agents-inc/config.ts`, with no provider folder.
      name: "loadSourceRepoConfig",
      locate: "argument",
      // A literal, so the assertion cannot move with the product's constant.
      sourceFolder: ".agents-inc",
      read: (dir) => configModule.loadSourceRepoConfig(dir),
    },
  ] as const satisfies readonly ConfigReader[];

  /** Home points somewhere empty, so a home fallback cannot read this machine's config. */
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

  /** Two more present-but-unusable shapes, both passing the settings schema. */
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
