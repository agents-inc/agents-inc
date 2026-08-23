export {
  type SkillManifestOptions,
  type AgentManifestOptions,
  generateSkillPluginManifest,
  generateAgentPluginManifest,
  writePluginManifest,
} from "./plugin-manifest";

export {
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
  toClaudePluginScope,
} from "./plugin-ref";

export {
  getUserPluginsDir,
  getProjectPluginsDir,
  getPluginAgentsDir,
  getPluginManifestPath,
  readPluginManifest,
} from "./plugin-finder";

export {
  type InstallationInfo,
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

export { discoverAllPluginSkills, listPluginNames } from "./plugin-discovery";

export {
  type PluginKey,
  type ResolvedPlugin,
  getEnabledPluginKeys,
  getInstalledPluginsRegistryPath,
  listRegisteredPluginInstalls,
  resolvePluginInstallPaths,
  getVerifiedPluginInstallPaths,
} from "./plugin-settings";
