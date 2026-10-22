/**
 * A host directory may be written only in `install-layout.ts`: a literal path is right on one host
 * and silently wrong on the other.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

/** Shared by both bans, so nothing below asserts on the id. */
const RESTRICTED_SYNTAX = "no-restricted-syntax";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Written out, not imported. The directory and extension halves point at different roles. */
const HOST_DIRECTORY_REPORT = "A host path is resolved, not written";
const HOST_EXTENSION_REPORT = "A compiled agent's extension is the host's, not a constant";

/** Pinned apart: the selector can keep reporting after the message loses its remedy. */
const FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS = "Where no role above answers the path you need";

/** So an allowed fixture that trips the sibling ban is not read as a pass. */
const SOURCE_FOLDER_REPORT = "The source folder's name is resolved, not written";

/** Hand-written: the derivation cannot tell a deliberate exemption from a forgotten restatement. */
const EXEMPT_PATTERNS = [
  // Specs record what Claude Code does; unlike the source-folder ban, this one skips them.
  "**/*.test.ts, **/*.test.tsx, **/__tests__/**, **/__mocks__/**, **/e2e/**",
  // Backlog that may only shrink: the oclif command description has no scope to resolve against.
  "src/cli/commands/init.tsx",
  // The spec zone proper.
  "**/*.test.ts, **/*.test.tsx",
  // The funnel this ban's message points at.
  "src/cli/lib/installation/install-layout.ts",
  // The e2e mirror of the product's path vocabulary.
  "e2e/pages/constants.ts",
];

function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

const ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_SYNTAX, CLI_ROOT);
const REPORTED_ZONES = ZONES.filter((zone) => !EXEMPT_PATTERNS.includes(zone.patterns));
const EXEMPT_ZONES = ZONES.filter((zone) => EXEMPT_PATTERNS.includes(zone.patterns));

const BANNED_SPELLINGS = [
  {
    name: "Claude Code's state directory as a bare literal",
    report: HOST_DIRECTORY_REPORT,
    source: `export const stateDir = ".claude";\n`,
  },
  {
    name: "a Claude agents directory inside a template",
    report: HOST_DIRECTORY_REPORT,
    source: `export const agentsAt = (root: string): string => \`\${root}/.claude/agents\`;\n`,
  },
  {
    name: "Codex's state directory as a bare literal",
    report: HOST_DIRECTORY_REPORT,
    source: `export const codexDir = ".codex";\n`,
  },
  {
    name: "a Codex skills directory inside a template",
    report: HOST_DIRECTORY_REPORT,
    source: `export const skillsAt = (root: string): string => \`\${root}/.codex/skills\`;\n`,
  },
  {
    name: "the committed Codex project skills directory",
    report: HOST_DIRECTORY_REPORT,
    source: `export const projectSkills = ".agents/skills";\n`,
  },
  // A file, not a directory: Codex keeps the equivalent in `$CODEX_HOME/config.toml`.
  {
    name: "Claude Code's own state file",
    report: HOST_DIRECTORY_REPORT,
    source: `export const hostState = ".claude.json";\n`,
  },
  {
    name: "Claude Code's state file inside a template",
    report: HOST_DIRECTORY_REPORT,
    source: `export const stateAt = (home: string): string => \`\${home}/.claude.json\`;\n`,
  },
  {
    name: "a compiled agent's extension",
    report: HOST_EXTENSION_REPORT,
    source: `export const agentExtension = ".toml";\n`,
  },
  {
    name: "the glob that lists compiled agents",
    report: HOST_EXTENSION_REPORT,
    source: `export const agentGlob = "*.toml";\n`,
  },
] as const;

/** Prefix-sharing names that must be left alone, by this ban and the source-folder ban alike. */
const ALLOWED_SPELLINGS = [
  {
    name: "a plugin manifest directory",
    source: `export const manifest = ".claude-plugin/plugin.json";\n`,
  },
  {
    name: "the provider's own name",
    source: `export const provider = "claude";\n`,
  },
  {
    name: "Codex's configuration file",
    source: `export const codexConfig = "config.toml";\n`,
  },
  {
    name: "a bare directory segment the layout module joins",
    source: `export const agentsSegment = "agents";\n`,
  },
  {
    name: "a dotfile whose name merely begins with the host's",
    source: `export const rc = ".codexrc";\n`,
  },
];

const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = ZONES.length * BANNED_SPELLINGS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS = ZONES.length * ALLOWED_SPELLINGS.length * LINT_PASS_BUDGET_MS;

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

function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.startsWith(report));
}

describe("a host path written outside the layout module", () => {
  /** A zone with no file to lint reads exactly like a zone that passed. */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_SYNTAX}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /** A vanished exemption would hand every zone to the reported half, which passes. */
  it("still finds each zone the ban is deliberately lifted in", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, or it was removed and its module is now banned",
    ).toStrictEqual(EXEMPT_PATTERNS);
  });

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
        for (const spelling of BANNED_SPELLINGS) {
          const messages = await messagesReportedAgainst(eslint, spelling.source, subject);

          expect(
            reports(messages, spelling.report),
            `the zone eslint.config.js declares for '${patterns}' accepts ${spelling.name} — the selectors do not reach it, and its options were not restated, measured on '${subject}'`,
          ).toBe(true);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );

  it("tells an author what to do when no role answers the path it condemned", async () => {
    const eslint = new ESLint({ cwd: CLI_ROOT });
    const zone = REPORTED_ZONES.filter(isMeasurable)[0];
    if (zone === undefined) throw new Error("no reported zone has a file to lint");

    const messages = await messagesReportedAgainst(
      eslint,
      `export const hostState = ".claude.json";\n`,
      zone.subject,
    );

    expect(
      messages.some((message) => message.includes(FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS)),
      "the ban condemns a host state file, so without this clause its remedy names six roles and none of them is the one to call",
    ).toBe(true);
  });

  it(
    "is left alone in the layout module, in a spec, in the mirror and in the rostered backlog",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of EXEMPT_ZONES.filter(isMeasurable)) {
        for (const spelling of BANNED_SPELLINGS) {
          const messages = await messagesReportedAgainst(eslint, spelling.source, subject);

          expect(
            reports(messages, spelling.report),
            `the zone eslint.config.js declares for '${patterns}' condemns ${spelling.name} — it is where the host roles are answered, recorded or deliberately copied, measured on '${subject}'`,
          ).toBe(false);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );
});

describe("a name that merely shares a prefix with a host path", () => {
  it(
    "is left alone in every zone, by this ban and by the source-folder ban beside it",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of ZONES.filter(isMeasurable)) {
        for (const spelling of ALLOWED_SPELLINGS) {
          const messages = await messagesReportedAgainst(eslint, spelling.source, subject);

          expect(
            {
              hostDirectory: reports(messages, HOST_DIRECTORY_REPORT),
              hostExtension: reports(messages, HOST_EXTENSION_REPORT),
              sourceFolder: reports(messages, SOURCE_FOLDER_REPORT),
            },
            `the zone eslint.config.js declares for '${patterns}' condemns ${spelling.name} — a selector has outgrown the names it is written for, measured on '${subject}'`,
          ).toStrictEqual({ hostDirectory: false, hostExtension: false, sourceFolder: false });
        }
      }
    },
    ALLOWED_TIMEOUT_MS,
  );
});
