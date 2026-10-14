// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type { AgentName } from "./agents";
import type { CodexModelName, Domain, EffortLevel, ModelName } from "./matrix";
import type { SkillId, SkillReference } from "./skills";
import type { StackAgentConfig } from "./stacks";

export type SkillScope = "project" | "global";

/** Claude CLI plugin scope (`--project`/`--user` install target). */
export type ClaudePluginScope = "project" | "user";

export type SourceEntry = {
  name: string;
  url: string;
  description?: string;
  ref?: string;
};

export type BrandingConfig = {
  name?: string;
};

export type SkillConfig = {
  id: SkillId;
  scope: SkillScope;
  /** Where this skill came from: "eject" (the project's own copy) or a marketplace name. */
  origin: string;
  excluded?: boolean;
};

export type AgentScopeConfig = {
  name: AgentName;
  scope: SkillScope;
  /** Absent keeps the agent metadata's model. */
  model?: ModelName;
  /** The model a Codex role runs on. Absent means the session's model. */
  codexModel?: CodexModelName;
  effort?: EffortLevel;
  excluded?: boolean;
};

export type CompileAgentConfig = {
  skills?: SkillReference[];
  /** Preferred over the agent definition's own value. */
  model?: ModelName;
  codexModel?: CodexModelName;
  /** Preferred over the agent definition's own value. */
  effort?: EffortLevel;
};

export type CompileConfig = {
  name: string;
  description: string;
  stack?: string;
  /** Its keys decide which agents compile. */
  agents: Partial<Record<AgentName, CompileAgentConfig>>;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ProjectConfig = {
  name: string;

  description?: string;

  agents: AgentScopeConfig[];

  skills: SkillConfig[];

  author?: string;

  /** Agent -> category -> SkillAssignment[], normalized at load time. */
  stack?: Record<string, StackAgentConfig>;

  /**
   * A path or URL, saved when --source is given.
   * @example "/home/user/my-skills" or "github:my-org/skills"
   */
  marketplace?: string;

  /**
   * The name the marketplace's manifest gives it, which plugins are registered under. Known only
   * after a fetch, so it cannot fold into the ref.
   * @example "agents-inc"
   */
  marketplaceName?: string;

  /** Defaults to the skills source. */
  agentsSource?: string;

  /** Persisted so edit mode restores the selection; omitted when empty. */
  selectedDomains?: Domain[];

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
