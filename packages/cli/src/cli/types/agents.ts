// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

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

/** Declared in `matrix.ts`, beside the other frontmatter vocabulary the matrix package vendors. */
export type { AgentIsolation, CacheTtl } from "./matrix";

export type BaseAgentFields = {
  title: string;
  description: string;
  model?: ModelName;
  /** Reasoning effort. Emitted into compiled frontmatter only when set — there is no default. */
  effort?: EffortLevel;
  tools: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  /** `"worktree"` runs the sub-agent in a fresh git worktree; unset shares the session's tree. */
  isolation?: AgentIsolation;
  hooks?: Record<string, AgentHookDefinition[]>;
  experimental?: { cacheTtl?: CacheTtl };
  /** Which output format file to use */
  outputFormat?: string;
};

/** Skills are defined in stacks, not agents. */
export type AgentDefinition = BaseAgentFields & {
  /** Relative path to agent directory (e.g., "developer/api-developer") */
  path?: string;
  /** Root path where this agent was loaded from (for template resolution) */
  sourceRoot?: string;
  agentBaseDir?: string;
  domain?: Domain;
  /** True if this agent was created outside the CLI's built-in vocabulary */
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
  /** True if this agent was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

export type AgentFrontmatter = {
  name: string;
  /** Shown in Task tool description */
  description: string;
  /** Comma-separated list of tools available to this agent */
  tools?: string;
  /** Comma-separated list of tools this agent cannot use */
  disallowedTools?: string;
  /** Use "inherit" to use parent model */
  model?: ModelName;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  isolation?: AgentIsolation;
  /** Derived from {@link BaseAgentFields} so the two cannot diverge. */
  experimental?: NonNullable<BaseAgentFields["experimental"]>;
  skills?: SkillId[];
  /** Derived from {@link BaseAgentFields} so the two cannot diverge. */
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
  /** Skill IDs (eject mode) or plugin refs (plugin mode) for frontmatter */
  preloadedSkillIds: (SkillId | PluginSkillRef)[];
};

/** Paths to fetched agent definition sources (directory paths, not agent data) */
export type AgentSourcePaths = {
  agentsDir: string;
  sourcePath: string;
};
