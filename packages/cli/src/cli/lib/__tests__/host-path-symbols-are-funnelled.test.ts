/**
 * A host's directory reached through the CONSTANT that spells it — the half of the host-path ban
 * that `host-path-literals-are-funnelled.test.ts` beside this file cannot see, and the half that
 * had no gate of its own.
 *
 * **The class is measured, not argued.** Two of the four Claude leaks found by driving the Codex
 * lane on 2026-09-22 wrote no banned spelling at all: `doctor`'s Skills Installed row joined
 * `LOCAL_SKILLS_PATH` onto a scope root and reported every skill of a healthy Codex installation
 * missing, and the permission notice joined `CLAUDE_DIR` onto a project root and ended a Codex
 * install by telling the user to edit a Claude settings file. `CLAUDE_DIR` is an identifier and
 * `path.join` composes at run time, so no regex over literals or template text reaches either —
 * both passed `npm run lint` on the day they were written. `eslint.config.js` answers that with a
 * `no-restricted-imports` group on the SYMBOLS, and this file is what holds the group binding.
 *
 * **Why it needed its own file rather than a case in the literal spec.** The two bans are written
 * under DIFFERENT RULES — `no-restricted-syntax` for the literals, `no-restricted-imports` for the
 * symbols — and a flat config declares each in a different set of blocks. Neither rule merges its
 * options across blocks, so the zone rosters cannot be shared: a list reused between them leaves
 * one unmeasured wherever it does not reach. `source-folder-literals-are-funnelled.test.ts` already
 * carries both halves for the folder this product owns and says the same thing at :44; this is that
 * discipline arriving one layer out.
 *
 * **Assertions are on the MESSAGE, never on the rule id.** One zone's `no-restricted-imports`
 * options carry five groups at once — the config-gate privates, the config writer, the source
 * folder, the Claude host seam and this one — so a rule-id assertion passes because SOME group
 * reported and says nothing about which. Every expected string is a LITERAL rather than an import
 * from `eslint.config.js`: an assertion bound to the text the linter renders moves with it and
 * could never fail.
 *
 * **And the message is CONTAINED, not led with.** `no-restricted-imports` renders its own sentence
 * first — `'CLAUDE_DIR' import from '…' is restricted from being used by a pattern.` — and appends
 * the configured message after it. The literal spec's `startsWith` is correct for
 * `no-restricted-syntax`, which renders the message verbatim, and silently answers false for every
 * fixture here; it is written out because copying that helper across is the obvious mistake, and it
 * turns this whole file green having measured nothing.
 *
 * **The zone roster is DERIVED from the config**, through `lintZonesIn` in `helpers/lint-zones.ts`,
 * for the reason that helper exists: a hand-written roster records the blocks somebody remembered.
 * What is hand-written is only the EXEMPTIONS below, each with the reason it is one — so a block
 * added to the config arrives in the derivation, is not one of those, and is required to report.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

/** The rule the symbol ban is written under — not the rule the literal ban uses. */
const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Enough of this ban's own message to tell it from the four other groups under the same rule. */
const HOST_PATH_SYMBOL_REPORT = "A host path is resolved, not composed";

/**
 * The half of the message that makes the ban a FUNNEL rather than a dead end.
 *
 * Pinned separately from the report itself because the two fail apart: the group can go on
 * reporting while the message loses the sentence, and the assertion above would stay green through
 * it. This is the literal spec's `FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS` reasoning, for the message
 * that names no roles at the site an author is standing on.
 */
const FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS = "add the role there rather than composing it here";

/** The sibling symbol ban's own message, so a fixture that trips IT is not read as a pass. */
const SOURCE_FOLDER_SYMBOL_REPORT = "The source folder's name is resolved, not written";

/**
 * The zones the symbol ban is deliberately LIFTED in, each by the patterns its block selects.
 *
 * Written out because each is a decision, and the derivation cannot tell a zone that dropped the
 * group on purpose from one that dropped it by restating the rule and forgetting.
 *
 * The first entry is the one that carries weight: it is the BACKLOG of product files that still
 * compose a host path out of these constants, and it may only shrink. It is spelled here as the
 * block spells it — one string, the file list joined — so a file ADDED to the backlog reddens this
 * file by name rather than joining a list nothing counts.
 */
const EXEMPT_PATTERNS = [
  // The rostered backlog, in the config's own order. Each of these composes a directory that is
  // Claude's on an installation that may not be: `installation.ts` and `layout-findings.ts` an
  // agents or skills directory, `plugin-finder.ts` and `plugin-settings.ts` Claude's plugin tree,
  // `local-skill-loader.ts` / `local-skill-mover.ts` / `external-skills.ts` / `eject.ts` the
  // ejected-skill paths, `messages.ts` and `uninstall.tsx` one host's directory inside a sentence
  // every host's user reads, and `compiler.ts` a legacy templates directory. Several need a scope
  // in hand before they can ask the layout for a path at all, which is why they are a backlog.
  "src/cli/commands/eject.ts, src/cli/commands/uninstall.tsx, src/cli/lib/compiler.ts, src/cli/lib/installation/installation.ts, src/cli/lib/installation/layout-findings.ts, src/cli/lib/plugins/plugin-finder.ts, src/cli/lib/plugins/plugin-settings.ts, src/cli/lib/seed/external-skills.ts, src/cli/lib/skills/local-skill-loader.ts, src/cli/lib/skills/local-skill-mover.ts, src/cli/utils/messages.ts",
  // The single write choke point, whose global-pair tripwire has to know every directory a write
  // could land in. Its block turns the rule off outright.
  "src/cli/utils/fs.ts",
  // The funnel: the module that declares the host roles these constants feed, and the module the
  // message points every other site at.
  "src/cli/lib/installation/install-layout.ts",
  // The barrel that re-exports the path vocabulary from `@workspace/compile`, which is how these
  // names are reachable in this package at all.
  "src/cli/consts.ts",
];

/** A zone with a file to lint. One without is a config defect, reported by its own gate below. */
function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

const ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_IMPORTS, CLI_ROOT);
const REPORTED_ZONES = ZONES.filter((zone) => !EXEMPT_PATTERNS.includes(zone.patterns));
const EXEMPT_ZONES = ZONES.filter((zone) => EXEMPT_PATTERNS.includes(zone.patterns));

/**
 * Every way a host path is COMPOSED rather than written, each writing no banned spelling at all.
 *
 * Both symbols and both import spellings, because both are live and one says nothing about the
 * other: the CLI's own barrel re-exports these names from `@workspace/compile`, so a group naming
 * only the barrel leaves the direct import as the bypass, and a group naming only the package
 * leaves the barrel as one.
 */
const COMPOSED_HOST_PATHS = [
  {
    name: "Claude's state directory joined from the barrel",
    source: [
      `import path from "path";`,
      `import { CLAUDE_DIR } from "../../consts.js";`,
      `export function at(root: string): string {`,
      `  return path.join(root, CLAUDE_DIR);`,
      `}`,
      ``,
    ].join("\n"),
  },
  {
    name: "Claude's state directory joined from the renderer package",
    source: [
      `import path from "path";`,
      `import { CLAUDE_DIR } from "@workspace/compile";`,
      `export function at(root: string): string {`,
      `  return path.join(root, CLAUDE_DIR);`,
      `}`,
      ``,
    ].join("\n"),
  },
  {
    name: "the ejected-skills directory joined from the barrel",
    source: [
      `import path from "path";`,
      `import { LOCAL_SKILLS_PATH } from "../../consts.js";`,
      `export function at(root: string, id: string): string {`,
      `  return path.join(root, LOCAL_SKILLS_PATH, id);`,
      `}`,
      ``,
    ].join("\n"),
  },
  {
    name: "the ejected-skills directory joined from the renderer package",
    source: [
      `import path from "path";`,
      `import { LOCAL_SKILLS_PATH } from "@workspace/compile";`,
      `export function at(root: string, id: string): string {`,
      `  return path.join(root, LOCAL_SKILLS_PATH, id);`,
      `}`,
      ``,
    ].join("\n"),
  },
] as const;

/**
 * A sibling of the banned names, imported from the same module, which must be left alone.
 *
 * The subject guard for the reported loop: a group that banned the whole MODULE would satisfy
 * every assertion above without naming a single symbol, and would condemn most paths this package
 * builds. `STANDARD_FILES` is the nearest live neighbour — it sits in the same import statement as
 * `CLAUDE_DIR` in three product files today.
 */
const NEIGHBOURING_IMPORT = [
  `import path from "path";`,
  `import { STANDARD_FILES } from "../../consts.js";`,
  `export function at(dir: string): string {`,
  `  return path.join(dir, STANDARD_FILES.CONFIG_TS);`,
  `}`,
  ``,
].join("\n");

/** What one in-process, type-aware ESLint pass over one fixture is allowed to take. */
const LINT_PASS_BUDGET_MS = 2_500;

const COMPOSED_TIMEOUT_MS = ZONES.length * COMPOSED_HOST_PATHS.length * LINT_PASS_BUDGET_MS;
const NEIGHBOUR_TIMEOUT_MS = ZONES.length * LINT_PASS_BUDGET_MS;

/**
 * The messages the repository's own ESLint config reports against `source` when it is read as
 * `zone`. The config is LOADED rather than restated — a second copy of the group here could not
 * tell a group that stopped matching from one that was never configured.
 *
 * A fixture that failed to parse asked nothing, so it is thrown on rather than counted.
 */
async function messagesReportedAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: path.join(CLI_ROOT, zone) });
  if (result === undefined) throw new Error(`eslint returned no verdict at all for '${zone}'`);

  const unparseable = result.messages.filter((message) => message.fatal);
  if (unparseable.length > 0) {
    const reasons = unparseable.map((message) => message.message).join("; ");
    throw new Error(`the fixture did not parse as '${zone}', so it asked nothing: ${reasons}`);
  }

  return result.messages.map((message) => message.message);
}

/** Whether any message CARRIES `report` — see the docblock on the rendering above. */
function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.includes(report));
}

describe("a host path composed from the constant that spells it", () => {
  /**
   * The precondition every loop rests on, and the half a derivation can get wrong that a roster
   * could not: a block declaring the rule for files that are not there, or for files a later block
   * has already taken, leaves nothing to lint as that zone — which reads exactly like a zone that
   * passed.
   */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_IMPORTS}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /**
   * An exemption that stopped existing leaves the silence loop with nothing to check and no red to
   * say so — the derivation would simply hand every zone to the reported half, which passes.
   *
   * It is also the guard on the BACKLOG: its zone is one patterns string, so a twelfth file joining
   * the list that may only shrink fails here, naming both spellings.
   */
  it("still finds each zone the ban is deliberately lifted in", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, the backlog grew or shrank, or the exemption was removed and its module is now banned",
    ).toStrictEqual(EXEMPT_PATTERNS);
  });

  /** The subject guard for the loop below: with no reported zone it would pass having run nothing. */
  it("leaves at least one zone the ban is meant to reach", () => {
    expect(
      REPORTED_ZONES.length,
      "every zone is exempt, so the ban reaches no file in this package at all",
    ).toBeGreaterThan(0);
  });

  it(
    "is reported in every zone the rule is declared in",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of REPORTED_ZONES.filter(isMeasurable)) {
        for (const composed of COMPOSED_HOST_PATHS) {
          const messages = await messagesReportedAgainst(eslint, composed.source, subject);

          expect(
            reports(messages, HOST_PATH_SYMBOL_REPORT),
            `the zone eslint.config.js declares for '${patterns}' accepts ${composed.name} — the import group does not reach it, and its patterns were not restated, measured on '${subject}'`,
          ).toBe(true);
        }
      }
    },
    COMPOSED_TIMEOUT_MS,
  );

  it(
    "leaves a neighbouring constant from the same module alone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of ZONES.filter(isMeasurable)) {
        const messages = await messagesReportedAgainst(eslint, NEIGHBOURING_IMPORT, subject);

        expect(
          {
            hostPathSymbol: reports(messages, HOST_PATH_SYMBOL_REPORT),
            sourceFolderSymbol: reports(messages, SOURCE_FOLDER_SYMBOL_REPORT),
          },
          `the zone eslint.config.js declares for '${patterns}' condemns STANDARD_FILES — a group has outgrown the names it lists and now bans the module, measured on '${subject}'`,
        ).toStrictEqual({ hostPathSymbol: false, sourceFolderSymbol: false });
      }
    },
    NEIGHBOUR_TIMEOUT_MS,
  );

  /**
   * A ban whose message names only roles is a dead end at the site an author is standing on: the
   * path they need may be one no role answers yet, and "call one of these" is then advice they
   * cannot take. The literal ban was found in exactly that state on 2026-09-21 and its remedy was
   * to carry the funnel in the message; this keeps the second half attached to the first here.
   */
  it("tells an author what to do when no role answers the path it condemned", async () => {
    const eslint = new ESLint({ cwd: CLI_ROOT });
    const zone = REPORTED_ZONES.filter(isMeasurable)[0];
    if (zone === undefined) throw new Error("no reported zone has a file to lint");

    const [composed] = COMPOSED_HOST_PATHS;
    const messages = await messagesReportedAgainst(eslint, composed.source, zone.subject);

    expect(
      reports(messages, FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS),
      "the ban condemns a composed host path without saying what to do where no role answers it, so its remedy names only roles and none of them may be the one to call",
    ).toBe(true);
  });

  it(
    "is left alone in the funnel, in the barrel, at the write choke point and in the rostered backlog",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of EXEMPT_ZONES.filter(isMeasurable)) {
        for (const composed of COMPOSED_HOST_PATHS) {
          const messages = await messagesReportedAgainst(eslint, composed.source, subject);

          expect(
            reports(messages, HOST_PATH_SYMBOL_REPORT),
            `the zone eslint.config.js declares for '${patterns}' condemns ${composed.name} — it is where the host roles are answered, re-exported, swept or deliberately still owed, measured on '${subject}'`,
          ).toBe(false);
        }
      }
    },
    COMPOSED_TIMEOUT_MS,
  );
});
