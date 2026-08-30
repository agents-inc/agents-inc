/**
 * The CLI's writers call `@workspace/compile`; they do not keep a copy of it.
 *
 * This is the whole acceptance criterion of the extraction. A shared package
 * the editor imports and the CLI does not is a client-side reconstruction with
 * a `package.json`: it renders a preview of bytes nobody produces, and the
 * first person to diff it against a real install stops trusting the thing.
 *
 * Two halves, because either alone passes while the defect is present.
 *
 * **Identity** is what a copy fails. A second declaration of
 * `generateConfigSource` in `config-writer.ts` satisfies every behavioural test
 * in this suite on the day it is written and diverges the first time one side
 * is edited — which is what a shared contract exists to prevent and what no
 * assertion about OUTPUT can see, since the two agree until they do not.
 *
 * **Absence of a local declaration** is what a re-export beside a surviving
 * private copy fails. The module can honestly export the package's function
 * while a stale private one is still what its own callers reach, and identity
 * on the export cannot see past that.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as agentSource from "@workspace/compile/agent-source";
import * as configSource from "@workspace/compile/config-source";
import * as configTypesSource from "@workspace/compile/config-types-source";
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
import { seedToWizardResult } from "../../seed/seed-to-wizard.js";
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

const CLI_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Each symbol the CLI still exports, held against the package value it must BE.
 *
 * Written as pairs rather than as a loop over names so a symbol that stops
 * existing on either side is a compile error at the line that owns it, rather
 * than a lookup that answers `undefined` on both sides and compares equal.
 */
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
  ["seedToWizardResult", seedToWizardResult, seedToConfig.seedToWizardResult],
  // The pure half of consts.ts. Objects, so identity means something here — a
  // copied `STANDARD_FILES` compares equal by value and fails this.
  ["STANDARD_FILES", STANDARD_FILES, sharedRoot.STANDARD_FILES],
  ["STANDARD_DIRS", STANDARD_DIRS, sharedRoot.STANDARD_DIRS],
  ["DIRS", DIRS, sharedRoot.DIRS],
];

/**
 * Every module the extraction empties, and the symbols that must no longer be
 * DECLARED in it. A declaration is `function name(` or `const name =` at the
 * start of a line, optionally exported — which is how each of these reads today.
 *
 * Private helpers are named alongside the exported ones deliberately. They are
 * where a copy actually survives: nobody re-exports `canonicalizeStackOrder`, so
 * an identity check has no handle on it, and it is the function whose absence
 * swapped two rows of a compiled sub-agent.
 */
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
    // consts.ts is the root blocker: it derives PROJECT_ROOT with
    // `fileURLToPath(import.meta.url)` at module load and every renderer
    // reaches it. Its pure half moves and it re-exports, so no CLI call site
    // moves — which is only true if these stop being DECLARED here.
    file: "consts.ts",
    symbols: [
      "CLAUDE_DIR",
      "CLAUDE_SRC_DIR",
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

/**
 * The package specifier each emptied module has to carry, matched without a
 * trailing separator so a barrel import and a subpath import both satisfy it.
 */
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
