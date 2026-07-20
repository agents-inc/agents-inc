export {
  DEFAULT_SOURCE,
  SOURCE_ENV_VAR,
  type BrandingConfig,
  type SourceEntry,
  type ResolvedConfig,
  type ResolvedBranding,
  getProjectConfigPath,
  loadProjectSourceConfig,
  loadGlobalSourceConfig,
  resolveSource,
  resolveAuthor,
  resolveBranding,
  resolveAllSources,
  isLocalSource,
  validateSourceFormat,
} from "./config";

export {
  type ProjectConfigOptions,
  generateProjectConfigFromSkills,
  buildStackProperty,
} from "./config-generator";

export {
  type MergeContext,
  type MergeResult,
  type AuthoritativeScope,
  mergeConfigs,
  mergeWithExistingConfig,
} from "./config-merger";

export { saveSourceToProjectConfig } from "./config-saver";

export {
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
  activeProjectAgentNames,
  effectivelyExcludedSkillIds,
} from "./scope-predicates";

export {
  type LoadedProjectConfig,
  loadProjectConfig,
  loadProjectConfigFromDir,
  validateProjectConfig,
} from "./project-config";

export { type SourceSummary, addSource, removeSource, getSourceSummary } from "./source-manager";

export { defineConfig } from "./define-config";
export { defaultCategories } from "./default-categories";
export { defaultRules } from "./default-rules";
export { defaultStacks } from "./default-stacks";
export { loadConfig } from "./config-loader";
export { generateConfigSource } from "./config-writer";
export {
  generateConfigTypesSource,
  generateProjectConfigTypesSource,
  getGlobalConfigTypesPath,
  type ConfigTypesBackgroundData,
  loadConfigTypesDataInBackground,
  regenerateConfigTypes,
} from "./config-types-writer";
