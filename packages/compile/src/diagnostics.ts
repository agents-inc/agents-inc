/**
 * Where the builders warn a human; the renderers say nothing. The CLI seats its logger; a browser
 * seats nothing and the default discards.
 */

export type CompileWarn = (message: string) => void

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

/** Read at call time so a later seating is honoured. */
export function diagnostics(): CompileDiagnostics {
  return seated
}
