// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type {
  AgentIsolation,
  CacheTtl,
  Domain,
  EffortLevel,
  ModelName,
  PermissionMode,
} from "./matrix";
import type { PluginSkillRef, Skill, SkillId } from "./skills";
import type { AgentName } from "./generated/source-types";

export type { AgentName } from "./generated/source-types";
export { AGENT_NAMES } from "./generated/source-types";

/** Single hook action (command, script, or prompt) */
export type AgentHookAction = {
  type: "command" | "script" | "prompt";
  command?: string;
  script?: string;
  prompt?: string;
};

/**
 * Hook definition: the actions one hook event fires, and optionally which tools they fire for.
 *
 * `hooks` is REQUIRED. A definition carrying none fires nothing, and every schema that reads a
 * compiled agent says so — `strictHooksRecordSchema` backs the loader, the source-agent validator
 * and the compiled-frontmatter reader alike. It was optional here while the loader's schema was
 * too, which is what let a definition written with its actions one level flat be emptied to `{}`
 * and emitted rather than refused. `plugin.json` takes `Partial` of this at its own boundary; see
 * `agentHookDefinitionSchema`.
 */
export type AgentHookDefinition = {
  matcher?: string;
  hooks: AgentHookAction[];
};

/** Declared in `matrix.ts`, beside the other frontmatter vocabulary the matrix package vendors. */
export type { AgentIsolation, CacheTtl } from "./matrix";

/**
 * Shared fields present on all agent type variants.
 * Extracted to avoid duplicating them across AgentDefinition, AgentConfig, and AgentYamlConfig.
 */
export type BaseAgentFields = {
  title: string;
  /** Brief description for Task tool */
  description: string;
  model?: ModelName;
  /** Reasoning effort. Emitted into compiled frontmatter only when set — there is no default. */
  effort?: EffortLevel;
  tools: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  /**
   * How the sub-agent's working tree is separated from the session's.
   *
   * `"worktree"` runs it in a fresh git worktree, which is what lets a reviewing agent read a
   * diff without its own reasoning being coloured by the session that produced it. Emitted into
   * compiled frontmatter only when set — an unset agent shares the session's tree, which is what
   * every agent that WRITES needs.
   */
  isolation?: AgentIsolation;
  hooks?: Record<string, AgentHookDefinition[]>;
  /**
   * Experimental frontmatter options, as Claude Code's own `experimental` map.
   *
   * A map rather than a flat `cacheTtl` field because that is the shape the frontmatter takes, and
   * because the next option to arrive should widen this type rather than add a sibling to it.
   */
  experimental?: { cacheTtl?: CacheTtl };
  /** Which output format file to use */
  outputFormat?: string;
};

/** Base agent definition from agents.yaml (skills are defined in stacks, not agents) */
export type AgentDefinition = BaseAgentFields & {
  /** Relative path to agent directory (e.g., "developer/api-developer") */
  path?: string;
  /** Root path where this agent was loaded from (for template resolution) */
  sourceRoot?: string;
  /** Base directory for agent files relative to sourceRoot (e.g., "src/agents" or ".claude-src/agents") */
  agentBaseDir?: string;
  /** Domain for wizard grouping */
  domain?: Domain;
  /** True if this agent was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

/** Fully resolved agent config (agent definition + stack config) used by the compiler */
export type AgentConfig = AgentDefinition & {
  name: string;
  /** Unified skills list (loaded dynamically via Skill tool) */
  skills: Skill[];
};

/** Agent configuration from metadata.yaml (co-located in each agent folder) */
export type AgentYamlConfig = BaseAgentFields & {
  id: AgentName;
  /** Domain for wizard grouping */
  domain?: Domain;
  /** True if this agent was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

/** Agent frontmatter matching official Claude Code plugin format for compiled .md files */
export type AgentFrontmatter = {
  /** Used as plugin name */
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
  /**
   * Experimental frontmatter options. Derived from {@link BaseAgentFields} rather than restated,
   * because a structurally-equal copy diverges silently on the first option either side adds —
   * and `agent.liquid` emits this key from the agent definition that type describes.
   */
  experimental?: NonNullable<BaseAgentFields["experimental"]>;
  /** Skill names that are preloaded for this agent */
  skills?: SkillId[];
  /** Derived from {@link BaseAgentFields} for the reason `experimental` above it is. */
  hooks?: NonNullable<BaseAgentFields["hooks"]>;
};

/** All data needed to render a compiled agent prompt */
export type CompiledAgentData = {
  agent: AgentConfig;
  identity: string;
  playbook: string;
  output: string;
  /** Rendered at the top of the agent prompt */
  criticalRequirementsTop: string;
  /** Rendered at the bottom of the agent prompt */
  criticalReminders: string;
  skills: Skill[];
  /** Skills with content embedded in the compiled agent */
  preloadedSkills: Skill[];
  /** Skills loaded via Skill tool (metadata only) */
  dynamicSkills: Skill[];
  /** Skill IDs (eject mode) or plugin refs (plugin mode) for frontmatter */
  preloadedSkillIds: (SkillId | PluginSkillRef)[];
};

/** Paths to fetched agent definition sources (directory paths, not agent data) */
export type AgentSourcePaths = {
  agentsDir: string;
  sourcePath: string;
};
