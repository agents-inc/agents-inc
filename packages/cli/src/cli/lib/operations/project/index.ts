export { detectProject, type DetectedProject } from "./detect-project.js";
export { detectBothInstallations, type BothInstallations } from "./detect-both-installations.js";
export {
  writeProjectConfig,
  type ConfigWriteOptions,
  type ConfigWriteResult,
} from "./write-project-config.js";
export {
  compileAgents,
  type CompileAgentsOptions,
  type CompilationResult,
} from "./compile-agents.js";
export {
  type CompileAllScopesOptions,
  compileAgentsAllScopes,
} from "./compile-agents-all-scopes.js";
export {
  recompileRegisteredProjectAgents,
  recompilePropagatedProjectAgents,
  type PropagatedRecompileSummary,
} from "./recompile-project-agents.js";
export { loadAgentDefs, type AgentDefs } from "./load-agent-defs.js";
