export { loadSource, sayCapturedWarnings, type LoadedSource } from "./source/index.js";

export {
  discoverInstalledSkills,
  type DiscoveredSkills,
  copyLocalSkills,
  type SkillCopyResult,
  uninstallPluginSkills,
} from "./skills/index.js";

export {
  detectProject,
  type DetectedProject,
  detectBothInstallations,
  type BothInstallations,
  writeProjectConfig,
  type ConfigWriteResult,
  compileAgents,
  type CompilationResult,
  removeCompiledAgents,
  type RemoveCompiledAgentsOptions,
  compileAgentsAllScopes,
  compileProjectScope,
  loadAgentDefs,
  type AgentDefs,
} from "./project/index.js";
