/**
 * The source folder's name may be written in one place, and the linter is what holds that.
 *
 * The source folder is `.agents-inc/<provider>/`, resolved by one funnel. The failure that costs the whole step is
 * a HALF-ROUTED path: fourteen sites join a directory from a root and seven print one at the
 * user, and any single one of them left on a literal brings back a project that writes into a
 * folder the CLI is no longer reading, with every test green. A census grep finds today's
 * sites; only a rule stops tomorrow's from being added.
 *
 * So `eslint.config.js` grows a `no-restricted-syntax` pair — one selector for a string literal
 * and one for a template element — and this spec is its mutation proof, kept rather than
 * performed once: it feeds the config a banned spelling and requires a report, and feeds it the
 * strings that merely LOOK like one and requires silence. The second half is not decoration.
 * The names this repository is full of are one character apart from the banned ones:
 * `github:agents-inc/skills` is the default marketplace, `.claude-plugin/plugin.json` is a
 * plugin manifest, `.claude/skills` is where ejected skills are installed, and a rule that
 * condemned any of them would be reverted within the hour.
 *
 * Every zone is linted, because `no-restricted-syntax` options do NOT merge across config
 * blocks: the last block naming the rule for a file owns all of its selectors, so a zone that
 * declares the rule for a reason of its own silently drops every selector it does not restate.
 *
 * **Both rosters below are DERIVED from the config rather than hand-listed beside it**, through
 * `lintZonesIn` in `helpers/lint-zones.ts`. The hand-written form is what let the roster in
 * `spec-gates.test.ts` stand short through three waves — it records the blocks somebody
 * remembered — and this file carried the same shape plus a sentence stating a cardinality ("the
 * four zones below are the four blocks"), which is a count in a comment and goes stale the same
 * way. What is hand-written now is only the EXEMPTIONS: the zones where the ban is deliberately
 * lifted, each named by the patterns its block selects and each with the reason it is one. A
 * block added to the config that is not one of those must report, so a new zone is measured by
 * arriving rather than by being remembered.
 *
 * The funnel module's own exemption was NOT covered here while the module did not yet exist —
 * `lintText` needs a path the TypeScript project service can resolve. `lib/installation/
 * install-layout.ts` exists now and is exempt below, beside the e2e mirror at
 * `e2e/pages/constants.ts`. `packages/compile/src/source-layout.ts` is the other exempt module and
 * stays outside this file: it belongs to a different package, with a different flat config, and
 * this ESLint instance resolves against `packages/cli`'s.
 *
 * **And the ban has a second half these selectors cannot see.** A path is composed as often as it
 * is written — `path.join(root, SOURCE_ROOT_DIR, provider)` spells neither banned name, and
 * `sourceDirName("claude")` spells a bare provider name — so `eslint.config.js` pairs them with a
 * `no-restricted-imports` group on the SYMBOLS, which
 * `todo/plans/CLI-source-folder-rename-plan.md` :145 asks for and :157 asks this guard of. Its
 * zones are not these zones: `no-restricted-imports` is declared in a different set of blocks and
 * reaches no spec at all, so it gets its own roster below.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

/** The rule the selectors are written under. */
const RESTRICTED_SYNTAX = "no-restricted-syntax";

/**
 * Enough of this ban's own message to tell it from the OTHER ban written under the same rule.
 *
 * `host-path-literals-are-funnelled.test.ts` beside this file guards the HOSTS' directories —
 * `.claude/`, `.codex`, `.agents/skills` — and two of the allowed spellings below are banned there
 * by design. The rule id cannot separate them, so the silence this file asserts is now asserted
 * about the message, which is strictly the stronger claim: a fixture reported by some unrelated
 * selector no longer reads as this ban over-reaching, and one reported by THIS ban still does.
 *
 * Written out rather than imported from `eslint.config.js`: an assertion bound to the text the
 * linter renders moves with it and could never fail.
 */
const SOURCE_FOLDER_REPORT = "The source folder's name is resolved, not written";

/** The rule the symbol half is written under — a different rule, and a different set of zones. */
const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/**
 * The zones the literal ban is deliberately LIFTED in, each by the patterns its block selects.
 *
 * Written out because each is a decision, and the derivation cannot tell a zone that dropped the
 * selectors on purpose from one that dropped them by restating the rule and forgetting. What the
 * derivation gives is the other half: a block added to the config arrives in the roster below,
 * is not one of these, and is therefore required to report.
 */
const LITERAL_EXEMPT_PATTERNS = [
  // A SPEC may write the folder names: they are text already on people's disks, and an assertion
  // importing the constant the product writes would move with it and could never fail.
  "**/*.test.ts, **/*.test.tsx",
  // The funnel: where the two names are declared against each other.
  "src/cli/lib/installation/install-layout.ts",
  // The e2e tree's one mirror of the product's path vocabulary, for the reason the spec zone has.
  "e2e/pages/constants.ts",
];

/**
 * The zones the SYMBOL ban is deliberately lifted in — not the same set, and not the same rule.
 *
 * Four modules own one of these names plus the choke point whose rule is off entirely, which is
 * why this roster and the one above cannot be shared: each rule is declared in blocks the other
 * is not, so a list reused between them would leave one unmeasured wherever it does not reach.
 */
const IMPORT_EXEMPT_PATTERNS = [
  // The single write choke point, whose global-pair tripwire must know every folder a write could
  // land in. Its block turns the rule off outright.
  "src/cli/utils/fs.ts",
  // Resolves every path under a source folder: the funnel the message points callers at.
  "src/cli/lib/installation/install-layout.ts",
  // Re-exports the path vocabulary from `@workspace/compile`, which is how it is reachable here.
  "src/cli/consts.ts",
  // The SOURCE-REPO door: a marketplace repo declares its layout in either folder, always.
  "src/cli/lib/configuration/config.ts",
];

/** A zone with a file to lint. One without is a config defect, reported by its own gate below. */
function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

/**
 * Every zone the config splits `rule` into, split again by whether the ban is meant to reach it.
 *
 * The partition is by the block's own `files` patterns rather than by a subject path, because the
 * subject is whichever file the block happens to own today and the patterns are what the config
 * actually says.
 */
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
 * What the mirror still owes after that exemption, and the half a wholesale exemption loses.
 *
 * `no-restricted-syntax` takes options, so the last block naming the rule for a file owns ALL of
 * them: a zone that drops one selector by restating the rest drops everything it forgets to
 * restate. `e2e/pages/constants.ts` is in the SPEC zone, whose set is the task-ID shapes and the
 * vacuous comparisons — and the exemption restated only the second, so the first was silently
 * gone. Nothing could see it: the roster in `spec-gates.test.ts` measures this zone against the
 * vacuous shapes alone.
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

/** Every spelling of a source folder that must be refused outside the funnel. */
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

/**
 * Names that share a prefix with a banned one and must be left alone. Each is live in this
 * repository, which is what makes this half a measurement rather than a guess.
 *
 * The last two are ALSO the host-path ban's subject, and are kept here for exactly that reason:
 * `.claude/skills` is the nearest miss this regex has, so dropping it because a different selector now reports it would delete the measurement that proves
 * this one has not over-reached.
 */
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

/** What one in-process, type-aware ESLint pass over one fixture is allowed to take. */
const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = LITERAL_ZONES.all.length * BANNED_SPELLINGS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS =
  LITERAL_ZONES.all.length * ALLOWED_SPELLINGS.length * LINT_PASS_BUDGET_MS;

/**
 * The rules the repository's own ESLint config reports against `source` when it is read as
 * `zone`. The config is LOADED rather than restated — a second copy of the selectors here could
 * not tell a rule that stopped matching from one that was never configured.
 */
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

/** Whether THIS ban named itself against `source` in `zone` — see {@link SOURCE_FOLDER_REPORT}. */
async function sourceFolderReportedAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<boolean> {
  const reported = await reportsAgainst(eslint, source, zone);

  return reported.some((message) => message.message.startsWith(SOURCE_FOLDER_REPORT));
}

/** One lint pass, with the two answers that mean the fixture asked nothing turned into throws. */
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
  /**
   * The precondition both loops rest on, and the half a derivation can get wrong that a roster
   * could not: a block declaring the rule for files that are not there, or for files a later
   * block has already taken, leaves nothing to lint as that zone — which reads exactly like a
   * zone that passed.
   */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      LITERAL_ZONES.all.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_SYNTAX}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /**
   * An exemption that stopped existing leaves the loop below with nothing to check and no red to
   * say so — the derivation would simply hand every zone to the reported half, which passes.
   */
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

  /**
   * The other half of an exemption, and the one nothing held.
   *
   * An exemption written as "the rule, minus this selector" is written as a fresh option list, so
   * what it keeps is whatever it remembered to restate. The assertion above cannot see the
   * difference — a zone that dropped EVERY selector satisfies it exactly as one that dropped the
   * right one does.
   */
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

/**
 * The shape the plan asks this guard to fail on, written out:
 * "any `path.join(..., SOURCE_ROOT_DIR)` outside the funnel"
 * (`todo/plans/CLI-source-folder-rename-plan.md` :157).
 *
 * The composition is what makes the symbol ban necessary rather than redundant — the fixture
 * writes no banned spelling, so the literal selectors above are silent on it.
 */
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

/** A sibling of the banned names, imported from the same module, which must be left alone. */
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

  // The subject guard for the assertion above: a group that banned the whole module would satisfy
  // it without naming a single symbol, and would condemn every path this package builds.
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
