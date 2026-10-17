// Vendored into packages/matrix/src/vendor/; any edit needs `bun run generate:matrix`.

import type { Category, ModelName } from "./matrix";
import type { SkillId } from "./generated/source-types";

export type { SkillId, SkillSlug } from "./generated/source-types";
export { SKILL_MAP, SKILL_IDS, SKILL_SLUGS } from "./generated/source-types";

/** "plugin-name:skill-name" */
export type PluginSkillRef = `${SkillId}:${SkillId}`;

/** "local" marks user-defined local skills. */
export type CategoryPath = Category | "local";

/** One canonical skill per category, after alias resolution. */
export type ResolvedCategorySkills = Partial<Record<Category, SkillId>>;

export type SkillDefinition = {
  id: SkillId;
  path: string;
  description: string;
};

export type SkillDefinitionMap = Partial<Record<SkillId, SkillDefinition>>;

export type SkillAssignment = {
  id: SkillId;
  /**
   * True embeds the skill in the compiled prompt; false loads it via the Skill tool at runtime.
   * @default false
   */
  preloaded?: boolean;
  /** From .claude/skills/ */
  local?: boolean;
  /** Relative to the project root. */
  path?: string;
};

export type SkillReference = {
  id: SkillId;
  usage: string;
  preloaded?: boolean;
  /**
   * `SkillConfig.origin` under another name: `"eject"` or a marketplace name (plugin-installed).
   * Absent when no `SkillConfig` exists, e.g. user-authored local skills.
   */
  source?: string;
};

export type Skill = SkillDefinition & {
  usage: string;
  preloaded: boolean;
  pluginRef?: PluginSkillRef;
  /** Anything but `"eject"` renders as `${id}:${id}`. */
  source?: string;
};

/** `author` lives in metadata.yaml, not here. */
export type SkillFrontmatter = {
  name: SkillId;
  description: string;
  model?: ModelName;
};
