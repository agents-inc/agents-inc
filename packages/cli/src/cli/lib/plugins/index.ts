export {
  agentPluginName,
  generateSkillPluginManifest,
  generateAgentPluginManifest,
  writePluginManifest,
} from "./plugin-manifest";

export { buildMarketplacePluginRef, parseMarketplacePluginRef } from "./plugin-ref";

export {
  getUserPluginsDir,
  getProjectPluginsDir,
  getPluginAgentsDir,
  getPluginManifestPath,
  readPluginManifest,
} from "./plugin-finder";

export { getInstallationInfo, formatInstallationDisplay } from "./plugin-info";

export {
  validateSkillFrontmatter,
  validateAgentFrontmatter,
  validatePlugin,
  validateAllPlugins,
  listPluginDirNames,
} from "./plugin-validator";

export {
  discoverAllPluginSkills,
  getVerifiedPluginInstallPaths,
  listPluginNames,
} from "./plugin-discovery";

export {
  type ResolvedPlugin,
  getInstalledPluginsRegistryPath,
  listRegisteredPluginInstalls,
} from "./plugin-settings";
