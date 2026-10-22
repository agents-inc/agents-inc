// Vendored into packages/matrix/src/vendor/; any edit needs `bun run generate:matrix`.

import type { CategoryPath, SkillSlug, SkillId } from "./skills";
import type { AgentName } from "./agents";

export type { Category, Domain } from "./generated/source-types";
export { CATEGORIES } from "./generated/source-types";

import type { Category, Domain } from "./generated/source-types";

export const MODEL_NAMES = ["sonnet", "opus", "haiku", "fable", "inherit"] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

/** From `codex debug models --bundled`; `gpt-5.5` is left out because it refuses `max`. */
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

export const AGENT_ISOLATIONS = ["worktree"] as const;
export type AgentIsolation = (typeof AGENT_ISOLATIONS)[number];

/** Never defaulted: `1h` bills cache writes at a higher rate. */
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
  /** Within domain, lower first. */
  order: number;
  icon?: string;
};

export type RelationshipDefinitions = {
  conflicts: ConflictRule[];
  /** Warns but doesn't disable. */
  discourages: DiscourageRule[];
  requires: RequireRule[];
  alternatives: AlternativeGroup[];
};

type SkillGroupRule = {
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

export type MergedSkillsMatrix = {
  version: string;
  categories: CategoryMap;
  skills: Partial<Record<SkillId, ResolvedSkill>>;
  suggestedStacks: ResolvedStack[];
  slugMap: SkillSlugMap;
  /** Rule slugs no skill carries, for `checkMatrixHealth`. */
  unresolvedSlugs?: SkillSlug[];
  generatedAt: string;
};

type SkillCore = {
  id: SkillId;
  slug: SkillSlug;
  displayName: string;
  /** `cliDescription` from metadata.yaml when stated. */
  description: string;
  /** The SKILL.md frontmatter `description`. */
  activationDescription?: string;
  usageGuidance?: string;
  category: CategoryPath;
  author: string;
  /** Relative to src/. */
  path: string;
  /** From .claude/skills/ */
  local?: boolean;
  localPath?: string;
  /** Outside the CLI's built-in vocabulary. */
  custom?: boolean;
};

export type ResolvedSkill = SkillCore & {
  conflictsWith: SkillRelation[];
  requires: SkillRequirement[];
  /** Informational, not enforced. */
  alternatives: SkillAlternative[];
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
  /** OR when true; AND otherwise. */
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
  group?: string;
};

export type SkillSourceType = "public" | "private" | "local";

/** Derived from SkillConfig.origin. */
export type InstallMode = "eject" | "plugin" | "mixed";

export type SkillSource = {
  /** "public", a marketplace name, or "local" */
  name: string;
  type: SkillSourceType;
  url?: string;
  installed: boolean;
  /** On-disk install mode, separate from provenance. */
  installMode?: Exclude<InstallMode, "mixed">;
  primary?: boolean;
};

export type SelectionValidation = {
  valid: boolean;
  errors: ValidationError[];
};

export type ValidationError = {
  type: "conflict" | "missingRequirement" | "categoryExclusive";
  message: string;
  skills: SkillId[];
};

export type ExtractedSkillMetadata = SkillCore & {
  /** e.g. "web/framework/react" */
  directoryPath: string;
  domain: Domain;
};
