import type { ValidationResult } from "../types";

/** A factory, not a constant: each caller gets arrays no other holder shares. */
export function validResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

export function invalidResult(message: string): ValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

export function resultFrom(errors: string[], warnings: string[]): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

export function mergeValidationResults<E, W>(
  results: ReadonlyArray<{ errors: E[]; warnings: W[] }>,
): { valid: boolean; errors: E[]; warnings: W[] } {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return { valid: errors.length === 0, errors, warnings };
}
