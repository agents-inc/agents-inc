import path from "path";
import { readFile } from "fs/promises";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import { CLI_ROOT } from "./helpers/cli-runner.js";

/**
 * No production module writes the `config.ts` / `config-types.ts` pair or reaches past the gate's
 * index; `config-gate-enforcement.test.ts` holds the gate's own refusals.
 */

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
 * full bypass. A specifier assembled at runtime defeats this; `config-gate-enforcement.test.ts`
 * covers it at runtime.
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

describe("config-gate enforcement across src/", () => {
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
