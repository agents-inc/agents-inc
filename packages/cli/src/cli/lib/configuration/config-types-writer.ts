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
