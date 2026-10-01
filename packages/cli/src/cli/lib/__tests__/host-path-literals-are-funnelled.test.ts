/**
 * A HOST's directory may be written in one place, and the linter is what holds that.
 *
 * `install-layout.ts` answers the host roles per provider: `.claude/agents` on Claude against
 * `<repo>/.codex/agents` or `$CODEX_HOME/agents` on Codex, `.claude/skills` on Claude against
 * `.agents/skills` in a Codex repo, `.md` against `.toml` for a compiled agent. So a path composed
 * from a literal is a path that is right on one host and silently wrong on the other — the Codex
 * plan's Risk 7, where the CLI writes a directory the host never reads, exits 0, and every test
 * stays green. (This file read "NOTHING at all at Codex project scope" until 2026-09-21, on a
 * measurement a 23-run tie-break overturned; `codexProjectRoles` carries the correction and the
 * trust condition that comes with it.)
 *
 * This is the source-folder ban's shape one layer out, and the sibling file
 * `source-folder-literals-are-funnelled.test.ts` is the one to read first: same derivation, same
 * two-halves discipline, a different set of names. The half that is not decoration is the SECOND
 * one — the names here are a character away from names this repository is full of.
 * `.claude-plugin/plugin.json` is a plugin manifest, `.claude-src` is the legacy source folder
 * (the sibling ban's subject, not this one's), `config.toml` is Codex's own configuration file
 * which the layout module itself writes, and `claude` on its own is a provider name. A rule
 * condemning any of those would be reverted within the hour, so each is fed to this config here
 * and required to be silent.
 *
 * **Assertions are on the MESSAGE, not on the rule id.** Both bans are written under
 * `no-restricted-syntax`, so a fixture that trips the source-folder selectors reports the same rule
 * id as one that trips these — and an allowed-spelling assertion reading the id alone would fail
 * for the wrong reason, or pass because some other selector happened to fire. Every expected string
 * is a LITERAL rather than an import from `eslint.config.js`: an assertion bound to the text the
 * linter renders moves with it and could never fail.
 *
 * **The zone roster is DERIVED from the config**, through `lintZonesIn` in `helpers/lint-zones.ts`,
 * for the reason that helper exists: a hand-written roster records the blocks somebody remembered,
 * and this rule's options do not merge across blocks, so a zone that declares
 * `no-restricted-syntax` for a reason of its own silently drops every selector it does not restate.
 * What is hand-written is only the EXEMPTIONS below, each with the reason it is one. A block added
 * to the config that is not one of those must report, so a new zone is measured by arriving rather
 * than by being remembered.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

/** The rule both bans are written under, which is why nothing below asserts on its id. */
const RESTRICTED_SYNTAX = "no-restricted-syntax";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/**
 * Enough of each message to name which ban reported, written out rather than imported.
 *
 * The directory half and the extension half are separate messages because they point at different
 * roles — one at the path answers, one at `agentCodec` — and a fixture proving one says nothing
 * about the other.
 */
const HOST_DIRECTORY_REPORT = "A host path is resolved, not written";
const HOST_EXTENSION_REPORT = "A compiled agent's extension is the host's, not a constant";

/**
 * The half of the directory message that makes the ban a FUNNEL rather than a dead end, and the
 * only thing standing between an author naming `.claude.json` and a rule with no remedy in it.
 *
 * Pinned separately from the report itself because the two fail apart: the selector can go on
 * reporting while the message loses the sentence, and the report assertion above would stay green
 * through it — which is the state the 2026-09-21 ruling found and fixed.
 */
const FUNNEL_FOR_A_PATH_NO_ROLE_ANSWERS = "Where no role above answers the path you need";

/** The sibling ban's own message, so an allowed fixture that trips IT is not read as a pass. */
const SOURCE_FOLDER_REPORT = "The source folder's name is resolved, not written";

/**
 * The zones the host-path ban is deliberately LIFTED in, each by the patterns its block selects.
 *
 * Written out because each is a decision, and the derivation cannot tell a zone that dropped the
 * selectors on purpose from one that dropped them by restating the rule and forgetting.
 */
const EXEMPT_PATTERNS = [
  // Specs and their fixtures. A fixture spelling `.claude/agents` is RECORDING what Claude Code
  // does, not deciding where this CLI writes, and the host's own directory name is not the thing
  // that is changing — which is exactly the asymmetry with the source-folder ban, and the reason
  // that one reaches this zone while this one does not.
  "**/*.test.ts, **/*.test.tsx, **/__tests__/**, **/__mocks__/**, **/e2e/**",
  // The rostered backlog: product files whose user-facing PROSE still spells a host directory. A
  // list that may only shrink, and the one place a pre-existing site can be recorded without an
  // inline directive in a file this step does not own. It was three files and is one as of
  // 2026-09-22 — `installation.ts` and `discover-skills.ts` came off with the Codex narration
  // pass, and `init.tsx` stays for its oclif command DESCRIPTION, which is read at module load
  // with no installation in hand and so has no scope to resolve a path against.
  "src/cli/commands/init.tsx",
  // The spec zone proper, for the reason the first entry carries.
  "**/*.test.ts, **/*.test.tsx",
  // The funnel: the module every role is answered in, and the one this ban's message points at.
  "src/cli/lib/installation/install-layout.ts",
  // The e2e tree's one mirror of the product's path vocabulary, which exists to spell these names
  // rather than import them.
  "e2e/pages/constants.ts",
];

/** A zone with a file to lint. One without is a config defect, reported by its own gate below. */
function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

const ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_SYNTAX, CLI_ROOT);
const REPORTED_ZONES = ZONES.filter((zone) => !EXEMPT_PATTERNS.includes(zone.patterns));
const EXEMPT_ZONES = ZONES.filter((zone) => EXEMPT_PATTERNS.includes(zone.patterns));

/**
 * Every spelling of a host path that must be refused outside the layout module.
 *
 * Both node types for the directory half — a bare string literal and a template's static text are
 * two different selectors, and one says nothing about the other. The extension half is a literal
 * only: an extension inside a template is a filename being composed, which is the `.md` twin's
 * territory and is named in the config's own note as deferred.
 */
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
  // Claude Code's own per-user state FILE, not a directory, and the case that made the ruling of
  // 2026-09-21 necessary: the selector already reported it — the trailing `[^\w-]` is satisfied by
  // the `.` — while no role the message named answered it, so it was condemned with nowhere to go
  // and pinned by nothing. Banned, because `~/.claude.json` is Claude's where Codex keeps the
  // equivalent in `$CODEX_HOME/config.toml`, and the message now carries the funnel: where no role
  // answers the path, the role is added to `install-layout.ts` rather than composed at the site.
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

/**
 * Names that share a prefix with a banned one and must be left alone. Each is live in this
 * repository or in the layout module's own answers, which is what makes this half a measurement
 * rather than a guess.
 *
 * None of them may trip the SOURCE-folder ban either, or the silence asserted below would be
 * measuring the wrong selector — which is why `.claude-src` is not among them despite being the
 * nearest miss of all.
 */
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

/** What one in-process, type-aware ESLint pass over one fixture is allowed to take. */
const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = ZONES.length * BANNED_SPELLINGS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS = ZONES.length * ALLOWED_SPELLINGS.length * LINT_PASS_BUDGET_MS;

/**
 * The messages the repository's own ESLint config reports against `source` when it is read as
 * `zone`. The config is LOADED rather than restated — a second copy of the selectors here could
 * not tell a rule that stopped matching from one that was never configured.
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

/** Whether any message reported starts with `report` — the ban naming itself. */
function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.startsWith(report));
}

describe("a host path written outside the layout module", () => {
  /**
   * The precondition every loop rests on, and the half a derivation can get wrong that a roster
   * could not: a block declaring the rule for files that are not there, or for files a later block
   * has already taken, leaves nothing to lint as that zone — which reads exactly like a zone that
   * passed.
   */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_SYNTAX}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /**
   * An exemption that stopped existing leaves the silence loop with nothing to check and no red to
   * say so — the derivation would simply hand every zone to the reported half, which passes.
   */
  it("still finds each zone the ban is deliberately lifted in", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.patterns),
      "a zone named as exempt is no longer a block eslint.config.js declares the rule for — the exemption moved, or it was removed and its module is now banned",
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

  /**
   * A ban whose message names roles that do not answer the path it condemned is a dead end. The
   * ruling of 2026-09-21 kept the ban and made the message say what to do instead, and this is the
   * assertion that keeps the second half attached to the first.
   */
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
