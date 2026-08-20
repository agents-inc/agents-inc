import { unique } from "remeda";

import { KEBAB_CASE_PATTERN } from "../consts.js";

/** The characters {@link KEBAB_CASE_PATTERN} is built from, tested one at a time. */
const KEBAB_CASE_CHARACTER = /[a-z0-9-]/;

/**
 * The characters a name carries that kebab-case does not admit, deduplicated and in
 * first-appearance order.
 *
 * Empty when the name breaks the rule some other way — a leading digit, a doubled or
 * a trailing hyphen — which is why a refusal states the rule as well as the list: an
 * author handed `@scope/thing` can act on `@` and `/` directly, and one handed
 * `-thing` has nothing to delete.
 */
export function charactersOutsideKebabCase(name: string): string[] {
  return unique([...name].filter((character) => !KEBAB_CASE_CHARACTER.test(character)));
}

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
