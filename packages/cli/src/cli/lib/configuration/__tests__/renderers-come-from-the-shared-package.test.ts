/** The CLI's writers must BE `@workspace/compile`'s functions and declare no local copy. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as agentSource from "@workspace/compile/agent-source";
import * as configSource from "@workspace/compile/config-source";
import * as configTypesSource from "@workspace/compile/config-types-source";
import * as globalConfig from "@workspace/compile/global-config";
import * as seedToConfig from "@workspace/compile/seed-to-config";
import * as sharedRoot from "@workspace/compile";

import { DIRS, STANDARD_DIRS, STANDARD_FILES } from "../../../consts.js";
import { bytewise } from "../../../utils/string.js";
import {
  stampProvenanceMarker,
  provenanceMarker,
  hasProvenanceMarker,
} from "../../agents/agent-provenance.js";
import {
  buildAgentTemplateContext,
  sanitizeCompiledAgentData,
  sanitizeLiquidSyntax,
} from "../../compiler.js";
import {
  buildStackProperty,
  generateProjectConfigFromSkills,
  isScopePairCompatible,
  splitConfigByScope,
} from "../config-generator.js";
import { seedToInstallSelection } from "../../seed/seed-to-selection.js";
import {
  assembleConfigTypesSource,
  deriveCategories,
  deriveDomains,
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
  PROJECT_CONFIG_INTERFACE_AFTER,
  PROJECT_CONFIG_TYPES_BEFORE,
  STACK_AGENT_CONFIG_LOOSE_LINE,
} from "../config-types-writer.js";
import { generateConfigSource } from "../config-writer.js";
import { DEFAULT_SOURCE } from "../config.js";
import { mergeGlobalConfigs } from "../../config-gate/propagate.js";

const CLI_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Pairs, not a name loop, so a vanished symbol is a compile error rather than undefined. */
const RE_EXPORTED: readonly (readonly [string, unknown, unknown])[] = [
  ["generateConfigSource", generateConfigSource, configSource.generateConfigSource],
  [
    "generateConfigTypesSource",
    generateConfigTypesSource,
    configTypesSource.generateConfigTypesSource,
  ],
  [
    "generateProjectConfigTypesSource",
    generateProjectConfigTypesSource,
    configTypesSource.generateProjectConfigTypesSource,
  ],
  [
    "assembleConfigTypesSource",
    assembleConfigTypesSource,
    configTypesSource.assembleConfigTypesSource,
  ],
  ["deriveCategories", deriveCategories, configTypesSource.deriveCategories],
  ["deriveDomains", deriveDomains, configTypesSource.deriveDomains],
  [
    "PROJECT_CONFIG_TYPES_BEFORE",
    PROJECT_CONFIG_TYPES_BEFORE,
    configTypesSource.PROJECT_CONFIG_TYPES_BEFORE,
  ],
  [
    "PROJECT_CONFIG_INTERFACE_AFTER",
    PROJECT_CONFIG_INTERFACE_AFTER,
    configTypesSource.PROJECT_CONFIG_INTERFACE_AFTER,
  ],
  [
    "STACK_AGENT_CONFIG_LOOSE_LINE",
    STACK_AGENT_CONFIG_LOOSE_LINE,
    configTypesSource.STACK_AGENT_CONFIG_LOOSE_LINE,
  ],
  ["buildAgentTemplateContext", buildAgentTemplateContext, agentSource.buildAgentTemplateContext],
  ["sanitizeCompiledAgentData", sanitizeCompiledAgentData, agentSource.sanitizeCompiledAgentData],
  ["sanitizeLiquidSyntax", sanitizeLiquidSyntax, agentSource.sanitizeLiquidSyntax],
  ["provenanceMarker", provenanceMarker, agentSource.provenanceMarker],
  ["hasProvenanceMarker", hasProvenanceMarker, agentSource.hasProvenanceMarker],
  ["stampProvenanceMarker", stampProvenanceMarker, agentSource.stampProvenanceMarker],
  ["bytewise", bytewise, sharedRoot.bytewise],
  [
    "generateProjectConfigFromSkills",
    generateProjectConfigFromSkills,
    seedToConfig.generateProjectConfigFromSkills,
  ],
  ["splitConfigByScope", splitConfigByScope, seedToConfig.splitConfigByScope],
  ["buildStackProperty", buildStackProperty, seedToConfig.buildStackProperty],
  ["isScopePairCompatible", isScopePairCompatible, seedToConfig.isScopePairCompatible],
  ["seedToInstallSelection", seedToInstallSelection, seedToConfig.seedToInstallSelection],
  ["mergeGlobalConfigs", mergeGlobalConfigs, globalConfig.mergeGlobalConfigs],
  // A string, so this compares values; the declaration check below holds it to one home.
  ["DEFAULT_SOURCE", DEFAULT_SOURCE, sharedRoot.DEFAULT_SOURCE],
  // Objects, so identity means something: a copy compares equal by value but fails this.
  ["STANDARD_FILES", STANDARD_FILES, sharedRoot.STANDARD_FILES],
  ["STANDARD_DIRS", STANDARD_DIRS, sharedRoot.STANDARD_DIRS],
  ["DIRS", DIRS, sharedRoot.DIRS],
];

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

describe("the CLI's renderers", () => {
  for (const [name, fromCli, fromPackage] of RE_EXPORTED) {
    it(`exports the package's own ${name}`, () => {
      expect(
        fromCli,
        `${name} must BE @workspace/compile's, not a second declaration that agrees with it today`,
      ).toBe(fromPackage);
    });
  }
});

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
