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
  loadProjectConfig,
  loadProjectConfigFromDir,
  validateProjectConfig,
} from "./project-config";

export { defineConfig } from "./define-config";
export { defaultCategories } from "./default-categories";
export { defaultRules } from "./default-rules";
export { defaultStacks } from "./default-stacks";
export { ConfigDefaultExportError, loadConfig } from "./config-loader";

/**
 * Neither half's renderer is re-exported here, and neither is the writer that
 * renders AND writes the types half. `generateConfigSource`,
 * `generateConfigTypesSource` and `regenerateConfigTypes` remain importable from
 * their own modules by `config-gate/**` and this directory (eslint-enforced), so
 * the gate can drive them — a barrel re-export would hand the same reach to
 * every command.
 */
export {
  generateProjectConfigTypesSource,
  getGlobalConfigTypesPath,
  type ConfigTypesBackgroundData,
  loadConfigTypesDataInBackground,
} from "./config-types-writer";
