/**
 * One host's plugin functions may be imported in one directory, and the linter is what holds that.
 *
 * `source-folder-literals-are-funnelled.test.ts` and `host-path-literals-are-funnelled.test.ts` are
 * the two siblings to read first: same derivation, same two-halves discipline, a different subject.
 * Those guard the folder names this product writes and the directories the hosts own. This one
 * guards the CALLS — `claudePluginInstall`, `claudePluginMarketplaceAdd` and the rest — which is
 * the class neither of them can see, because a call writes no path at all.
 *
 * **Why the census in `hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts` is not
 * enough on its own.** That one reads the tree and reports a caller that exists; this one reports
 * a caller as it is being written, in the editor, with the remedy in the message. They fail apart
 * as well: the census is a substring scan and cannot tell an import from a comment, while the rule
 * reads the import and cannot see a name reached any other way. Neither is the other's restatement.
 *
 * **`no-restricted-imports` rather than a `no-restricted-syntax` selector**, for the reason R1's
 * source-folder symbol ban already gives: that rule's options do not merge across flat-config
 * blocks, so a file exempt from one selector is exempt from ALL of them — and `lib/hosts/` must
 * keep every other restriction while losing this one.
 *
 * **The zone roster is DERIVED from the config**, through `lintZonesIn`, for the reason that helper
 * exists: a hand-written roster records the blocks somebody remembered, and this rule's options do
 * not merge, so a block declaring it for a reason of its own silently drops every group it does not
 * restate. What is hand-written is only where the ban is deliberately LIFTED, and those are
 * identified by the FILE each zone owns rather than by the block's pattern string — the pattern is
 * the implementer's to write, the directory it has to cover is not.
 *
 * **The message's own opening clause is fixed here** because the assertions key on it, and because
 * a ban with no remedy in it is a dead end: `host-path-literals-are-funnelled.test.ts` carries the
 * 2026-09-21 ruling that produced that rule, where a condemned spelling had no role to call and the
 * author was left with nothing to do. The remedy this one names is `hostFor`.
 */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

/** The rule the ban is written under, and the rule the exemptions have to restate around. */
const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Enough of the message to name which ban reported, written out rather than imported. */
const CLAUDE_HOST_REPORT = "The host's plugin commands are reached through a host";

/**
 * The half that makes the ban a funnel rather than a dead end, pinned separately because the two
 * fail apart: the group can go on reporting while the message loses the sentence, and the report
 * assertion above stays green through it.
 */
const FUNNEL_TO_THE_HOST = "hostFor";

/**
 * Where the ban is deliberately lifted, named by a file the zone owns.
 *
 * `lib/hosts/` is the seam itself — the one directory these functions are meant to be imported in,
 * and the module the message points every other caller at. `utils/fs.ts` turns the whole rule off
 * for a reason of its own (it IS the raw-write wrapper), so it can neither carry this ban nor be
 * asked to.
 *
 * Identified by subject rather than by the block's `files` pattern: an exemption is a decision
 * about a DIRECTORY, and pinning the pattern string would redden this spec for a block that was
 * written a different way and covers exactly the same files.
 */
const EXEMPT_SUBJECT_PREFIXES = ["src/cli/lib/hosts/", "src/cli/utils/fs.ts"];

/** A zone with a file to lint. One without is a config defect, reported by its own gate below. */
function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

function isExempt(zone: LintZone & { subject: string }): boolean {
  return EXEMPT_SUBJECT_PREFIXES.some((prefix) => zone.subject.startsWith(prefix));
}

const ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_IMPORTS, CLI_ROOT);
const MEASURABLE = ZONES.filter(isMeasurable);
const EXEMPT_ZONES = MEASURABLE.filter(isExempt);
const REPORTED_ZONES = MEASURABLE.filter((zone) => !isExempt(zone));

/**
 * Every way one host's plugin functions arrive, each of which must be refused outside the seam.
 *
 * The re-export is not a variant of the import: `no-restricted-imports` reads `export … from`
 * exactly as it reads `import`, and `e2e/helpers/test-utils.ts` re-exporting seven of these names
 * is the shape that would otherwise be the bypass — a caller imports the barrel and never names
 * the module the ban is written about. `CONFIG_WRITER_IMPORTS` lost a rule to that shape once
 * already.
 *
 * The availability probe is in the list for the reason the census beside it gives: a caller holding
 * `isClaudeCLIAvailable` is a caller that has already decided which host it is talking to.
 */
const BANNED_IMPORTS = [
  {
    name: "a plugin install reached from the exec utilities",
    source: `import { claudePluginInstall } from "../../utils/exec.js";\nexport const go = claudePluginInstall;\n`,
  },
  {
    name: "a plugin install reached from the extensionless specifier",
    source: `import { claudePluginInstall } from "../../utils/exec";\nexport const go = claudePluginInstall;\n`,
  },
  {
    name: "a marketplace verb",
    source: `import { claudePluginMarketplaceAdd } from "../../utils/exec.js";\nexport const go = claudePluginMarketplaceAdd;\n`,
  },
  {
    name: "the two-scope removal",
    source: `import { claudePluginUninstallBestEffort } from "../../utils/exec.js";\nexport const go = claudePluginUninstallBestEffort;\n`,
  },
  {
    name: "the availability probe",
    source: `import { isClaudeCLIAvailable } from "../../utils/exec.js";\nexport const go = isClaudeCLIAvailable;\n`,
  },
  {
    name: "a re-export, which is how a ban on an import is walked around",
    source: `export { claudePluginInstall } from "../../utils/exec.js";\n`,
  },
] as const;

/**
 * What the ban must leave alone, and the half that makes it a measurement rather than a guess.
 *
 * Each is live in this repository today or is the remedy the message names. The spawn wrapper and
 * the validators stay in `utils/exec.ts` by the plan's own wording, so an import of `execCommand`
 * is an ordinary import from an ordinary module and always will be.
 */
const ALLOWED_IMPORTS = [
  {
    name: "the spawn wrapper the exec utilities keep",
    source: `import { execCommand } from "../../utils/exec.js";\nexport const go = execCommand;\n`,
  },
  {
    name: "the door the ban's own message points at",
    source: `import { hostFor } from "../hosts/host-for.js";\nexport const go = hostFor;\n`,
  },
  {
    name: "a local name that merely begins the same way",
    source: `const claudePluginRef = "a@b";\nexport const go = claudePluginRef;\n`,
  },
];

/** What one in-process, type-aware ESLint pass over one fixture is allowed to take. */
const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = ZONES.length * BANNED_IMPORTS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS = ZONES.length * ALLOWED_IMPORTS.length * LINT_PASS_BUDGET_MS;

/**
 * The messages the repository's own ESLint config reports against `source` read as `zone`.
 *
 * The config is LOADED rather than restated: a second copy of the groups here could not tell a rule
 * that stopped matching from one that was never configured.
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

/**
 * Whether any message reported CARRIES `report` — the ban naming itself.
 *
 * `includes` rather than `startsWith`, and that is a fact about the rule rather than a loosening:
 * `no-restricted-imports` never renders a custom message on its own. Measured against this
 * repository's config on 2026-09-21, the whole message is
 *
 * ```
 * 'claudePluginInstall' import from '../../utils/exec.js' is restricted from being used by a pattern. The host's plugin commands are reached through a host, not by name: …
 * ```
 *
 * — ESLint's own `patternAndImportNameWithCustomMessage`, whose text is fixed and unreachable from
 * a config. The two sibling specs this file was written from guard `no-restricted-syntax`
 * selectors, and THAT rule does render its message verbatim, which is where the `startsWith` came
 * from. The clause is still what says WHICH ban reported, which is the whole of what this asks.
 */
function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.includes(report));
}

describe("a host's plugin function imported outside the seam", () => {
  /**
   * The precondition every loop rests on. A block declaring the rule for files that are not there,
   * or for files a later block has already taken, leaves nothing to lint as that zone — which reads
   * exactly like a zone that passed.
   */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_IMPORTS}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /**
   * The seam has to BE a zone of its own, and that is not a detail of how the config is written.
   * With no block for it, the ban either reaches the seam — leaving the Claude host unable to
   * import the functions it is made of — or it reaches nothing at all.
   */
  it("gives the seam a zone with the ban lifted in it", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.subject).filter((subject) =>
        subject.startsWith("src/cli/lib/hosts/"),
      ).length,
      "no config block owns a file under src/cli/lib/hosts/, so the ban has nowhere to be lifted and the Claude host cannot import what it wraps",
    ).toBeGreaterThan(0);
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

      for (const { patterns, subject } of REPORTED_ZONES) {
        for (const banned of BANNED_IMPORTS) {
          const messages = await messagesReportedAgainst(eslint, banned.source, subject);

          expect(
            reports(messages, CLAUDE_HOST_REPORT),
            `the zone eslint.config.js declares for '${patterns}' accepts ${banned.name} — the group does not reach it, and its options were not restated, measured on '${subject}'`,
          ).toBe(true);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );

  it("tells an author which door to go through instead", async () => {
    const eslint = new ESLint({ cwd: CLI_ROOT });
    const zone = REPORTED_ZONES[0];
    if (zone === undefined) throw new Error("no reported zone has a file to lint");

    const [banned] = BANNED_IMPORTS;
    const messages = await messagesReportedAgainst(eslint, banned.source, zone.subject);

    expect(
      messages.some((message) => message.includes(FUNNEL_TO_THE_HOST)),
      "the ban condemns the only call a caller knows about and names no replacement, so the remedy is to add an eslint-disable",
    ).toBe(true);
  });

  it(
    "is left alone in the seam itself",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of EXEMPT_ZONES) {
        for (const banned of BANNED_IMPORTS) {
          const messages = await messagesReportedAgainst(eslint, banned.source, subject);

          expect(
            reports(messages, CLAUDE_HOST_REPORT),
            `the zone eslint.config.js declares for '${patterns}' condemns ${banned.name} — it is the seam these functions live behind, measured on '${subject}'`,
          ).toBe(false);
        }
      }
    },
    BANNED_TIMEOUT_MS,
  );
});

describe("an import that merely comes from the same module", () => {
  it(
    "is left alone in every zone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of MEASURABLE) {
        for (const allowed of ALLOWED_IMPORTS) {
          const messages = await messagesReportedAgainst(eslint, allowed.source, subject);

          expect(
            reports(messages, CLAUDE_HOST_REPORT),
            `the zone eslint.config.js declares for '${patterns}' condemns ${allowed.name} — the group has outgrown the names it is written for, measured on '${subject}'`,
          ).toBe(false);
        }
      }
    },
    ALLOWED_TIMEOUT_MS,
  );
});
