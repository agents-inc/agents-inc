export {
  type SkillManifestOptions,
  type AgentManifestOptions,
  type StackManifestOptions,
  generateSkillPluginManifest,
  generateAgentPluginManifest,
  generateStackPluginManifest,
  writePluginManifest,
  getPluginDir,
} from "./plugin-manifest";

export { findPluginManifest } from "./plugin-manifest-finder";

export { buildMarketplacePluginRef, toClaudePluginScope } from "./plugin-ref";

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
  resolvePluginInstallPaths,
  getVerifiedPluginInstallPaths,
} from "./plugin-settings";
