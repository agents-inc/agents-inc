export {
  type InstallMode,
  type Installation,
  detectGlobalInstallation,
  INSTALL_MODE_LABELS,
  detectInstallation,
  detectProjectInstallation,
  getInstallationOrThrow,
} from "./installation";

export {
  type EjectInstallOptions,
  type EjectInstallResult,
  type PluginConfigResult,
  installEject,
  installPluginConfig,
  buildAndMergeConfig,
  writeConfigFile,
  writeScopedConfigs,
  setConfigMetadata,
  buildEjectSkillsMap,
  buildCompileAgents,
  buildAgentScopeMap,
  deregisterProjectPath,
  propagateGlobalChangesToProjects,
  pruneGlobalEntriesFromRegisteredProjects,
  regenerateScopeConfigTypes,
} from "./local-installer";

export { isHomeDirectory } from "./is-home-directory";
export { installBaseDir, resolveInstallPaths, type InstallPaths } from "./install-base-dir";

export {
  type SkillMigration,
  type MigrationPlan,
  type MigrationResult,
  detectMigrations,
  executeMigration,
} from "./mode-migrator";

export { deriveInstallMode } from "./installation";
