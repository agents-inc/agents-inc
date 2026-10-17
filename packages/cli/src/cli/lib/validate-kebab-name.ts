import { unique } from "remeda";

import { KEBAB_CASE_PATTERN } from "../consts.js";

const KEBAB_CASE_CHARACTER = /[a-z0-9-]/;

/** Empty when the name breaks the rule another way (e.g. `-thing`), so refusals state the rule. */
export function charactersOutsideKebabCase(name: string): string[] {
  return unique([...name].filter((character) => !KEBAB_CASE_CHARACTER.test(character)));
}

export function validateKebabCaseName(name: string, noun: string): string | null {
  if (!name || name.trim() === "") {
    return `${noun} name is required`;
  }

  if (!KEBAB_CASE_PATTERN.test(name)) {
    return `${noun} name must be kebab-case (lowercase letters, numbers, and hyphens, starting with a letter)`;
  }

  return null;
}
