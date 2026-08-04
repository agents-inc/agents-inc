import { KEBAB_CASE_PATTERN } from "../consts.js";

/**
 * Validates a user-supplied entity name against the kebab-case convention.
 * Returns an error message naming the entity (e.g. "Marketplace", "Skill"),
 * or null when the name is valid.
 */
export function validateKebabCaseName(name: string, noun: string): string | null {
  if (!name || name.trim() === "") {
    return `${noun} name is required`;
  }

  if (!KEBAB_CASE_PATTERN.test(name)) {
    return `${noun} name must be kebab-case (lowercase letters, numbers, and hyphens, starting with a letter)`;
  }

  return null;
}
