// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type { Category, ModelName } from "./matrix";
import type { SkillId } from "./generated/source-types";

export type { SkillId, SkillSlug } from "./generated/source-types";
export { SKILL_MAP, SKILL_IDS, SKILL_SLUGS } from "./generated/source-types";

/** Fully-qualified plugin skill reference: "plugin-name:skill-name" for Claude Code plugin resolution */
export type PluginSkillRef = `${SkillId}:${SkillId}`;

/**
 * Either a generated Category value (e.g., "web-framework"),
 * or "local" for user-defined local skills.
 */
export type CategoryPath = Category | "local";

/**
 * Category-keyed selections mapping to arrays of canonical skill IDs.
 * Used in the wizard Build step for single-domain selections.
 * Partial because only categories the user has interacted with will have entries.
 */
export type CategorySelections = Partial<Record<Category, SkillId[]>>;

/**
 * Resolved category-to-skill mappings after alias resolution.
 * Maps each category to a single canonical skill ID (used in stack configs
 * where each category has exactly one skill per agent).
 */
export type ResolvedCategorySkills = Partial<Record<Category, SkillId>>;

/** Skill definition from registry.yaml (static metadata that doesn't change per-agent) */
export type SkillDefinition = {
  id: SkillId;
  path: string;
  description: string;
};

/** Map of skill IDs to their definitions — sparse map (not every skill ID will be present) */
export type SkillDefinitionMap = Partial<Record<SkillId, SkillDefinition>>;

/** Skill assignment in stack config.yaml, specifies preloaded (embedded) vs dynamic (Skill tool) */
export type SkillAssignment = {
  id: SkillId;
  /**
   * If true, skill content is embedded directly in the compiled agent prompt.
   * If false, the agent loads the skill via Claude Code's Skill tool at runtime.
   * @default false
   */
  preloaded?: boolean;
  /** True if this is a local skill from .claude/skills/ */
  local?: boolean;
  /** Relative path from project root for local skills */
  path?: string;
};

/** Skill reference in config.yaml (agent-specific) */
export type SkillReference = {
  id: SkillId;
  /** Context-specific description of when to use this skill */
  usage: string;
  preloaded?: boolean;
  /**
   * Install source for this skill, threaded from `SkillConfig.origin` so the
   * compiler can decide per-skill between `pluginRef` format and bare id. The config side
   * spells it `origin` and this side spells it `source`; both hold the same value.
   * `"eject"` means ejected to `.claude/skills/`; any other value (e.g. a
   * marketplace name) means plugin-installed. Absent when no `SkillConfig`
   * entry exists (e.g. user-authored local skills).
   */
  source?: string;
};

/** Fully resolved skill used by the compiler (merged from registry.yaml + config.yaml) */
export type Skill = SkillDefinition & {
  /** Context-specific usage guidance for this agent */
  usage: string;
  /** Whether skill is listed in frontmatter (Claude Code loads automatically) */
  preloaded: boolean;
  /** Fully-qualified plugin reference (e.g., "web-framework-react:web-framework-react") for plugin mode */
  pluginRef?: PluginSkillRef;
  /**
   * Install source for this skill, propagated from `SkillReference.source`.
   * Drives per-skill `pluginRef` attachment in the compiler: `source !== "eject"`
   * means render as `${id}:${id}`; otherwise render as bare id.
   */
  source?: string;
};

/**
 * SKILL.md frontmatter - matches official Claude Code plugin format.
 * Note: `author` is in metadata.yaml (for marketplace.json), NOT here.
 */
export type SkillFrontmatter = {
  /** Skill identifier in kebab-case (e.g., "react", "api-hono") */
  name: SkillId;
  description: string;
  model?: ModelName;
};
