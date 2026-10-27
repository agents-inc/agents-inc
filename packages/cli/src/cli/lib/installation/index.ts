export {
  type InstallMode,
  type Installation,
  detectGlobalInstallation,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
  detectInstallation,
  detectProjectInstallation,
  holdsItsOwnInstallation,
} from "./installation";

// No config writers here: writing config.ts goes through `config-gate` only.
export { buildAndMergeConfig, buildAgentScopeMap, refuseUnofferedStack } from "./local-installer";

export { isHomeDirectory } from "./is-home-directory";
export { installBaseDir, resolveInstallPaths } from "./install-base-dir";

export { detectInstallations } from "./detect-installations";

export {
  type EjectCopyResult,
  type MigrationPlan,
  detectMigrations,
  ejectCopyFailureError,
  executeMigration,
} from "./mode-migrator";

export { deriveInstallMode } from "./installation";
