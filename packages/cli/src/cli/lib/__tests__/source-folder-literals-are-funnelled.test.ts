/**
 * The source folder's name may be written only in the funnel; one half-routed literal writes where
 * the CLI no longer reads. A mutation proof of the `no-restricted-syntax` pair: banned spellings
 * must report, near misses must stay silent. Options don't merge across blocks, so every zone is
 * linted, derived via `lintZonesIn`. Composition (`path.join(root, SOURCE_ROOT_DIR)`) is held by a
 * `no-restricted-imports` group with its own zones. `packages/compile` has its own config.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

const RESTRICTED_SYNTAX = "no-restricted-syntax";

/**
 * Tells this ban from the host-path ban under the same rule id, so silence is asserted about the
 * message. Written out, not imported.
 */
const SOURCE_FOLDER_REPORT = "The source folder's name is resolved, not written";

/** A different rule, with a different set of zones. */
const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Hand-written: the derivation cannot tell a deliberate exemption from a forgotten restatement. */
const LITERAL_EXEMPT_PATTERNS = [
  // Specs may write the folder names: they are text already on people's disks.
  "**/*.test.ts, **/*.test.tsx",
  // The funnel: where the two names are declared against each other.
  "src/cli/lib/installation/install-layout.ts",
  // The e2e mirror of the product's path vocabulary.
  "e2e/pages/constants.ts",
];

/** The symbol ban's exemptions: a different rule declared in different blocks, so not shared. */
const IMPORT_EXEMPT_PATTERNS = [
  // The write choke point, whose tripwire must know every folder; its block turns the rule off.
  "src/cli/utils/fs.ts",
  // The funnel the message points callers at.
  "src/cli/lib/installation/install-layout.ts",
  // Re-exports the path vocabulary from `@workspace/compile`.
  "src/cli/consts.ts",
  // The SOURCE-REPO door: a marketplace repo declares its layout in either folder, always.
  "src/cli/lib/configuration/config.ts",
];

function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

/** Partitioned by the block's own `files` patterns, which are what the config actually says. */
function zonesFor(rule: string, exemptPatterns: readonly string[]) {
  const zones = lintZonesIn(ESLINT_CONFIG, rule, CLI_ROOT);

  return {
    all: zones,
    reported: zones.filter((zone) => !exemptPatterns.includes(zone.patterns)),
    exempt: zones.filter((zone) => exemptPatterns.includes(zone.patterns)),
  };
}

const LITERAL_ZONES = zonesFor(RESTRICTED_SYNTAX, LITERAL_EXEMPT_PATTERNS);
const IMPORT_ZONES = zonesFor(RESTRICTED_IMPORTS, IMPORT_EXEMPT_PATTERNS);

/**
 * The last block naming the rule owns all its options, so an exemption restating only some
 * selectors silently drops the rest; these must still report in the mirror.
 */
const STILL_REFUSED_IN_THE_MIRROR = [
  {
    name: "a task ID in a test name",
    source: `describe("CLI-715 holds the roster", () => {});\n`,
  },
  {
    name: "a task ID in an assertion message",
    source: `expect(1, "CLI-715 must hold").toBe(1);\n`,
  },
] as const;

const BANNED_SPELLINGS = [
  {
    name: "the new root as a bare literal",
    source: `export const sourceRoot = ".agents-inc";\n`,
  },
  {
    name: "a provider folder inside a template",
    source: `export const sourceDir = (root: string): string => \`\${root}/.agents-inc/claude\`;\n`,
  },
] as const;

/** Near misses that must stay silent; the last two are also the host-path ban's subject. */
const ALLOWED_SPELLINGS = [
  {
    name: "the default marketplace ref",
    source: `export const marketplace = "github:agents-inc/skills";\n`,
  },
  {
    name: "the package's own name",
    source: `export const pluginName = "agents-inc";\n`,
  },
  {
    name: "a plugin manifest path",
    source: `export const manifest = ".claude-plugin/plugin.json";\n`,
  },
  {
    name: "the installed skills directory",
    source: `export const localSkills = ".claude/skills";\n`,
  },
  {
    name: "the installed output directory",
    source: `export const claudeDir = ".claude";\n`,
  },
] as const;

const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = LITERAL_ZONES.all.length * BANNED_SPELLINGS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS =
  LITERAL_ZONES.all.length * ALLOWED_SPELLINGS.length * LINT_PASS_BUDGET_MS;

/** The repository's own config, loaded rather than restated. */
async function rulesReportedAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<string[]> {
  const reported = await reportsAgainst(eslint, source, zone);

  return reported
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

/** Whether this ban named itself, per {@link SOURCE_FOLDER_REPORT}. */
async function sourceFolderReportedAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<boolean> {
  const reported = await reportsAgainst(eslint, source, zone);

  return reported.some((message) => message.message.startsWith(SOURCE_FOLDER_REPORT));
}

async function reportsAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<ESLint.LintResult["messages"]> {
  const [result] = await eslint.lintText(source, { filePath: path.join(CLI_ROOT, zone) });
  if (result === undefined) throw new Error(`eslint returned no verdict at all for '${zone}'`);

  const unparseable = result.messages.filter((message) => message.fatal);
  if (unparseable.length > 0) {
    const reasons = unparseable.map((message) => message.message).join("; ");
    throw new Error(`the fixture did not parse as '${zone}', so it asked nothing: ${reasons}`);
  }

  return result.messages;
}

describe("a source folder written outside the funnel", () => {
  /** A zone with no file to lint reads exactly like a zone that passed. */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      LITERAL_ZONES.all.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_SYNTAX}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /** A vanished exemption would hand every zone to the reported half, which passes. */
  it("still finds each zone the ban is deliberately lifted in", () => {
    expect(
      LITERAL_ZONES.exempt.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, or it was removed and its module is now banned",
    ).toStrictEqual(LITERAL_EXEMPT_PATTERNS);
  });

  it(
    "is reported in every zone the rule is declared in",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of LITERAL_ZONES.reported.filter(isMeasurable)) {
        for (const spelling of BANNED_SPELLINGS) {
          expect(
            await rulesReportedAgainst(eslint, spelling.source, subject),
            `the zone eslint.config.js declares for '${patterns}' accepts ${spelling.name} — the selectors do not reach it, and its options were not restated, measured on '${subject}'`,
          ).toContain(RESTRICTED_SYNTAX);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );

  it(
    "is left alone in the funnel that resolves it, in a spec, and in the mirror the e2e tree keeps",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of LITERAL_ZONES.exempt.filter(isMeasurable)) {
        for (const spelling of BANNED_SPELLINGS) {
          expect(
            await rulesReportedAgainst(eslint, spelling.source, subject),
            `the zone eslint.config.js declares for '${patterns}' condemns ${spelling.name} — it is where the names are declared or deliberately copied, measured on '${subject}'`,
          ).not.toContain(RESTRICTED_SYNTAX);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );

  /** A zone that dropped every selector passes the assertion above; this checks what it kept. */
  it(
    "leaves the mirror everything else its own zone refuses",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });
      const mirror = "e2e/pages/constants.ts";

      for (const shape of STILL_REFUSED_IN_THE_MIRROR) {
        expect(
          await rulesReportedAgainst(eslint, shape.source, mirror),
          `'${mirror}' accepts ${shape.name} — its exemption restated the source-folder drop and lost the spec zone's other selectors with it`,
        ).toContain(RESTRICTED_SYNTAX);
      }
    },
    BANNED_TIMEOUT_MS,
  );
});

describe("a name that merely shares a prefix with the source folder", () => {
  it(
    "is left alone in every zone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of LITERAL_ZONES.all.filter(isMeasurable)) {
        for (const spelling of ALLOWED_SPELLINGS) {
          expect(
            await sourceFolderReportedAgainst(eslint, spelling.source, subject),
            `the zone eslint.config.js declares for '${patterns}' condemns ${spelling.name} — the selector has outgrown the folder it names, measured on '${subject}'`,
          ).toBe(false);
        }
      }
    },
    ALLOWED_TIMEOUT_MS,
  );
});

/** Writes no banned spelling, so only the symbol ban can catch it. */
const COMPOSED_SOURCE_PATHS = [
  {
    name: "a path joined from the new root",
    source: [
      `import path from "path";`,
      `import { SOURCE_ROOT_DIR } from "../../consts.js";`,
      `export function at(root: string, provider: string): string {`,
      `  return path.join(root, SOURCE_ROOT_DIR, provider);`,
      `}`,
      ``,
    ].join("\n"),
  },
] as const;

const NEIGHBOURING_IMPORT = [
  `import path from "path";`,
  `import { STANDARD_FILES } from "../../consts.js";`,
  `export function at(dir: string): string {`,
  `  return path.join(dir, STANDARD_FILES.CONFIG_TS);`,
  `}`,
  ``,
].join("\n");

const IMPORT_TIMEOUT_MS =
  IMPORT_ZONES.all.length * (COMPOSED_SOURCE_PATHS.length + 1) * LINT_PASS_BUDGET_MS;

describe("a source folder COMPOSED from its root name outside the funnel", () => {
  it("finds a file to lint in every zone the config declares the import ban for", () => {
    expect(
      IMPORT_ZONES.all.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_IMPORTS}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  it("still finds each zone the import ban is deliberately lifted in", () => {
    expect(
      IMPORT_ZONES.exempt.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, or it was removed and its module is now banned",
    ).toStrictEqual(IMPORT_EXEMPT_PATTERNS);
  });

  it(
    "is reported in every zone the import ban is declared in",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of IMPORT_ZONES.reported.filter(isMeasurable)) {
        for (const shape of COMPOSED_SOURCE_PATHS) {
          expect(
            await rulesReportedAgainst(eslint, shape.source, subject),
            `the zone eslint.config.js declares for '${patterns}' accepts ${shape.name} — the import group does not reach it, and its patterns were not restated, measured on '${subject}'`,
          ).toContain(RESTRICTED_IMPORTS);
        }
      }
    },
    IMPORT_TIMEOUT_MS,
  );

  // Subject guard: a ban on the whole module would pass above while condemning every path.
  it(
    "leaves a neighbouring constant from the same module alone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of IMPORT_ZONES.reported.filter(isMeasurable)) {
        expect(
          await rulesReportedAgainst(eslint, NEIGHBOURING_IMPORT, subject),
          `the zone eslint.config.js declares for '${patterns}' condemns STANDARD_FILES — the group has outgrown the names it lists and now bans the module, measured on '${subject}'`,
        ).not.toContain(RESTRICTED_IMPORTS);
      }
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "is left alone in each module that owns one of these names",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of IMPORT_ZONES.exempt.filter(isMeasurable)) {
        for (const shape of COMPOSED_SOURCE_PATHS) {
          expect(
            await rulesReportedAgainst(eslint, shape.source, subject),
            `the zone eslint.config.js declares for '${patterns}' condemns ${shape.name} — it is one of the modules the names are resolved IN, measured on '${subject}'`,
          ).not.toContain(RESTRICTED_IMPORTS);
        }
      }
    },
    IMPORT_TIMEOUT_MS,
  );
});
