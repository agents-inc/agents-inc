/**
 * A host directory composed from the constant that spells it (`path.join(root, CLAUDE_DIR)`), which
 * no literal regex sees; held by a `no-restricted-imports` group. Its own file because that rule's
 * zones differ from the literal ban's. Assertions use `includes` on literal message text: the rule
 * prefixes its own sentence, and five groups share the rule id. Zones come from `lintZonesIn`.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Enough to tell this ban from the four other groups under the same rule. */
const HOST_PATH_SYMBOL_REPORT = "A host path is resolved, not composed";

/** Pinned apart: the group can keep reporting after the message loses its remedy. */
const FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS = "add the role there rather than composing it here";

/** So a fixture that trips the sibling ban is not read as a pass. */
const SOURCE_FOLDER_SYMBOL_REPORT = "The source folder's name is resolved, not written";

/**
 * Hand-written: the derivation cannot tell a deliberate exemption from a forgotten restatement. The
 * first entry is a backlog that may only shrink, spelled as its block spells it.
 */
const EXEMPT_PATTERNS = [
  // Backlog: each composes a Claude directory, and several need a scope in hand to ask the layout.
  "src/cli/commands/eject.ts, src/cli/commands/uninstall.tsx, src/cli/lib/compiler.ts, src/cli/lib/installation/installation.ts, src/cli/lib/installation/layout-findings.ts, src/cli/lib/plugins/plugin-finder.ts, src/cli/lib/plugins/plugin-settings.ts, src/cli/lib/seed/external-skills.ts, src/cli/lib/skills/local-skill-loader.ts, src/cli/lib/skills/local-skill-mover.ts, src/cli/utils/messages.ts",
  // The write choke point, whose tripwire must know every directory; its block turns the rule off.
  "src/cli/utils/fs.ts",
  // The funnel the message points at.
  "src/cli/lib/installation/install-layout.ts",
  // The barrel re-exporting these names from `@workspace/compile`.
  "src/cli/consts.ts",
];

function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

const ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_IMPORTS, CLI_ROOT);
const REPORTED_ZONES = ZONES.filter((zone) => !EXEMPT_PATTERNS.includes(zone.patterns));
const EXEMPT_ZONES = ZONES.filter((zone) => EXEMPT_PATTERNS.includes(zone.patterns));

/** Both symbols and both import routes (the barrel and `@workspace/compile` directly). */
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

/** Subject guard: a ban on the whole module would pass above while condemning most paths. */
const NEIGHBOURING_IMPORT = [
  `import path from "path";`,
  `import { STANDARD_FILES } from "../../consts.js";`,
  `export function at(dir: string): string {`,
  `  return path.join(dir, STANDARD_FILES.CONFIG_TS);`,
  `}`,
  ``,
].join("\n");

const LINT_PASS_BUDGET_MS = 2_500;

const COMPOSED_TIMEOUT_MS = ZONES.length * COMPOSED_HOST_PATHS.length * LINT_PASS_BUDGET_MS;
const NEIGHBOUR_TIMEOUT_MS = ZONES.length * LINT_PASS_BUDGET_MS;

/** The repository's own config, loaded rather than restated. An unparseable fixture throws. */
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

/** `includes`: the rule prefixes its own sentence to the configured message. */
function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.includes(report));
}

describe("a host path composed from the constant that spells it", () => {
  /** A zone with no file to lint reads exactly like a zone that passed. */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_IMPORTS}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /** A vanished exemption would hand every zone to the reported half; also guards the backlog. */
  it("still finds each zone the ban is deliberately lifted in", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, the backlog grew or shrank, or the exemption was removed and its module is now banned",
    ).toStrictEqual(EXEMPT_PATTERNS);
  });

  /** Subject guard: with no reported zone the loop below would pass having run nothing. */
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

  /** "Call one of these roles" is no help when no role answers the path yet. */
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
