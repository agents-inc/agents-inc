/** One host's plugin functions may be imported only in `lib/hosts/`. */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");
const ESLINT_CONFIG = await flatConfigAt(ESLINT_CONFIG_PATH);

/** Written out, not imported. */
const CLAUDE_HOST_REPORT = "The host's plugin commands are reached through a host";

/** Pinned apart: the group can keep reporting after the message loses its remedy. */
const FUNNEL_TO_THE_HOST = "hostFor";

/** By a file each zone owns, not its pattern. `utils/fs.ts` turns the rule off for itself. */
const EXEMPT_SUBJECT_PREFIXES = ["src/cli/lib/hosts/", "src/cli/utils/fs.ts"];

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

/** A re-export counts too: importing a re-exporting barrel would otherwise bypass the ban. */
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

const LINT_PASS_BUDGET_MS = 2_500;

const BANNED_TIMEOUT_MS = ZONES.length * BANNED_IMPORTS.length * LINT_PASS_BUDGET_MS;
const ALLOWED_TIMEOUT_MS = ZONES.length * ALLOWED_IMPORTS.length * LINT_PASS_BUDGET_MS;

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

/** `includes`: `no-restricted-imports` wraps the custom message in ESLint's own fixed text. */
function reports(messages: readonly string[], report: string): boolean {
  return messages.some((message) => message.includes(report));
}

describe("a host's plugin function imported outside the seam", () => {
  /** A zone with no file to lint reads exactly like a zone that passed. */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${RESTRICTED_IMPORTS}' for a zone holding no file of its own, so nothing can be linted as it`,
    ).toStrictEqual([]);
  });

  /** Without its own zone, the ban either reaches the seam or reaches nothing. */
  it("gives the seam a zone with the ban lifted in it", () => {
    expect(
      EXEMPT_ZONES.map((zone) => zone.subject).filter((subject) =>
        subject.startsWith("src/cli/lib/hosts/"),
      ).length,
      "no config block owns a file under src/cli/lib/hosts/, so the ban has nowhere to be lifted and the Claude host cannot import what it wraps",
    ).toBeGreaterThan(0);
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
