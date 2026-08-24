// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type { CategoryPath, SkillSlug, SkillId } from "./skills";
import type { AgentName } from "./agents";

export type { Category, Domain } from "./generated/source-types";
export { CATEGORIES, DOMAINS } from "./generated/source-types";

// Import locally for use within this file
import type { Category, Domain } from "./generated/source-types";

/** Claude model selectors for agent configuration */
export const MODEL_NAMES = ["sonnet", "opus", "haiku", "fable", "inherit"] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

/** Reasoning effort levels for agent configuration */
export const EFFORT_NAMES = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_NAMES)[number];

/** Agent permission modes for Claude Code tool access */
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
 * Category definitions indexed by category ID.
 * Partial because not every Category has a category definition (e.g., a marketplace
 * may only define a subset of all possible categories).
 */
export type CategoryMap = Partial<Record<Category, CategoryDefinition>>;

/**
 * Full domain selections used throughout the wizard pipeline (store, components, result).
 *
 * Structure: `{ domain: { category: [skillId, ...] } }`
 *
 * - Outer Partial: not all domains need selections (user may skip "mobile" entirely)
 * - Inner Partial: within a domain, only some categories may have selections
 * - SkillId[]: a category can have multiple skills unless `CategoryDefinition.exclusive` is true
 */
export type DomainSelections = Partial<Record<Domain, Partial<Record<Category, SkillId[]>>>>;

/** Single category definition from skill-categories.ts */
export type CategoryDefinition = {
  id: Category;
  displayName: string;
  description: string;
  /** Domain for wizard domain filtering */
  domain?: Domain;
  /** If true, only one skill can be selected in this category (radio behavior). */
  exclusive: boolean;
  /**
   * If true, leaving this category empty is worth telling the user about.
   *
   * ADVISORY, not a gate: `validateBuildStep` names the first such category in a toast as the
   * build step is left and the wizard advances anyway, which is how every other wizard
   * validation behaves. Nothing anywhere refuses to proceed on it.
   */
  required: boolean;
  /** Display order within domain (lower = earlier) */
  order: number;
  icon?: string;
};

/** Relationship rules between skills from skill-rules.ts */
export type RelationshipDefinitions = {
  /** Selecting one disables the others */
  conflicts: ConflictRule[];
  /** Selecting one shows warning for others but doesn't disable */
  discourages: DiscourageRule[];
  /** Skill A requires skill B to be selected first */
  requires: RequireRule[];
  /** Groups of interchangeable skills for the same purpose */
  alternatives: AlternativeGroup[];
};

/** Base shape for skill-group rules: a set of related slugs plus a reason */
export type SkillGroupRule = {
  /** Skill slugs (resolved to canonical IDs by matrix-loader) */
  skills: SkillSlug[];
  reason: string;
};

/** Mutual exclusion rule - selecting any one skill disables ALL others */
export type ConflictRule = SkillGroupRule;

/** Soft conflict rule - selecting any one shows a warning for ALL others */
export type DiscourageRule = SkillGroupRule;

/** Dependency rule - skill A requires skill B to be selected first */
export type RequireRule = {
  skill: SkillSlug;
  /** Skill slugs that must be selected before this one */
  needs: SkillSlug[];
  /**
   * If true, only ONE of the `needs` skills is required (OR logic).
   * If false/undefined, ALL are required (AND logic).
   * @default false
   */
  needsAny?: boolean;
  reason: string;
};

/** Group of interchangeable skills serving the same purpose */
export type AlternativeGroup = {
  purpose: string;
  skills: SkillSlug[];
};

/** Parsed configuration from skill-rules.ts */
export type SkillRulesConfig = {
  version: string;
  /** Aggregate relationship rules between skills */
  relationships: RelationshipDefinitions;
};

/**
 * Slug -> canonical skill ID. Partial because only extracted skills are present.
 *
 * One direction, not two. A reverse `idToSlug` was carried here until 2026-08-23 and had **zero
 * readers anywhere** — every occurrence was a write, and the only thing consuming it was the
 * duplicate-slug asymmetry it made possible. A map nothing reads cannot be out of step with the
 * one that is read, so deleting it retires that whole class rather than guarding it.
 */
export type SkillSlugMap = {
  /** Forward: slug -> canonical skill ID */
  slugToId: Partial<Record<SkillSlug, SkillId>>;
};

/**
 * Output of mergeMatrixWithSkills() combining skill-categories.ts + skill-rules.ts with extracted metadata.
 * This is the primary read model consumed by the wizard and CLI commands.
 */
export type MergedSkillsMatrix = {
  version: string;
  categories: CategoryMap;
  /** Indexed by full skill ID for O(1) lookup */
  skills: Partial<Record<SkillId, ResolvedSkill>>;
  /** Stacks with all skill aliases resolved to canonical IDs */
  suggestedStacks: ResolvedStack[];
  /** Bidirectional slug <-> ID mapping */
  slugMap: SkillSlugMap;
  /**
   * Slugs the relationship rules name that no skill in this matrix carries.
   * Absent when every reference resolved. Resolution drops such a reference and
   * warns; carrying the list is what lets `checkMatrixHealth` report the typo
   * against the source that shipped it rather than only logging it.
   */
  unresolvedSlugs?: SkillSlug[];
  /** Explicit domain definitions from agent metadata files */
  agentDefinedDomains?: Partial<Record<AgentName, Domain>>;
  /** ISO timestamp of when this matrix was generated */
  generatedAt: string;
};

/**
 * Identity/description fields shared by ExtractedSkillMetadata (pre-merge) and
 * ResolvedSkill (post-merge). Both types are `SkillCore & { extras }`; extracting
 * the common shape keeps the two skill surfaces in sync. Purely structural — no
 * runtime change (the intersection is equivalent to the flattened object).
 */
export type SkillCore = {
  id: SkillId;
  /** Kebab-case short key for alias resolution, search, and relationship rules (e.g., "react") */
  slug: SkillSlug;
  /** Title-cased label for UI display (e.g., "React", "Apollo Client") */
  displayName: string;
  description: string;
  /** When an AI agent should invoke this skill (decision criteria) */
  usageGuidance?: string;
  /** Matches key in matrix.categories; determines which wizard category grid this skill appears in */
  category: CategoryPath;
  /** Author handle (e.g., "@vince") from metadata.yaml */
  author: string;
  /** Relative path from src/ to the skill directory */
  path: string;
  /** True if from .claude/skills/ (user-defined local skill) */
  local?: boolean;
  /** Absolute path to local skill directory */
  localPath?: string;
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom?: boolean;
};

/**
 * Single skill with all computed relationships resolved for CLI rendering.
 * Produced by mergeMatrixWithSkills() after resolving aliases, relationships, and sources.
 */
export type ResolvedSkill = SkillCore & {
  /** Selecting this skill disables these others (hard exclusion) */
  conflictsWith: SkillRelation[];
  /** Skills that THIS skill requires (must select first) */
  requires: SkillRequirement[];
  /** Other skills that serve the same purpose (informational, not enforced) */
  alternatives: SkillAlternative[];
  /** Selecting this skill shows a warning for these others (soft conflict) */
  discourages: SkillRelation[];
  /** All known sources that provide this skill (populated by multi-source-loader) */
  availableSources?: SkillSource[];
  /** Currently active/installed source (if any) */
  activeSource?: SkillSource;
};

/** Skill-to-skill relationship with reason */
export type SkillRelation = {
  skillId: SkillId;
  reason: string;
};

/** Resolved skill dependency with AND/OR logic */
export type SkillRequirement = {
  skillIds: SkillId[];
  /**
   * If true, only ONE of skillIds is needed (OR).
   * If false, ALL are needed (AND).
   *
   * Always present. The absence this field could have carried is resolved one step upstream:
   * `resolveRelationships` in `lib/matrix/skill-resolution.ts` writes
   * `rule.needsAny ?? false` from the optional {@link RequireRule.needsAny}, so nothing
   * downstream of resolution ever meets an unset value.
   */
  needsAny: boolean;
  reason: string;
};

/** Alternative skill that serves the same purpose */
export type SkillAlternative = {
  skillId: SkillId;
  purpose: string;
};

/** Stack with resolved skill IDs and agent mappings */
export type ResolvedStack = {
  id: string;
  name: string;
  description: string;
  /** Skill selections with resolved full skill IDs by category */
  skills: Partial<Record<AgentName, Partial<Record<Category, SkillId[]>>>>;
  /** Flat list of all skill IDs in this stack */
  allSkillIds: SkillId[];
  philosophy: string;
  /** UI grouping label for the stack selection screen (e.g., "React", "CLI") */
  group?: string;
};

/** Short alias used for category-level search (e.g., "react", "zustand") */
export type SkillAlias = string;

/** Source type classification for skill provenance (where the skill comes from) */
export const SKILL_SOURCE_TYPES = ["public", "private", "local"] as const;
export type SkillSourceType = (typeof SKILL_SOURCE_TYPES)[number];

/**
 * How a project's skills are installed: fully ejected, fully plugin-based, or a
 * mix of both. Derived at runtime from SkillConfig.origin (see deriveInstallMode).
 */
export type InstallMode = "eject" | "plugin" | "mixed";

/** A single source from which a skill can be obtained */
export type SkillSource = {
  /** Source identifier: "public", marketplace name, "local" */
  name: string;
  type: SkillSourceType;
  /** Source URL for remote sources (e.g., "github:acme-corp/claude-skills") */
  url?: string;
  /** Whether this source's version is currently installed on disk */
  installed: boolean;
  /** How the skill was installed on disk (separate from provenance) — a single skill is never "mixed" */
  installMode?: Exclude<InstallMode, "mixed">;
  /** True for the primary marketplace source (scoped or default public). Set by multi-source-loader. */
  primary?: boolean;
};

/** Advisory visual state for a skill option in the wizard UI */
export type OptionState =
  | { status: "normal" }
  | { status: "discouraged"; reason: string }
  | { status: "incompatible"; reason: string };

/**
 * Skill option as displayed in the wizard, computed based on current selections.
 * Recomputed by matrix-resolver on every selection change.
 */
export type SkillOption = {
  id: SkillId;
  /** True if this skill is currently selected by the user */
  selected: boolean;
  /** True when this skill is selected but has unmet dependency requirements */
  hasUnmetRequirements: boolean;
  /** Explains which requirements are unmet (only set when hasUnmetRequirements is true) */
  unmetRequirementsReason?: string;
};

/** Result of validating the current skill selections */
export type SelectionValidation = {
  valid: boolean;
  errors: ValidationError[];
};

/** Advisory validation error (non-blocking) */
export type ValidationError = {
  type: "conflict" | "missingRequirement" | "categoryExclusive";
  message: string;
  skills: SkillId[];
};

/**
 * Skill metadata extracted from SKILL.md frontmatter + metadata.yaml before matrix merge.
 *
 * Relationship fields (conflictsWith, requires, etc.) are resolved from
 * centralized group-based declarations in skill-rules.ts — not from individual skill metadata.
 */
export type ExtractedSkillMetadata = SkillCore & {
  /** Directory path for filesystem access, e.g. "web/framework/react" */
  directoryPath: string;
  /** Domain this skill belongs to (e.g., "web", "api", "cli") */
  domain: Domain;
};
