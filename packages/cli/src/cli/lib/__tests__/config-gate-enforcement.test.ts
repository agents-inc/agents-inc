import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import fg from "fast-glob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_ROOT } from "./helpers/cli-runner.js";
import { cleanupTempDir, createTempDir, fileExists } from "./test-fs-utils.js";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../consts.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { GlobalPairWriteViolation, writeProjectPartial } from "../config-gate/index.js";
import { regenerateConfigTypes } from "../configuration/config-types-writer.js";

/**
 * Enforcement guards for the config gate: writing the `config.ts` /
 * `config-types.ts` pair must go through `src/cli/lib/config-gate/` and nowhere
 * else.
 *
 * There are four layers, and this file is the one that holds them in place:
 *
 *   L1 MODULE PRIVACY — the barrels expose no raw pair writer, so reaching one
 *      is a compile error rather than an import away. Pinned by the two barrel
 *      specs below, which would catch a re-export added back for convenience.
 *   L2 ESLINT — `eslint.config.js` bans importing the gate's private files, the
 *      raw filesystem write primitives, and the pair-source renderers. Enforced
 *      by the linter, not from here.
 *   L3 RUNTIME TRIPWIRE — `utils/fs.ts` resolves every write target and refuses
 *      the two pair paths unless the caller holds the gate's token. Pinned by
 *      the tripwire specs, which run the real module: a mocked `utils/fs` has no
 *      tripwire in it, so a spec asserting on the guard must not be looking at
 *      one.
 *   L4 THIS FILE — plus a source scan, because the three layers above all guard
 *      a named entry point and a bypass is written by not naming one.
 *
 * The layers overlap on purpose. Defeating one is a mistake; defeating all four
 * takes deliberate work that reads as deliberate in review.
 */

/**
 * `installation/index.ts` used to re-export these. Every one of them writes, or
 * drives a write of, some part of the config pair — `writeConfigFile` writes it
 * directly; the propagation and prune functions write it into every registered
 * project; `writeScopedFromWizard` writes both halves from a wizard result and
 * `writeScopeConfigTypes` writes the types half alone; `deregisterProjectPath`
 * rewrites the global config to drop a registration. The gate is their only caller
 * and none of them is part of the barrel's public surface.
 *
 * Every name below is declared in `src/` — checked by grep, and the only thing that
 * makes a row mean anything. A row for a name nothing declares cannot fail: it
 * guards against a re-export that no file could write. Two such rows were removed
 * here, each replaced by the live entry point that took the old one's place —
 * `writeScopedConfigs` by `writeScopedFromWizard`, and `regenerateScopeConfigTypes`
 * by `writeScopeConfigTypes`. Both survive as positional-argument shims inside
 * `local-installer.test.ts`, which is why the dead names still grep to something.
 */
const INSTALLATION_RAW_WRITERS = [
  "writeConfigFile",
  "writeScopedFromWizard",
  "propagateGlobalChangesToProjects",
  "pruneGlobalEntriesFromRegisteredProjects",
  "writeScopeConfigTypes",
  "deregisterProjectPath",
] as const;

/**
 * `configuration/index.ts` used to re-export these. `generateConfigSource` and
 * `generateConfigTypesSource` render the two halves of the pair;
 * `regenerateConfigTypes` and `writeProjectPartial` render AND write. The last row
 * named `saveSourceToProjectConfig`, which nothing declares any more —
 * `writeProjectPartial` replaced it, and only a live name can catch a leak.
 */
const CONFIGURATION_RAW_WRITERS = [
  "generateConfigSource",
  "generateConfigTypesSource",
  "regenerateConfigTypes",
  "writeProjectPartial",
] as const;

/**
 * A name the guard lists carried until CLI-434, replaced there by
 * `writeScopedFromWizard`. Held here rather than in a list because it is the
 * self-test for the check below — the shape it exists to catch — and because a
 * future export under this spelling should fail loudly rather than quietly
 * revive a row nobody re-derived.
 */
const A_NAME_NOTHING_DECLARES = "writeScopedConfigs";

/**
 * Every symbol exported by the four modules that legitimately declare the names
 * in the two lists above — the only reason a row in either list means anything.
 *
 * Both guards are lists of STRINGS filtered against a barrel's exports, so a row
 * naming something nothing declares can never fail: no file can re-export a
 * symbol that does not exist. It is a permanently-green row that reads, to
 * anyone scanning the list, exactly like the live ones beside it. CLI-434 found
 * three such rows out of ten, and `grep` had endorsed two of them — both still
 * grep to a live function declaration inside `local-installer.test.ts`, which
 * keeps positional-argument shims under the old spellings.
 *
 * Importing the owners is what `grep` cannot do: a renamed export drops out of
 * this union the moment it is renamed, however many places the old spelling
 * survives. The specifiers are literals rather than a list, because a dynamic
 * import of a variable specifier resolves to `any` and takes the type-checking
 * with it.
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

/** A filesystem write primitive: `writeFile(` or `writeFileSync(`. */
const WRITE_PRIMITIVE = /\bwriteFile(Sync)?\s*\(/;

/**
 * A reference to either half of the config pair: the named-constant form, the
 * literal filename, or the path helper that resolves to `config.ts`.
 */
const CONFIG_PAIR_REFERENCE =
  /STANDARD_FILES\.CONFIG(_TYPES)?_TS|["'](config|config-types)\.ts["']|\bgetProjectConfigPath\b/;

/**
 * A whole logging call whose only argument is a template literal, e.g.
 * ``this.logSuccess(`Created ${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`)``.
 *
 * Removed before the pair-reference test because a name printed at the user is
 * not a path written to. This narrows the scan without loosening it: the text it
 * removes is an argument to a log call, and a write target never is. It also
 * cannot rot the way a per-file allowlist would — a module that later gains a
 * real pair write is still flagged, because that write is not inside a log call.
 */
const PAIR_NAME_IN_MESSAGE =
  /\b(?:this\.log\w*|this\.warn|this\.error|console\.\w+|verbose|warn)\(\s*`[^`]*`\s*[,)]/g;

/**
 * Co-occurrence check: a module that both reaches for a write primitive AND
 * names the config pair is writing the pair itself.
 *
 * Co-occurrence rather than a single pattern on purpose. The write and the path
 * are routinely several lines apart (`const p = getProjectConfigPath(dir)` …
 * `await writeFile(p, source)`), so no single-line regex catches the real shape,
 * and a file-level conjunction needs no parsing to be right about the case that
 * matters. It still over-approximates: a module that writes an unrelated file
 * and separately builds a pair path for a read is flagged too. That is the
 * correct trade for a guard whose job is to make bypasses impossible to add
 * quietly — the fix for a false positive is to move the write behind the gate or
 * to stop naming the pair, both of which are improvements.
 */
function writesTheConfigPairDirectly(source: string): boolean {
  return (
    WRITE_PRIMITIVE.test(source) &&
    CONFIG_PAIR_REFERENCE.test(source.replace(PAIR_NAME_IN_MESSAGE, ""))
  );
}

/** The canonical bypass the scanner exists to catch (the shape at eject.ts). */
const ROGUE_SNIPPET = `
await ensureDir(path.join(projectDir, CLAUDE_SRC_DIR));
await writeFile(tsConfigPath, generateConfigSource(config));
const tsConfigPath = getProjectConfigPath(projectDir);
`;

/** A write primitive with no config-pair reference anywhere in the module. */
const UNRELATED_WRITE_SNIPPET = `
await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), body);
`;

/** A config-pair reference with no write primitive anywhere in the module. */
const READ_ONLY_SNIPPET = `
const configPath = getProjectConfigPath(projectDir);
return loadProjectConfigFromDir(path.dirname(configPath));
`;

/**
 * The shape of the two commands the scan used to over-approximate: unrelated
 * writes, and the pair named only in what the command prints (`new marketplace`,
 * `new skill`).
 */
const LOGS_THE_PAIR_NAME_SNIPPET = `
await writeFile(readmePath, readmeContent);
this.logSuccess(\`Created \${CLAUDE_SRC_DIR}/\${STANDARD_FILES.CONFIG_TS}\`);
this.warn(\`Could not update \${STANDARD_FILES.CONFIG_TYPES_TS}: \${getErrorMessage(error)}\`);
`;

/**
 * A real bypass in a module that ALSO prints the pair's name. Proves the message
 * strip cannot be used to hide a write behind a nearby log line.
 */
const ROGUE_PLUS_LOG_SNIPPET = `
this.logSuccess(\`Created \${CLAUDE_SRC_DIR}/\${STANDARD_FILES.CONFIG_TS}\`);
const tsConfigPath = getProjectConfigPath(projectDir);
await writeFile(tsConfigPath, source);
`;

/**
 * The gate's private files, named by a static import or a dynamic one. Reaching
 * either is reaching past the classification (`pair-writer`) or forging the
 * write privilege itself (`gate-token`).
 *
 * Both forms, because they are equally effective: `pair-writer`'s functions open
 * the write token themselves, so a dynamic import of that module is a complete
 * bypass — it satisfies the runtime tripwire rather than tripping it. That form
 * is stopped statically (eslint's `no-restricted-syntax`) and here; a specifier
 * assembled at runtime defeats both, and is the documented residual.
 */
const GATE_PRIVATE_IMPORT =
  /(?:from\s+|import\s*\(\s*)["'][^"']*config-gate\/(pair-writer|gate-token)(\.js)?["']/;

/**
 * The two files outside `config-gate/` that may import its privates, and why.
 * Both are enforcement guards; neither writes the pair. `gate-token.ts` imports
 * nothing but `node:async_hooks`, so neither import can cycle back into the gate.
 */
const GATE_PRIVATE_IMPORT_ALLOWED = [
  // Holds the L3 tripwire; needs `assertGateToken`.
  "src/cli/utils/fs.ts",
  // Refuses a home-directory types write by name; needs `GlobalPairWriteViolation`.
  "src/cli/lib/configuration/config-types-writer.ts",
];

/**
 * The privileged zone: the gate, plus the two modules that must name the pair to
 * do their job.
 *
 * `config-types-writer.ts` renders AND writes the types half — it is the
 * implementation the gate deep-imports. Eslint (L2c) keeps every other caller
 * off it, and its own first line refuses the home directory.
 *
 * `utils/fs.ts` names the pair in order to REFUSE it: it holds the L3 tripwire,
 * and a guard that compares a write target against the pair's paths necessarily
 * mentions them. It is the choke point the scan protects, not a bypass of it.
 *
 * `config-writer.ts` is deliberately absent: it no longer writes anything, so it
 * drops out of the scan on its own rather than by exemption.
 */
const PRIVILEGED_ZONE = [
  "src/cli/lib/config-gate/**",
  "src/cli/lib/configuration/config-types-writer.ts",
  "src/cli/utils/fs.ts",
];

/** Production sources the gate must own, excluding the privileged zone and tests. */
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

  /**
   * The check that keeps the two lists above non-vacuous. Without it the guards
   * degrade one row at a time and every row still looks alive, which is worse
   * than having no guard: this file's name promises enforcement.
   */
  describe("every guarded name is a symbol something declares", () => {
    // Self-test: the union is only evidence about the lists if it is first
    // evidence about itself. A resolver that answered "declared" to everything
    // would make the assertion below pass silently.
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

  /**
   * The layer that makes the ruling literal rather than procedural. Every write
   * in the CLI funnels through `utils/fs.writeFile`, which resolves its target
   * and refuses the two pair paths without the gate's token — so a bypass dies
   * at its first execution regardless of how it reached the primitive.
   *
   * `vi.importActual` on purpose: `src/cli/utils/__mocks__/fs.ts` replaces
   * `writeFile` with a `vi.fn()`, and a spec that asserted on the guard while
   * holding the mock would be asserting on nothing.
   */
  describe("the write primitive refuses the global pair without the gate's token", () => {
    let tempHome: string;
    let realWriteFile: (filePath: string, content: string) => Promise<void>;

    beforeEach(async () => {
      tempHome = await createTempDir("cc-gate-tripwire-");
      await mkdir(path.join(tempHome, CLAUDE_SRC_DIR), { recursive: true });
      vi.spyOn(os, "homedir").mockReturnValue(tempHome);
      ({ writeFile: realWriteFile } =
        await vi.importActual<typeof import("../../utils/fs.js")>("../../utils/fs.js"));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTempDir(tempHome);
    });

    const pairPath = (file: string) => path.join(tempHome, CLAUDE_SRC_DIR, file);

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
      const unrelated = path.join(tempHome, CLAUDE_SRC_DIR, "notes.md");
      await realWriteFile(unrelated, "fine");

      expect(await readFile(unrelated, "utf-8")).toBe("fine");
    });
  });

  /**
   * The residual bypass, closed at RUNTIME.
   *
   * `pair-writer.ts` is private, and a static or dynamic import of it is caught
   * by eslint and by the source scanner below. Both are STATIC layers, and a
   * static rule is defeated by a construct nobody anticipated — a specifier
   * assembled at runtime, a re-export added for convenience, a lint disable. The
   * durable layer is the one that refuses the call itself.
   *
   * So: reach the private writer the way a bypass would, and call it. It must
   * refuse, because the write privilege belongs to the gate's PUBLIC entries
   * (`config-gate/index.ts`) and is not something a callee hands to its own
   * caller. No `pair-writer` function opens the token — each one REQUIRES it, and
   * `writeIfChanged` asserts that — so the call below arrives holding nothing and
   * is refused at the write, whatever route reached it.
   *
   * `vi.importActual` on `utils/fs` is deliberately NOT used here: the point is
   * the whole real path, from the private writer through the write primitive.
   */
  describe("the gate's private pair writer refuses a caller that reached it directly", () => {
    let tempHome: string;

    beforeEach(async () => {
      tempHome = await createTempDir("cc-gate-private-writer-");
      await mkdir(path.join(tempHome, CLAUDE_SRC_DIR), { recursive: true });
      vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTempDir(tempHome);
    });

    it("writeGlobalConfigHalf throws GlobalPairWriteViolation when called outside the gate", async () => {
      const { writeGlobalConfigHalf } = await import("../config-gate/pair-writer.js");
      const configPath = path.join(tempHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

      await expect(
        writeGlobalConfigHalf({ name: "rogue", skills: [], agents: [] }, configPath),
        "a dynamic import of the private writer must not confer the write privilege",
      ).rejects.toThrow(GlobalPairWriteViolation);
    });

    it("leaves the global config half unwritten when the call is refused", async () => {
      const { writeGlobalConfigHalf } = await import("../config-gate/pair-writer.js");
      const configPath = path.join(tempHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

      await writeGlobalConfigHalf({ name: "rogue", skills: [], agents: [] }, configPath).catch(
        () => undefined,
      );

      expect(await fileExists(configPath), "the refused call must leave no config.ts behind").toBe(
        false,
      );
    });
  });

  /**
   * The gate entries that take a directory from a caller refuse the home
   * directory rather than treating it as one project among many: at `$HOME` the
   * file they would write IS the global manifest, and writing it without its
   * types sibling and without classification is the exact failure the gate
   * exists to prevent.
   */
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
    // Self-test: the scanner is only evidence about the codebase if it is first
    // evidence about itself. A predicate that answered `false` to everything
    // would make the scan below pass silently.
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
