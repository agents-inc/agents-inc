import { AGENT_NAMES, SKILL_IDS } from "../types/generated/source-types";
import type { AgentName, SkillId } from "../types/generated/source-types";
import type { SkillAssignment } from "../types/skills";

/** Rejects arrays and primitives. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value);
}

/** The id is not union-checked: assignments may name skills outside the generated union. */
export function isSkillAssignment(value: unknown): value is SkillAssignment {
  if (typeof value !== "object" || value === null) return false;
  // Boundary cast: probing an unknown object's field
  return typeof (value as { id?: unknown }).id === "string";
}
