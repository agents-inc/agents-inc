import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import fg from "fast-glob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_ROOT } from "./helpers/cli-runner.js";
import { cleanupTempDir, createTempDir, fileExists } from "./test-fs-utils.js";
import { STANDARD_FILES } from "../../consts.js";
import { sourceDir } from "../installation/install-layout.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { GlobalPairWriteViolation, writeProjectPartial } from "../config-gate/index.js";
import { regenerateConfigTypes } from "../configuration/config-types-writer.js";

/**
 * Writing the `config.ts` / `config-types.ts` pair must go through `src/cli/lib/config-gate/`.
 * Layers: barrel privacy (pinned here), lint bans, the `utils/fs.ts` runtime tripwire (pinned
 * here, unmocked), and a source scan, since a bypass names no entry point.
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

const WRITE_PRIMITIVE = /\bwriteFile(Sync)?\s*\(/;

/** The named constant, the literal filename, or the path helper resolving to `config.ts`. */
const CONFIG_PAIR_REFERENCE =
  /STANDARD_FILES\.CONFIG(_TYPES)?_TS|["'](config|config-types)\.ts["']|\bgetProjectConfigPath\b/;

/**
 * A logging call whose only argument is a template literal, e.g.
 * ``this.logSuccess(`Created ${SOURCE_DIR}/${STANDARD_FILES.CONFIG_TS}`)``. Stripped first: a name
 * printed to the user is not a path written to.
 */
const PAIR_NAME_IN_MESSAGE =
  /\b(?:this\.log\w*|this\.warn|this\.error|console\.\w+|verbose|warn)\(\s*`[^`]*`\s*[,)]/g;

/**
 * Co-occurrence of a write primitive and a pair reference in one module, since the two are usually
 * lines apart. It over-approximates; a false positive is fixed by moving the write behind the gate.
 */
function writesTheConfigPairDirectly(source: string): boolean {
  return (
    WRITE_PRIMITIVE.test(source) &&
    CONFIG_PAIR_REFERENCE.test(source.replace(PAIR_NAME_IN_MESSAGE, ""))
  );
}

/** The canonical bypass the scanner exists to catch. */
const ROGUE_SNIPPET = `
await ensureDir(path.join(projectDir, SOURCE_DIR));
await writeFile(tsConfigPath, generateConfigSource(config));
const tsConfigPath = getProjectConfigPath(projectDir);
`;

const UNRELATED_WRITE_SNIPPET = `
await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), body);
`;

const READ_ONLY_SNIPPET = `
const configPath = getProjectConfigPath(projectDir);
return loadProjectConfigFromDir(path.dirname(configPath));
`;

/** Unrelated writes, and the pair named only in what the command prints. */
const LOGS_THE_PAIR_NAME_SNIPPET = `
await writeFile(readmePath, readmeContent);
this.logSuccess(\`Created \${SOURCE_DIR}/\${STANDARD_FILES.CONFIG_TS}\`);
this.warn(\`Could not update \${STANDARD_FILES.CONFIG_TYPES_TS}: \${getErrorMessage(error)}\`);
`;

/** Proves the message strip cannot hide a write behind a nearby log line. */
const ROGUE_PLUS_LOG_SNIPPET = `
this.logSuccess(\`Created \${SOURCE_DIR}/\${STANDARD_FILES.CONFIG_TS}\`);
const tsConfigPath = getProjectConfigPath(projectDir);
await writeFile(tsConfigPath, source);
`;

/**
 * The gate's private files, by static or dynamic import: a dynamic import of `pair-writer` is a
 * full bypass. A specifier assembled at runtime defeats this; the runtime spec below covers it.
 */
const GATE_PRIVATE_IMPORT =
  /(?:from\s+|import\s*\(\s*)["'][^"']*config-gate\/(pair-writer|gate-token)(\.js)?["']/;

/** Enforcement guards that import gate privates; neither writes the pair. */
const GATE_PRIVATE_IMPORT_ALLOWED = [
  // Holds the tripwire; needs `assertGateToken`.
  "src/cli/utils/fs.ts",
  // Refuses a home-directory types write by name; needs `GlobalPairWriteViolation`.
  "src/cli/lib/configuration/config-types-io.ts",
];

/**
 * `config-types-io.ts` writes the types half behind the gate; `utils/fs.ts` names the pair in order
 * to refuse it.
 */
const PRIVILEGED_ZONE = [
  "src/cli/lib/config-gate/**",
  "src/cli/lib/configuration/config-types-io.ts",
  "src/cli/utils/fs.ts",
];

async function productionSourceFiles(extraIgnores: string[] = []): Promise<string[]> {
  return fg(["src/**/*.ts", "src/**/*.tsx"], {
    cwd: CLI_ROOT,
    ignore: [
      ...extraIgnores,
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "src/cli/types/generated/**",
    ],
  });
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

  /** Keeps the lists above non-vacuous: a dead row still looks alive. */
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

  /**
   * Static layers can be defeated, so the private writer is reached directly and called: no
   * `pair-writer` function opens the token, so it must refuse. The whole real path, unmocked.
   */
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

  describe("no production module writes the config pair itself", () => {
    // Self-test: a predicate answering `false` to everything would pass the scan silently.
    it("flags the canonical rogue snippet", () => {
      expect(writesTheConfigPairDirectly(ROGUE_SNIPPET)).toBe(true);
    });

    it("ignores a write primitive that names no part of the pair", () => {
      expect(writesTheConfigPairDirectly(UNRELATED_WRITE_SNIPPET)).toBe(false);
    });

    it("ignores a pair reference with no write primitive", () => {
      expect(writesTheConfigPairDirectly(READ_ONLY_SNIPPET)).toBe(false);
    });

    it("ignores a pair name that is only printed at the user", () => {
      expect(writesTheConfigPairDirectly(LOGS_THE_PAIR_NAME_SNIPPET)).toBe(false);
    });

    it("still flags a real write in a module that also prints the pair name", () => {
      expect(writesTheConfigPairDirectly(ROGUE_PLUS_LOG_SNIPPET)).toBe(true);
    });

    it("finds no bypass in src/", async () => {
      const files = await productionSourceFiles(PRIVILEGED_ZONE);
      expect(files.length, "the scan must have something to scan").toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const file of files) {
        const source = await readFile(path.join(CLI_ROOT, file), "utf-8");
        if (writesTheConfigPairDirectly(source)) offenders.push(file);
      }

      expect(
        offenders.sort(),
        "every config-pair write must go through config-gate/",
      ).toStrictEqual([]);
    });
  });

  describe("the gate's private files are imported only from inside it", () => {
    it("flags an import of a private gate file", () => {
      expect(
        GATE_PRIVATE_IMPORT.test(`import { withGateToken } from "../config-gate/gate-token.js";`),
      ).toBe(true);
    });

    it("flags a dynamic import of a private gate file", () => {
      expect(
        GATE_PRIVATE_IMPORT.test(`const w = await import("../config-gate/pair-writer.js");`),
      ).toBe(true);
    });

    it("ignores an import of the gate's public index", () => {
      expect(
        GATE_PRIVATE_IMPORT.test(`import { mutateGlobal } from "../config-gate/index.js";`),
      ).toBe(false);
    });

    it("ignores a dynamic import of the gate's public index", () => {
      expect(
        GATE_PRIVATE_IMPORT.test(`const gate = await import("../config-gate/index.js");`),
      ).toBe(false);
    });

    it("only the two documented enforcement guards reach past the index", async () => {
      const files = await productionSourceFiles(["src/cli/lib/config-gate/**"]);

      const importers: string[] = [];
      for (const file of files) {
        const source = await readFile(path.join(CLI_ROOT, file), "utf-8");
        if (GATE_PRIVATE_IMPORT.test(source)) importers.push(file);
      }

      expect(
        importers.sort(),
        "config-gate/ is private except index.ts — the only exceptions are the enforcement guards",
      ).toStrictEqual([...GATE_PRIVATE_IMPORT_ALLOWED].sort());
    });
  });
});
