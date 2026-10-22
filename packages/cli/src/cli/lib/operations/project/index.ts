export { detectProject, type DetectedProject } from "./detect-project.js";
export { detectBothInstallations, type BothInstallations } from "./detect-both-installations.js";
export { writeProjectConfig, type ConfigWriteResult } from "./write-project-config.js";
export { compileAgents, type CompilationResult } from "./compile-agents.js";
export {
  removeCompiledAgents,
  type RemoveCompiledAgentsOptions,
} from "./remove-compiled-agents.js";
export { compileAgentsAllScopes, compileProjectScope } from "./compile-agents-all-scopes.js";
export { loadAgentDefs, type AgentDefs } from "./load-agent-defs.js";
