import type { ValidationResult } from "../types";

/**
 * A passing validation result with no errors or warnings. A factory rather than a
 * shared constant so each caller owns its arrays — callers merge and prefix results,
 * and a shared instance would let one mutation leak into every other holder.
 */
export function validResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

/** A failing validation result carrying a single error message. */
export function invalidResult(message: string): ValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

/**
 * Flattens several validation partials into one result. `valid` is derived from
 * whether any errors were collected. Generic over the error/warning element type
 * so it can serve any {errors, warnings} partial, string-based ValidationResult
 * included.
 */
export function mergeValidationResults<E, W>(
  results: ReadonlyArray<{ errors: E[]; warnings: W[] }>,
): { valid: boolean; errors: E[]; warnings: W[] } {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return { valid: errors.length === 0, errors, warnings };
}
