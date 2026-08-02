import type { AgentName } from "./agents";
import type { BoundSkill, Domain, EffortLevel, ModelName } from "./matrix";
import type { SkillId, SkillReference } from "./skills";
import type { StackAgentConfig } from "./stacks";

/** Scope of a skill or agent install: project-local or user-global. */
export type SkillScope = "project" | "global";

/** Claude CLI plugin scope (`--project`/`--user` install target). */
export type ClaudePluginScope = "project" | "user";

/** An additional skills source (private marketplace, custom repo) */
export type SourceEntry = {
  name: string;
  url: string;
  description?: string;
  ref?: string;
};

/** Branding overrides for white-labeling the CLI */
export type BrandingConfig = {
  /** Custom CLI name (e.g., "Acme Dev Tools") */
  name?: string;
  /** Custom tagline shown in wizard header */
  tagline?: string;
};

/** Per-skill configuration with scope and source */
export type SkillConfig = {
  id: SkillId;
  scope: SkillScope;
  source: string; // "eject" | marketplace name (e.g., "agents-inc")
  excluded?: boolean;
};

/** Per-agent configuration with scope (mirrors SkillConfig pattern) */
export type AgentScopeConfig = {
  name: AgentName;
  scope: SkillScope;
  /** Overrides the model from the agent's own metadata. Absent means "keep the metadata default". */
  model?: ModelName;
  /** Overrides the reasoning effort from the agent's own metadata. */
  effort?: EffortLevel;
  excluded?: boolean;
};

/** Agent configuration for compilation - contains skills for a specific agent */
export type CompileAgentConfig = {
  skills?: SkillReference[];
  /** Config-level model override, preferred over the agent definition's own value. */
  model?: ModelName;
  /** Config-level effort override, preferred over the agent definition's own value. */
  effort?: EffortLevel;
};

/** Compile configuration derived from stack (agents to compile from keys of `agents`) */
export type CompileConfig = {
  name: string;
  description: string;
  /** Stack reference - resolves stack skills for agents */
  stack?: string;
  /** Keys determine which agents to compile */
  agents: Record<string, CompileAgentConfig>;
};

/** Compilation context passed through the compile pipeline */
export type CompileContext = {
  stackId: string;
  verbose: boolean;
  projectRoot: string;
  outputDir: string;
};

/** Generic validation result with errors and warnings */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/** Unified project configuration stored at .claude-src/config.ts */
export type ProjectConfig = {
  /** Project/plugin name (kebab-case) */
  name: string;

  description?: string;

  agents: AgentScopeConfig[];

  skills: SkillConfig[];

  /** Author handle (e.g., "@vince") */
  author?: string;

  /**
   * Resolved stack configuration with agent->skill mappings.
   * Keys are agent IDs, values are category->SkillAssignment[] mappings.
   * Values are normalized to SkillAssignment[] at load time (same as stacks.ts).
   * Generated during `npx agents-inc init` when a stack is selected.
   */
  stack?: Record<string, StackAgentConfig>;

  /**
   * Skills source path or URL.
   * Saved when --source is provided during init/eject.
   * @example "/home/user/my-skills" or "github:my-org/skills"
   */
  source?: string;

  /**
   * Marketplace identifier for plugin installation.
   * @example "agents-inc"
   */
  marketplace?: string;

  /**
   * Agents source path or URL (when agents come from a different source than skills).
   * If not specified, uses the same source as skills.
   */
  agentsSource?: string;

  /**
   * Selected domains from the wizard.
   * Persisted so edit mode can restore the user's domain selection.
   * Omitted when empty (sparse YAML output).
   */
  domains?: Domain[];

  /**
   * Selected agents from the wizard.
   * Persisted so edit mode can restore the user's agent selection.
   * Omitted when empty (sparse YAML output).
   */
  selectedAgents?: AgentName[];

  /** Additional skill sources (private marketplaces, custom repos) */
  sources?: SourceEntry[];

  /** Skills explicitly bound to categories via search (from Step Sources) */
  boundSkills?: BoundSkill[];

  /** Branding overrides for white-labeling the CLI */
  branding?: BrandingConfig;

  /** Custom skills directory override (default: "src/skills") */
  skillsDir?: string;

  /** Custom agents directory override (default: "src/agents") */
  agentsDir?: string;

  /** Custom stacks file path override (default: "config/stacks.ts") */
  stacksFile?: string;

  /** Custom categories file path override (default: "config/skill-categories.ts") */
  categoriesFile?: string;

  /** Custom rules file path override (default: "config/skill-rules.ts") */
  rulesFile?: string;

  /** Tracked project installation paths (global config only) */
  projects?: string[];
};
