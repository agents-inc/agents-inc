/**
 * Finds exported constants that capture `os.homedir()` at import time; under a fake home that
 * value settles on whichever spec imported the module first.
 */

import { elementAt } from "./element-at.js";

// `[^;]*` spans multi-line declarations but stops at their own semicolon. SCREAMING_CASE keeps
// camelCase functions (read at call time) out; a camelCase or private constant is not caught.
const FREEZES_THE_HOME = /^export const ([A-Z][A-Z0-9_]*) =[^;]*os\.homedir\(\)/gm;

export function frozenHomeConstantsIn(source: string): string[] {
  return [...source.matchAll(FREEZES_THE_HOME)].map((match) => elementAt(match, 1));
}
