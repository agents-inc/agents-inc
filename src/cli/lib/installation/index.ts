export {
  type InstallMode,
  type Installation,
  detectGlobalInstallation,
  INSTALL_MODE_LABELS,
  detectInstallation,
  detectProjectInstallation,
  getInstallationOrThrow,
} from "./installation";

/**
 * No config-pair writer is re-exported here. Writing `config.ts` /
 * `config-types.ts` — directly, by propagation, or by regenerating a scope's
 * types — is `src/cli/lib/config-gate/index.ts`'s exclusive surface, and a
 * barrel that re-exported the raw writers would be a supported way around it.
 */
export {
  type EjectInstallOptions,
  type EjectInstallResult,
  type PluginConfigResult,
  installEject,
  installPluginConfig,
  buildAndMergeConfig,
  setConfigMetadata,
  buildEjectSkillsMap,
  buildCompileAgents,
  buildAgentScopeMap,
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
