// Re-export operation-specific types for convenience.
// Shared types (SkillConfig, ProjectConfig, etc.) stay in their original locations.

export type { LoadSourceOptions, LoadedSource } from "./source/load-source.js";
export type { MarketplaceResult } from "./source/ensure-marketplace.js";

export type { DiscoveredSkills } from "./skills/discover-skills.js";
export type { ScopedSkillDir, ScopedSkillDirsResult } from "./skills/collect-scoped-skill-dirs.js";
export type { SkillCopyResult } from "./skills/copy-local-skills.js";
export type { SkillComparisonResults } from "./skills/compare-skills.js";
export type { SkillMatchResult } from "./skills/find-skill-match.js";
export type { PluginInstallResult } from "./skills/install-plugin-skills.js";
export type { PluginUninstallResult } from "./skills/uninstall-plugin-skills.js";

export type { DetectedProject } from "./project/detect-project.js";
export type { BothInstallations } from "./project/detect-both-installations.js";
export type { ConfigWriteOptions, ConfigWriteResult } from "./project/write-project-config.js";
export type { CompileAgentsOptions, CompilationResult } from "./project/compile-agents.js";
export type { AgentDefs } from "./project/load-agent-defs.js";
