export {
  type InstallMode,
  type Installation,
  declaresNoContent,
  detectGlobalInstallation,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
  detectInstallation,
  detectProjectInstallation,
  holdsItsOwnInstallation,
} from "./installation";

// No config writers here: writing config.ts goes through `config-gate` only.
export {
  buildAndMergeConfig,
  setConfigMetadata,
  buildCompileAgents,
  buildAgentScopeMap,
  refuseUnofferedStack,
} from "./local-installer";

export { isHomeDirectory } from "./is-home-directory";
export {
  getInstalledConfigPath,
  installBaseDir,
  resolveInstallPaths,
  type InstallPaths,
} from "./install-base-dir";

export { detectInstallations, type DetectedInstallation } from "./detect-installations";

export {
  type EjectCopyResult,
  type SkillMigration,
  type MigrationPlan,
  type MigrationResult,
  detectMigrations,
  ejectCopyFailureError,
  executeMigration,
} from "./mode-migrator";

export { deriveInstallMode } from "./installation";
