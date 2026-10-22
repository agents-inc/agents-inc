/** The CLI's writers must BE `@workspace/compile`'s functions, not copies that agree today. */

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
  // A string, so this compares values; the emptied-modules source check holds it to one home.
  ["DEFAULT_SOURCE", DEFAULT_SOURCE, sharedRoot.DEFAULT_SOURCE],
  // Objects, so identity means something: a copy compares equal by value but fails this.
  ["STANDARD_FILES", STANDARD_FILES, sharedRoot.STANDARD_FILES],
  ["STANDARD_DIRS", STANDARD_DIRS, sharedRoot.STANDARD_DIRS],
  ["DIRS", DIRS, sharedRoot.DIRS],
];

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
