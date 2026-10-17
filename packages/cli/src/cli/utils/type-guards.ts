import { CATEGORIES, AGENT_NAMES, SKILL_IDS, SKILL_SLUGS } from "../types/generated/source-types";
import type { Category, AgentName, SkillId, SkillSlug } from "../types/generated/source-types";
import type { CategoryPath, SkillAssignment } from "../types/skills";
import { LOCAL_PSEUDO_CATEGORY } from "../consts";

/** Rejects arrays and primitives. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}

export function isCategoryPath(value: string): value is CategoryPath {
  return value === LOCAL_PSEUDO_CATEGORY || isCategory(value);
}

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value);
}

export function isSkillSlug(value: string): value is SkillSlug {
  return (SKILL_SLUGS as readonly string[]).includes(value);
}

/** The id is not union-checked: assignments may name skills outside the generated union. */
export function isSkillAssignment(value: unknown): value is SkillAssignment {
  if (typeof value !== "object" || value === null) return false;
  // Boundary cast: probing an unknown object's field
  return typeof (value as { id?: unknown }).id === "string";
}
