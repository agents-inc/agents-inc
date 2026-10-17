export {
  DEFAULT_SOURCE,
  SOURCE_ENV_VAR,
  type BrandingConfig,
  type SourceEntry,
  type ResolvedConfig,
  type ResolveSourceRequest,
  type ResolvedBranding,
  type SourceCaller,
  getProjectConfigPath,
  loadProjectSourceConfig,
  loadGlobalSourceConfig,
  loadSourceRepoConfig,
  resolveSource,
  resolveAuthor,
  resolveBranding,
  resolvePrimarySourceEntry,
  isDefaultSource,
  isLocalSource,
  isPublicCatalogueCheckout,
  offersBuiltInStacks,
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

export {
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
  activeProjectAgentNames,
  effectivelyExcludedSkillIds,
} from "./scope-predicates";

export {
  type LoadedProjectConfig,
  ConfigLoadError,
  configDirsInPlay,
  findConfigLoadFailures,
  loadInstalledConfig,
  loadProjectConfig,
  loadProjectConfigFromDir,
  validateProjectConfig,
} from "./project-config";

export { defineConfig } from "./define-config";
export { defaultCategories } from "./default-categories";
export { defaultRules } from "./default-rules";
export { ConfigDefaultExportError, loadConfig } from "./config-loader";

// The renderers stay out of the barrel so only config-gate can reach them (eslint-enforced).
export {
  generateProjectConfigTypesSource,
  getGlobalConfigTypesPath,
  type ConfigTypesBackgroundData,
} from "./config-types-writer";
