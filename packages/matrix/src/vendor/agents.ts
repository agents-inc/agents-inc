// Vendored into packages/matrix/src/vendor/; any edit needs `bun run generate:matrix`.

import type {
  AgentIsolation,
  CacheTtl,
  CodexModelName,
  Domain,
  EffortLevel,
  ModelName,
  PermissionMode,
} from "./matrix";
import type { PluginSkillRef, Skill, SkillId } from "./skills";
import type { AgentName } from "./generated/source-types";

export type { AgentName } from "./generated/source-types";
export { AGENT_NAMES } from "./generated/source-types";

export type AgentHookAction = {
  type: "command" | "script" | "prompt";
  command?: string;
  script?: string;
  prompt?: string;
};

/** `hooks` is required: a definition carrying none fires nothing. */
export type AgentHookDefinition = {
  matcher?: string;
  hooks: AgentHookAction[];
};

export type { AgentIsolation } from "./matrix";

type BaseAgentFields = {
  title: string;
  description: string;
  model?: ModelName;
  /** No default: emitted only when set. */
  effort?: EffortLevel;
  tools: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  /** `"worktree"` runs the sub-agent in a fresh git worktree; unset shares the session's tree. */
  isolation?: AgentIsolation;
  hooks?: Record<string, AgentHookDefinition[]>;
  experimental?: { cacheTtl?: CacheTtl };
  outputFormat?: string;
};

/** Skills are defined in stacks, not agents. */
export type AgentDefinition = BaseAgentFields & {
  /** e.g. "developer/api-developer" */
  path?: string;
  /** For template resolution. */
  sourceRoot?: string;
  agentBaseDir?: string;
  domain?: Domain;
  /** Outside the CLI's built-in vocabulary. */
  custom?: boolean;
};

export type AgentConfig = AgentDefinition & {
  name: string;
  skills: Skill[];
  /** From the project config only: no metadata names a Codex model. */
  codexModel?: CodexModelName;
};

export type AgentYamlConfig = BaseAgentFields & {
  id: AgentName;
  domain?: Domain;
  custom?: boolean;
};

export type AgentFrontmatter = {
  name: string;
  description: string;
  /** Comma-separated. */
  tools?: string;
  /** Comma-separated. */
  disallowedTools?: string;
  model?: ModelName;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  isolation?: AgentIsolation;
  experimental?: NonNullable<BaseAgentFields["experimental"]>;
  skills?: SkillId[];
  hooks?: NonNullable<BaseAgentFields["hooks"]>;
};

export type CompiledAgentData = {
  agent: AgentConfig;
  identity: string;
  playbook: string;
  output: string;
  criticalRequirementsTop: string;
  criticalReminders: string;
  skills: Skill[];
  preloadedSkills: Skill[];
  dynamicSkills: Skill[];
  /** Skill IDs in eject mode, plugin refs in plugin mode. */
  preloadedSkillIds: (SkillId | PluginSkillRef)[];
};

export type AgentSourcePaths = {
  agentsDir: string;
  sourcePath: string;
};
