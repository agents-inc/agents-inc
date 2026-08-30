/**
 * Where this package's two BUILDERS say something to a human.
 *
 * The renderers say nothing at all, and that is the design: `generateConfigSource`
 * and `generateConfigTypesSource` are total functions from a configuration and a
 * catalogue to bytes. Two of the things that moved here are not renderers —
 * `sanitizeLiquidSyntax` reports a stripped template delimiter, and
 * `generateProjectConfigFromSkills` reports a selected id the catalogue does not
 * carry — and both messages are the user's only notice that something in their
 * configuration was dropped or rewritten. Deleting them to make the move look
 * cleaner would delete the notice.
 *
 * So the sink is seated by whoever is driving. The CLI seats `utils/logger`'s own
 * `warn` and `verbose` (`src/cli/lib/compile-seat.ts`); a browser preview seats
 * nothing and the default discards, which is the honest answer there — a preview
 * has no console the visitor reads.
 */

/** Matches `warn` in the CLI's `utils/logger`, options and all, so it can be seated directly. */
export type CompileWarn = (
  message: string,
  options?: { suppressInTest?: boolean }
) => void

export type CompileDiagnostics = {
  warn: CompileWarn
  verbose: (message: string) => void
}

const DISCARD: CompileDiagnostics = {
  warn: () => undefined,
  verbose: () => undefined,
}

let seated: CompileDiagnostics = DISCARD

export function seatDiagnostics(diagnostics: CompileDiagnostics): void {
  seated = diagnostics
}

/** The seated sink, read at call time so a later seating is honoured. */
export function diagnostics(): CompileDiagnostics {
  return seated
}
