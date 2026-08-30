/**
 * The types-half renderers live in `@workspace/compile/config-types-source`, so the editor's
 * output preview draws the same `config-types.ts` an install writes. The half that reads disk is
 * `config-types-io.ts`. This module is the surface both are read through, unchanged for every
 * caller.
 */
export {
  assembleConfigTypesSource,
  deriveCategories,
  deriveDomains,
  generateBlankGlobalConfigTypesSource,
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
  PROJECT_CONFIG_INTERFACE_AFTER,
  PROJECT_CONFIG_TYPES_BEFORE,
  STACK_AGENT_CONFIG_LOOSE_LINE,
  type ConfigTypesExtras,
  type ProjectConfigTypesOptions,
} from "@workspace/compile/config-types-source";

export {
  buildConfigTypesBackgroundData,
  getGlobalConfigTypesPath,
  regenerateConfigTypes,
  type ConfigTypesBackgroundData,
} from "./config-types-io.js";
