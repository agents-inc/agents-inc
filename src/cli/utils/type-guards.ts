import {
  CATEGORIES,
  DOMAINS,
  AGENT_NAMES,
  SKILL_IDS,
  SKILL_SLUGS,
} from "../types/generated/source-types";
import type {
  Category,
  Domain,
  AgentName,
  SkillId,
  SkillSlug,
} from "../types/generated/source-types";
import type { CategoryPath, SkillAssignment } from "../types/skills";
import { LOCAL_PSEUDO_CATEGORY } from "../consts";

/** Narrows unknown parse output to a plain object record (rejects arrays and primitives). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Runtime check that a string is a valid Category value from the generated union */
export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** Runtime check that a string is a valid Domain value from the generated union */
export function isDomain(value: string): value is Domain {
  return (DOMAINS as readonly string[]).includes(value);
}

/** Runtime check that a string is a valid AgentName value from the generated union */
export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}

/** Runtime check that a string is a valid CategoryPath (Category | "local") */
export function isCategoryPath(value: string): value is CategoryPath {
  return value === LOCAL_PSEUDO_CATEGORY || isCategory(value);
}

/** Runtime check that a string is a valid SkillId from the generated union */
export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value);
}

/** Runtime check that a string is a valid SkillSlug from the generated union */
export function isSkillSlug(value: string): value is SkillSlug {
  return (SKILL_SLUGS as readonly string[]).includes(value);
}

/**
 * Structural check for a SkillAssignment object (`{ id, preloaded? }`).
 * The id's SkillId-ness is structural, not union-checked: assignments flow from
 * runtime sources whose skills may not be in the generated union.
 */
export function isSkillAssignment(value: unknown): value is SkillAssignment {
  if (typeof value !== "object" || value === null) return false;
  // Boundary cast: probing an unknown object's field inside the guard
  return typeof (value as { id?: unknown }).id === "string";
}
