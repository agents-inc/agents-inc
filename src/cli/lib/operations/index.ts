// Operations — composable building blocks for CLI commands.
// Each operation wraps lower-level lib functions into a single typed call.

export {
  loadSource,
  type LoadSourceOptions,
  type LoadedSource,
  ensureMarketplace,
  type MarketplaceResult,
  requireMarketplace,
  type MarketplaceRequirement,
} from "./source/index.js";

export {
  discoverInstalledSkills,
  discoverLocalProjectSkills,
  mergeSkills,
  type DiscoveredSkills,
  collectScopedSkillDirs,
  type ScopedSkillDir,
  type ScopedSkillDirsResult,
  copyLocalSkills,
  type SkillCopyResult,
  compareSkillsWithSource,
  buildSourceSkillsMap,
  type SkillComparisonResults,
  findSkillMatch,
  type SkillMatchResult,
  installPluginSkills,
  type PluginInstallResult,
  pluginInstallFailureError,
  uninstallPluginSkills,
  type PluginUninstallResult,
} from "./skills/index.js";

export {
  detectProject,
  type DetectedProject,
  detectBothInstallations,
  type BothInstallations,
  writeProjectConfig,
  type ConfigWriteOptions,
  type ConfigWriteResult,
  compileAgents,
  type CompileAgentsOptions,
  type CompilationResult,
  compileAgentsAllScopes,
  type CompileAllScopesOptions,
  loadAgentDefs,
  type AgentDefs,
} from "./project/index.js";
