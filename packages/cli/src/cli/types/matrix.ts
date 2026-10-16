// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type { CategoryPath, SkillSlug, SkillId } from "./skills";
import type { AgentName } from "./agents";

export type { Category, Domain } from "./generated/source-types";
export { CATEGORIES, DOMAINS } from "./generated/source-types";

import type { Category, Domain } from "./generated/source-types";

/** Claude model selectors for agent configuration */
export const MODEL_NAMES = ["sonnet", "opus", "haiku", "fable", "inherit"] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

/**
 * Codex models a sub-agent may be pinned to, read off the pinned `@openai/codex` with
 * `codex debug models --bundled`. `gpt-5.5` is listed there and left out: it refuses `max`.
 */
export const CODEX_MODEL_NAMES = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;
export type CodexModelName = (typeof CODEX_MODEL_NAMES)[number];

export const EFFORT_NAMES = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_NAMES)[number];

export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "dontAsk",
  "bypassPermissions",
  "plan",
  "delegate",
] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/**
 * The one isolation mode Claude Code's sub-agent frontmatter documents. Here rather than in
 * `agents.ts` because `@workspace/matrix` vendors this file and the editor must spell it the same.
 */
export const AGENT_ISOLATIONS = ["worktree"] as const;
export type AgentIsolation = (typeof AGENT_ISOLATIONS)[number];

/**
 * How long a sub-agent's prompt-cache entries live. Emitted only when an agent declares it, never
 * defaulted: `1h` bills cache writes at a higher rate.
 */
export const CACHE_TTLS = ["5m", "1h"] as const;
export type CacheTtl = (typeof CACHE_TTLS)[number];

/** Partial: a marketplace may define only some categories. */
export type CategoryMap = Partial<Record<Category, CategoryDefinition>>;

export type CategoryDefinition = {
  id: Category;
  displayName: string;
  description: string;
  domain?: Domain;
  exclusive: boolean;
  /** Display order within domain (lower = earlier) */
  order: number;
  icon?: string;
};

export type RelationshipDefinitions = {
  /** Selecting one disables the others */
  conflicts: ConflictRule[];
  /** Selecting one shows warning for others but doesn't disable */
  discourages: DiscourageRule[];
  /** Skill A requires skill B to be selected first */
  requires: RequireRule[];
  alternatives: AlternativeGroup[];
};

export type SkillGroupRule = {
  /** Skill slugs (resolved to canonical IDs by matrix-loader) */
  skills: SkillSlug[];
  reason: string;
};

export type ConflictRule = SkillGroupRule;

export type DiscourageRule = SkillGroupRule;

export type RequireRule = {
  skill: SkillSlug;
  needs: SkillSlug[];
  /** OR over `needs` when true; AND otherwise. */
  needsAny?: boolean;
  reason: string;
};

export type AlternativeGroup = {
  purpose: string;
  skills: SkillSlug[];
};

export type SkillRulesConfig = {
  version: string;
  relationships: RelationshipDefinitions;
};

/** Partial: only extracted skills are present. */
export type SkillSlugMap = {
  slugToId: Partial<Record<SkillSlug, SkillId>>;
};

/** The primary read model: categories and rules merged with extracted skill metadata. */
export type MergedSkillsMatrix = {
  version: string;
  categories: CategoryMap;
  skills: Partial<Record<SkillId, ResolvedSkill>>;
  suggestedStacks: ResolvedStack[];
  slugMap: SkillSlugMap;
  /**
   * Rule slugs no skill here carries, so `checkMatrixHealth` can report them against their source.
   */
  unresolvedSlugs?: SkillSlug[];
  generatedAt: string;
};

/** Shared by ExtractedSkillMetadata (pre-merge) and ResolvedSkill (post-merge). */
export type SkillCore = {
  id: SkillId;
  slug: SkillSlug;
  displayName: string;
  /** The short label — `cliDescription` from metadata.yaml when the skill states one. */
  description: string;
  /** The SKILL.md frontmatter `description`, which a compiled skill-activation table shows. */
  activationDescription?: string;
  usageGuidance?: string;
  category: CategoryPath;
  author: string;
  /** Relative path from src/ to the skill directory */
  path: string;
  /** True if from .claude/skills/ (user-defined local skill) */
  local?: boolean;
  localPath?: string;
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

export type ResolvedSkill = SkillCore & {
  /** Selecting this skill disables these others (hard exclusion) */
  conflictsWith: SkillRelation[];
  requires: SkillRequirement[];
  /** Other skills that serve the same purpose (informational, not enforced) */
  alternatives: SkillAlternative[];
  /** Selecting this skill shows a warning for these others (soft conflict) */
  discourages: SkillRelation[];
  availableSources?: SkillSource[];
  activeSource?: SkillSource;
};

export type SkillRelation = {
  skillId: SkillId;
  reason: string;
};

export type SkillRequirement = {
  skillIds: SkillId[];
  /** If true, only ONE of skillIds is needed (OR); if false, ALL are (AND). */
  needsAny: boolean;
  reason: string;
};

export type SkillAlternative = {
  skillId: SkillId;
  purpose: string;
};

export type ResolvedStack = {
  id: string;
  name: string;
  description: string;
  skills: Partial<Record<AgentName, Partial<Record<Category, SkillId[]>>>>;
  allSkillIds: SkillId[];
  philosophy: string;
  /** UI grouping label for the stack selection screen (e.g., "React", "CLI") */
  group?: string;
};

/** Short alias used for category-level search (e.g., "react", "zustand") */
export type SkillAlias = string;

export const SKILL_SOURCE_TYPES = ["public", "private", "local"] as const;
export type SkillSourceType = (typeof SKILL_SOURCE_TYPES)[number];

/** Derived at runtime from SkillConfig.origin (see deriveInstallMode). */
export type InstallMode = "eject" | "plugin" | "mixed";

export type SkillSource = {
  /** Source identifier: "public", marketplace name, "local" */
  name: string;
  type: SkillSourceType;
  /** Source URL for remote sources (e.g., "github:acme-corp/claude-skills") */
  url?: string;
  installed: boolean;
  /** How the skill was installed on disk (separate from provenance) — a single skill is never "mixed" */
  installMode?: Exclude<InstallMode, "mixed">;
  /** True for the primary marketplace source (scoped or default public). Set by multi-source-loader. */
  primary?: boolean;
};

export type SelectionValidation = {
  valid: boolean;
  errors: ValidationError[];
};

/** Advisory, non-blocking. */
export type ValidationError = {
  type: "conflict" | "missingRequirement" | "categoryExclusive";
  message: string;
  skills: SkillId[];
};

/** Relationship fields come from skill-rules.ts, not from per-skill metadata. */
export type ExtractedSkillMetadata = SkillCore & {
  /** Directory path for filesystem access, e.g. "web/framework/react" */
  directoryPath: string;
  domain: Domain;
};
