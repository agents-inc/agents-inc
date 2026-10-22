/** The modules the renderer extraction emptied declare no local copy of what the package owns. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CLI_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Symbols no longer DECLARED in each module; private helpers too, where copies survive. */
const EMPTIED_MODULES: readonly { file: string; symbols: readonly string[] }[] = [
  {
    file: "lib/configuration/config-writer.ts",
    symbols: [
      "generateConfigSource",
      "generateStandaloneConfig",
      "generateProjectConfigWithInlinedGlobal",
      "canonicalizeStackOrder",
      "canonicalizeFieldOrder",
      "compareNamesInCodeUnitOrder",
      "compactCategoryAssignments",
      "compactStackAssignments",
      "cleanForEmission",
      "CANONICAL_FIELD_ORDER",
    ],
  },
  {
    file: "lib/configuration/config-types-writer.ts",
    symbols: [
      "generateConfigTypesSource",
      "generateProjectConfigTypesSource",
      "assembleConfigTypesSource",
      "generateStackAgentConfig",
      "formatSkillUnion",
      "formatSectionedUnion",
      "formatLiteralUnion",
      "deriveCategories",
      "deriveDomains",
      "EMPTY_UNION_TYPE",
      "MULTI_LINE_THRESHOLD",
    ],
  },
  {
    file: "lib/compiler.ts",
    symbols: [
      "buildAgentTemplateContext",
      "sanitizeCompiledAgentData",
      "sanitizeLiquidSyntax",
      "pluginRefFor",
    ],
  },
  {
    file: "lib/agents/agent-provenance.ts",
    symbols: ["provenanceMarker", "hasProvenanceMarker", "stampProvenanceMarker"],
  },
  { file: "utils/string.ts", symbols: ["bytewise"] },
  {
    file: "lib/config-gate/propagate.ts",
    symbols: [
      "mergeGlobalConfigs",
      "addSessionToGlobal",
      "additiveMergeStack",
      "mergeAgentCategories",
      "appendMissingAssignments",
    ],
  },
  {
    file: "lib/seed/external-skills.ts",
    symbols: [
      "withInstalledName",
      "externalSkillMetadata",
      "skillAuthor",
      "FRONTMATTER_BLOCK",
      "NAME_FIELD",
    ],
  },
  {
    file: "lib/configuration/config.ts",
    symbols: ["DEFAULT_SOURCE"],
  },
  {
    file: "consts.ts",
    symbols: [
      "CLAUDE_DIR",
      "SOURCE_ROOT_DIR",
      "LOCAL_SKILLS_PATH",
      "STANDARD_DIRS",
      "STANDARD_FILES",
      "EJECT_SOURCE",
      "DEFAULT_PLUGIN_NAME",
      "GLOBAL_CONFIG_NAME",
      "LOCAL_PSEUDO_CATEGORY",
      "DIRS",
    ],
  },
];

/** No trailing separator, so a barrel import and a subpath import both match. */
const PACKAGE_SPECIFIER = '"@workspace/compile';

const readCliSource = (file: string): Promise<string> =>
  readFile(path.join(CLI_SRC, file), "utf-8");

describe("the modules the extraction empties", () => {
  for (const { file, symbols } of EMPTIED_MODULES) {
    it(`${file} imports from the package`, async () => {
      expect(await readCliSource(file)).toContain(PACKAGE_SPECIFIER);
    });

    for (const symbol of symbols) {
      it(`${file} no longer declares ${symbol}`, async () => {
        const source = await readCliSource(file);

        expect(
          source,
          `${symbol} is declared in ${file}, so the package's copy is not the one this file uses`,
        ).not.toContain(`\nfunction ${symbol}(`);
        expect(source).not.toContain(`\nexport function ${symbol}(`);
        expect(source).not.toContain(`\nconst ${symbol} `);
        expect(source).not.toContain(`\nexport const ${symbol} `);
      });
    }
  }
});
