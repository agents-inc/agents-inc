import type { ValidationResult } from "../types";

/** A factory rather than a constant: callers mutate the arrays, so each needs its own. */
export function validResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

export function invalidResult(message: string): ValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

export function mergeValidationResults<E, W>(
  results: ReadonlyArray<{ errors: E[]; warnings: W[] }>,
): { valid: boolean; errors: E[]; warnings: W[] } {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return { valid: errors.length === 0, errors, warnings };
}
