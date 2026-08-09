export {
  type SkillManifestOptions,
  type AgentManifestOptions,
  generateSkillPluginManifest,
  generateAgentPluginManifest,
  writePluginManifest,
  getPluginDir,
} from "./plugin-manifest";

export { findPluginManifest } from "./plugin-manifest-finder";

export {
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
  toClaudePluginScope,
} from "./plugin-ref";

export {
  getUserPluginsDir,
  getCollectivePluginDir,
  getProjectPluginsDir,
  getPluginSkillsDir,
  getPluginAgentsDir,
  getPluginManifestPath,
  readPluginManifest,
  getPluginSkillIds,
} from "./plugin-finder";

export {
  type PluginInfo,
  type InstallationInfo,
  getPluginInfo,
  formatPluginDisplay,
  getInstallationInfo,
  formatInstallationDisplay,
} from "./plugin-info";

export {
  validatePluginStructure,
  validatePluginManifest,
  validateSkillFrontmatter,
  validateAgentFrontmatter,
  validatePlugin,
  validateAllPlugins,
  printPluginValidationResult,
} from "./plugin-validator";

export { discoverAllPluginSkills, hasIndividualPlugins, listPluginNames } from "./plugin-discovery";

export {
  type PluginKey,
  type ResolvedPlugin,
  getEnabledPluginKeys,
  getInstalledPluginsRegistryPath,
  listRegisteredPluginInstalls,
  resolvePluginInstallPaths,
  getVerifiedPluginInstallPaths,
} from "./plugin-settings";
