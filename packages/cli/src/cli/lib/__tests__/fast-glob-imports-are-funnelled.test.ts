/** `fast-glob` may be imported under `src/cli/` only by `utils/fs.ts` and the dist-staleness guard. */

import path from "path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

const RESTRICTED_IMPORTS = "no-restricted-imports";

const ESLINT_CONFIG = await flatConfigAt(path.join(CLI_ROOT, "eslint.config.js"));

/** Written out, not imported. */
const FAST_GLOB_REPORT = "Scan through glob() from src/cli/utils/fs.ts";

const CLI_SOURCE_PREFIX = "src/cli/";

/** By a file each zone owns: the two modules that wrap fast-glob for everything else. */
const EXEMPT_SUBJECTS = ["src/cli/utils/fs.ts", "src/cli/lib/testing/dist-staleness.ts"];

const FAST_GLOB_SOURCE = `import fg from "fast-glob";\nexport const go = fg;\n`;

const SORTED_GLOB_SOURCE = `import { glob } from "../../utils/fs.js";\nexport const go = glob;\n`;

function isCliZone(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null && zone.subject.startsWith(CLI_SOURCE_PREFIX);
}

const CLI_ZONES = lintZonesIn(ESLINT_CONFIG, RESTRICTED_IMPORTS, CLI_ROOT).filter(isCliZone);
const EXEMPT_ZONES = CLI_ZONES.filter((zone) => EXEMPT_SUBJECTS.includes(zone.subject));
const REPORTED_ZONES = CLI_ZONES.filter((zone) => !EXEMPT_SUBJECTS.includes(zone.subject));

const LINT_PASS_BUDGET_MS = 2_500;
const ZONE_TIMEOUT_MS = CLI_ZONES.length * LINT_PASS_BUDGET_MS;

async function reportsFastGlob(eslint: ESLint, source: string, zone: string): Promise<boolean> {
  const [result] = await eslint.lintText(source, { filePath: path.join(CLI_ROOT, zone) });
  if (result === undefined) throw new Error(`eslint returned no verdict at all for '${zone}'`);

  const unparseable = result.messages.filter((message) => message.fatal);
  if (unparseable.length > 0) {
    throw new Error(`the fixture did not parse as '${zone}', so it asked nothing`);
  }

  return result.messages.some((message) => message.message.includes(FAST_GLOB_REPORT));
}

describe("a fast-glob import under src/cli/", () => {
  it("has both wrapping modules as zones of their own, and zones beyond them", () => {
    expect(EXEMPT_ZONES.map((zone) => zone.subject).sort()).toStrictEqual(
      [...EXEMPT_SUBJECTS].sort(),
    );
    expect(REPORTED_ZONES, "no zone is left for the ban to reach").not.toStrictEqual([]);
  });

  it(
    "is reported in every zone but the two that wrap it",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { patterns, subject } of REPORTED_ZONES) {
        expect(
          await reportsFastGlob(eslint, FAST_GLOB_SOURCE, subject),
          `the zone eslint.config.js declares for '${patterns}' accepts fast-glob, whose matches arrive in the order reads finish, measured on '${subject}'`,
        ).toBe(true);
      }
    },
    ZONE_TIMEOUT_MS,
  );

  it(
    "is left alone in the two modules that wrap it",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { subject } of EXEMPT_ZONES) {
        expect(await reportsFastGlob(eslint, FAST_GLOB_SOURCE, subject), subject).toBe(false);
      }
    },
    ZONE_TIMEOUT_MS,
  );

  it(
    "is not what the sorted glob() is reported as",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const { subject } of REPORTED_ZONES) {
        expect(await reportsFastGlob(eslint, SORTED_GLOB_SOURCE, subject), subject).toBe(false);
      }
    },
    ZONE_TIMEOUT_MS,
  );
});
