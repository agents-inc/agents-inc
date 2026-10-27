export {
  DEFAULT_SOURCE,
  MarketplaceRefusedError,
  NAMED_MARKETPLACE,
  SOURCE_ENV_VAR,
  type SourceEntry,
  type ResolvedConfig,
  type SourceCaller,
  getProjectConfigPath,
  loadProjectSourceConfig,
  loadGlobalSourceConfig,
  loadSourceRepoConfig,
  resolveSource,
  resolvePrimarySourceEntry,
  isDefaultSource,
  isLocalSource,
  isPublicCatalogueCheckout,
  offersBuiltInStacks,
  validateSourceFormat,
} from "./config";

export { generateProjectConfigFromSkills, buildStackProperty } from "./config-generator";

export {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
} from "./config-merger";

export { isActiveAt, effectivelyExcludedSkillIds } from "./scope-predicates";

export {
  type LoadedProjectConfig,
  ConfigLoadError,
  type ConfigInPlay,
  configsInPlay,
  findConfigLoadFailures,
  loadConfigInPlay,
  loadInstalledConfig,
  loadProjectConfig,
  validateProjectConfig,
} from "./project-config";

export { ConfigDefaultExportError, loadConfig } from "./config-loader";
