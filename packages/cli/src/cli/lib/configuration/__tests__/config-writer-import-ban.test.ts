/**
 * The ban on rendering a config pair outside the gate, held to the specifier
 * the renderers now live behind.
 *
 * `CONFIG_WRITER_IMPORTS` in `eslint.config.js` refuses `generateConfigSource`
 * from any `config-writer` module and the three types-half renderers from any
 * `config-types-writer` module, both globbed with a leading double star.
 * **It matches on the import specifier.** Moving the
 * renderers into `@workspace/compile` changes the specifier, and the rule then
 * matches nothing and reports nothing — silently. No directive is involved, so
 * `reportUnusedDisableDirectives` cannot see it; the config keeps two entries
 * that look exactly as they did the day they worked, and the first person to
 * render a pair outside the gate finds no objection.
 *
 * That is a whole class of failure this repository has no other guard for, so
 * the gate is behavioural: it runs the real config over a synthetic source in a
 * real zone and requires the report, rather than reading the config's own text
 * and agreeing with it.
 *
 * Three of the specs are the ones a re-pointed rule alone would not settle:
 * the OLD specifier has to keep firing, because a re-export from
 * `config-writer.ts` would otherwise become the bypass; the gate's own directory
 * has to stay exempt, because it is the code the ban exists to funnel everything
 * through; and an unrestricted import from the same package has to stay silent,
 * because a rule that refused `@workspace/compile` wholesale would pass the
 * first spec while banning the extraction itself.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** The rule the ban is written as. */
const RESTRICTED_IMPORTS = "no-restricted-imports";

/**
 * An ordinary type-checked CLI source that the ban's own config block covers —
 * `src/**` minus tests minus `src/cli/lib/config-gate/**`. The path must EXIST
 * and be in a TypeScript program: `lintText` resolves it through the project
 * service, and an unresolvable path fails as a parse error rather than as a
 * missing rule, which would read as the ban firing when nothing was asked.
 */
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

/**
 * A lint pass is type-aware and resolves the fixture through the TypeScript
 * project service, so it is slower than an ordinary unit test by two orders of
 * magnitude. Derived from the number of passes rather than stated, so a spec
 * added below does not land a timeout on whoever adds it.
 */
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

      // `config-types-io` is where `regenerateConfigTypes` is DECLARED — the two
      // specifiers above only re-export it, so a caller reaching the declaration
      // directly bypasses a ban that names the re-exports alone. The rule was
      // extended to cover it and nothing here asked, which is the same silent
      // shape the whole file exists to close.
      expect(
        await rulesReportedAgainst(eslint, SOURCES.fromCliConfigTypesIo, BANNED_ZONE),
        "regenerateConfigTypes must be refused at its declaring module, not only at the two that re-export it",
      ).toContain(RESTRICTED_IMPORTS);

      // The control. Without it the first two specs are satisfied by a rule that
      // refuses the whole package, which would ban the extraction it exists to
      // permit — and would read as a pass.
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
