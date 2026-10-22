import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDir, createTempDir, fileExists } from "./test-fs-utils.js";
import { STANDARD_FILES } from "../../consts.js";
import { sourceDir } from "../installation/install-layout.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { GlobalPairWriteViolation, writeProjectPartial } from "../config-gate/index.js";
import { regenerateConfigTypes } from "../configuration/config-types-writer.js";

/**
 * Writing the `config.ts` / `config-types.ts` pair must go through `src/cli/lib/config-gate/`.
 * `config-gate-has-no-bypass-in-src.test.ts` holds the source tree to the same rule.
 */

/** Pair writers the barrel must not re-export; each must be declared in `src/` to mean anything. */
const INSTALLATION_RAW_WRITERS = [
  "writeConfigFile",
  "writeConfigByScope",
  "propagateGlobalChangesToProjects",
  "pruneGlobalEntriesFromRegisteredProjects",
  "writeScopeConfigTypes",
] as const;

const CONFIGURATION_RAW_WRITERS = [
  "generateConfigSource",
  "generateConfigTypesSource",
  "regenerateConfigTypes",
  "writeProjectPartial",
] as const;

/** A retired name: the self-test for the declared-name check below. */
const A_NAME_NOTHING_DECLARES = "writeScopedConfigs";

/**
 * Every export of the modules declaring the listed names, so a row naming nothing (which can never
 * fail) is caught. The specifiers are literals: a variable specifier imports as `any`.
 */
async function rawWriterOwnerExports(): Promise<Set<string>> {
  const owners = await Promise.all([
    import("../config-gate/index.js"),
    import("../config-gate/propagate.js"),
    import("../configuration/config-writer.js"),
    import("../configuration/config-types-writer.js"),
  ]);

  return new Set(owners.flatMap((module) => Object.keys(module)));
}

describe("config-gate enforcement", () => {
  describe("public barrels expose no raw config writer", () => {
    it("the installation barrel re-exports none of them", async () => {
      const barrel = await import("../installation/index.js");
      const leaked = INSTALLATION_RAW_WRITERS.filter((name) => name in barrel);

      expect(
        leaked,
        "raw pair writers must be reachable only from config-gate, never from the installation barrel",
      ).toStrictEqual([]);
    });

    it("the configuration barrel re-exports none of them", async () => {
      const barrel = await import("../configuration/index.js");
      const leaked = CONFIGURATION_RAW_WRITERS.filter((name) => name in barrel);

      expect(
        leaked,
        "raw pair writers must be reachable only from config-gate, never from the configuration barrel",
      ).toStrictEqual([]);
    });
  });

  describe("every guarded name is a symbol something declares", () => {
    // Self-test: a resolver answering "declared" to everything would pass silently.
    it("does not resolve a name nothing declares", async () => {
      expect(await rawWriterOwnerExports()).not.toContain(A_NAME_NOTHING_DECLARES);
    });

    it("resolves every name in both guard lists", async () => {
      const declared = await rawWriterOwnerExports();
      const guarded = [...INSTALLATION_RAW_WRITERS, ...CONFIGURATION_RAW_WRITERS];

      expect(guarded.length, "the check must have something to check").toBeGreaterThan(0);
      expect(
        guarded.filter((name) => !declared.has(name)),
        "a guarded name nothing exports can never fail — replace it with the live entry point that took its place",
      ).toStrictEqual([]);
    });
  });

  /** `vi.importActual`, because the manual mock replaces `writeFile` with a `vi.fn()`. */
  describe("the write primitive refuses the global pair without the gate's token", () => {
    let tempHome: string;
    let realWriteFile: (filePath: string, content: string) => Promise<void>;

    beforeEach(async () => {
      tempHome = await createTempDir("cc-gate-tripwire-");
      await mkdir(sourceDir(tempHome, "claude"), { recursive: true });
      vi.spyOn(os, "homedir").mockReturnValue(tempHome);
      ({ writeFile: realWriteFile } =
        await vi.importActual<typeof import("../../utils/fs.js")>("../../utils/fs.js"));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTempDir(tempHome);
    });

    const pairPath = (file: string) => path.join(sourceDir(tempHome, "claude"), file);

    it.each([
      ["the config half", STANDARD_FILES.CONFIG_TS],
      ["the types half", STANDARD_FILES.CONFIG_TYPES_TS],
    ])("throws on %s when no token is held", async (_label, file) => {
      await expect(realWriteFile(pairPath(file), "rogue")).rejects.toThrow(
        "may only be written through config-gate",
      );
    });

    it.each([
      ["the config half", STANDARD_FILES.CONFIG_TS],
      ["the types half", STANDARD_FILES.CONFIG_TYPES_TS],
    ])("writes %s inside withGateToken", async (_label, file) => {
      await withGateToken(async () => {
        await realWriteFile(pairPath(file), "gated");
      });

      expect(await readFile(pairPath(file), "utf-8")).toBe("gated");
    });

    it("leaves every other file alone", async () => {
      const unrelated = path.join(sourceDir(tempHome, "claude"), "notes.md");
      await realWriteFile(unrelated, "fine");

      expect(await readFile(unrelated, "utf-8")).toBe("fine");
    });
  });

  /** No `pair-writer` function opens the token, so a direct call must refuse. */
  describe("the gate's private pair writer refuses a caller that reached it directly", () => {
    let tempHome: string;

    beforeEach(async () => {
      tempHome = await createTempDir("cc-gate-private-writer-");
      await mkdir(sourceDir(tempHome, "claude"), { recursive: true });
      vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTempDir(tempHome);
    });

    it("writeGlobalConfigHalf throws GlobalPairWriteViolation when called outside the gate", async () => {
      const { writeGlobalConfigHalf } = await import("../config-gate/pair-writer.js");
      const configPath = path.join(sourceDir(tempHome, "claude"), STANDARD_FILES.CONFIG_TS);

      await expect(
        writeGlobalConfigHalf({ name: "rogue", skills: [], agents: [] }, configPath),
        "a dynamic import of the private writer must not confer the write privilege",
      ).rejects.toThrow(GlobalPairWriteViolation);
    });

    it("leaves the global config half unwritten when the call is refused", async () => {
      const { writeGlobalConfigHalf } = await import("../config-gate/pair-writer.js");
      const configPath = path.join(sourceDir(tempHome, "claude"), STANDARD_FILES.CONFIG_TS);

      await writeGlobalConfigHalf({ name: "rogue", skills: [], agents: [] }, configPath).catch(
        () => undefined,
      );

      expect(await fileExists(configPath), "the refused call must leave no config.ts behind").toBe(
        false,
      );
    });
  });

  /** At `$HOME` the file they would write is the global manifest, unclassified and unpaired. */
  describe("directory-taking entry points refuse the home directory", () => {
    let tempHome: string;

    beforeEach(async () => {
      tempHome = await createTempDir("cc-gate-home-refusal-");
      vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTempDir(tempHome);
    });

    it("writeProjectPartial throws", async () => {
      await expect(
        writeProjectPartial(tempHome, { marketplace: "github:x/y" }, { fallbackName: "home" }),
      ).rejects.toThrow("may only be written through config-gate");
    });

    it("regenerateConfigTypes throws before it awaits its background data", async () => {
      const neverLoads = new Promise<never>(() => {});

      await expect(regenerateConfigTypes(tempHome, neverLoads)).rejects.toThrow(
        "may only be written through config-gate",
      );
    });
  });
});
