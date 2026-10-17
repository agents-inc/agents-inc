/**
 * `CONFIG_WRITER_IMPORTS` matches on import specifiers, so moving a renderer silently disarms it.
 * Behavioural: lints a synthetic source with the real config and requires the report.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

const RESTRICTED_IMPORTS = "no-restricted-imports";

/** Must exist in a TypeScript program, or the lint fails as a parse error rather than the rule. */
const BANNED_ZONE = "src/cli/lib/content-validator.ts";

/** The one directory the ban exempts, because it is the code that renders pairs. */
const GATE_ZONE = "src/cli/lib/config-gate/index.ts";

const SOURCES = {
  fromPackageConfigSource: `import { generateConfigSource } from "@workspace/compile/config-source";\nexport const rendered = generateConfigSource;\n`,
  fromPackageConfigTypesSource: `import { generateConfigTypesSource } from "@workspace/compile/config-types-source";\nexport const rendered = generateConfigTypesSource;\n`,
  fromCliConfigWriter: `import { generateConfigSource } from "../configuration/config-writer.js";\nexport const rendered = generateConfigSource;\n`,
  fromCliConfigTypesWriter: `import { assembleConfigTypesSource } from "../configuration/config-types-writer.js";\nexport const rendered = assembleConfigTypesSource;\n`,
  fromCliConfigTypesIo: `import { regenerateConfigTypes } from "../configuration/config-types-io.js";\nexport const regenerate = regenerateConfigTypes;\n`,
  unrestrictedFromPackage: `import { bytewise } from "@workspace/compile";\nexport const compare = bytewise;\n`,
} as const;

/** Type-aware lint passes are slow; this is the budget per pass. */
const LINT_PASS_BUDGET_MS = 2_500;
const PASSES = 8;

async function rulesReportedAgainst(
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

  return result.messages
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

describe("the config-pair renderer import ban", () => {
  it(
    "fires on the package's renderers, keeps firing on the CLI's re-exports, and exempts the gate",
    { timeout: PASSES * LINT_PASS_BUDGET_MS },
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromPackageConfigSource, BANNED_ZONE),
        "generateConfigSource from @workspace/compile/config-source must be refused — the rule matches on the specifier, so a move that does not repoint it stops firing with nothing to say so",
      ).toContain(RESTRICTED_IMPORTS);

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromPackageConfigTypesSource, BANNED_ZONE),
        "generateConfigTypesSource from @workspace/compile/config-types-source must be refused for the same reason",
      ).toContain(RESTRICTED_IMPORTS);

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromCliConfigWriter, BANNED_ZONE),
        "the old specifier must keep firing, or a re-export from config-writer.ts becomes the bypass",
      ).toContain(RESTRICTED_IMPORTS);

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromCliConfigTypesWriter, BANNED_ZONE),
        "the old types-half specifier must keep firing for the same reason",
      ).toContain(RESTRICTED_IMPORTS);

      // `config-types-io` declares `regenerateConfigTypes`; the other specifiers only re-export it.
      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromCliConfigTypesIo, BANNED_ZONE),
        "regenerateConfigTypes must be refused at its declaring module, not only at the two that re-export it",
      ).toContain(RESTRICTED_IMPORTS);

      // The control: a rule refusing the whole package would pass the specs above.
      expect(
        await rulesReportedAgainst(eslint, SOURCES.unrestrictedFromPackage, BANNED_ZONE),
        "the ban names renderers, not the package: an unrestricted import from @workspace/compile must be silent",
      ).not.toContain(RESTRICTED_IMPORTS);

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromPackageConfigSource, GATE_ZONE),
        "config-gate/ is the code the ban funnels every pair render through, so it stays exempt",
      ).not.toContain(RESTRICTED_IMPORTS);

      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromCliConfigWriter, GATE_ZONE),
        "the gate reaches the CLI's own re-export too, and that has always been allowed",
      ).not.toContain(RESTRICTED_IMPORTS);
    },
  );
});
