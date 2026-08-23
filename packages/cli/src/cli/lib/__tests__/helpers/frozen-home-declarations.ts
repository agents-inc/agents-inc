/**
 * The reader for constants whose value is the home directory as it stood when their module was
 * IMPORTED, rather than when it was asked for.
 *
 * `CACHE_DIR` and `GLOBAL_INSTALL_ROOT` were both of that shape, and a frozen home is invisible
 * everywhere a test looks: `runCliCommand` drives oclif through `dist/`, a second module graph
 * first imported by whichever spec runs a command first, so the value settles on THAT spec's fake
 * home and every later spec in the file reads and writes under a directory its own `afterEach`
 * has already removed. Nothing reddens — the writes succeed, into the wrong tree.
 *
 * Nothing behavioural can hold the class. A spec can prove that one constant follows the home,
 * and the next constant somebody adds is unprotected; the property is about the SHAPE of a
 * declaration, so that is what this reads. `frozen-home-declarations.test.ts` holds this reader
 * against planted violations and against the call-time forms it must acquit, and
 * `../home-dir-read-at-call-time.test.ts` runs it over the real `src/cli/` tree. Neither half is
 * worth anything alone — a scan nobody executes proves nothing about the tree, and a scan whose
 * recogniser has never condemned anything proves nothing about the scan.
 *
 * A DECLARATION shape rather than a comment scan, deliberately: a gate that looked for a note
 * saying "read at call time" is satisfied by writing that note above a constant that does not.
 */

import { elementAt } from "./element-at.js";

/**
 * An exported constant whose value is derived from `os.homedir()`.
 *
 * `[^;]*` spans newlines and stops at the declaration's own semicolon, so the multi-line
 * `path.join(\n  os.homedir(),\n …)` form is condemned by the same expression as the one-liner
 * while a later statement in the file cannot satisfy it.
 *
 * SCREAMING_CASE is what makes the shape self-limiting rather than a second rule to maintain:
 * `os.homedir()` inside an exported FUNCTION — declared or arrow — is read at call time and is
 * the correct form, and this repository spells a function in camelCase. The limit that follows
 * is real and stated: a frozen constant spelled in camelCase reads as a function here and is not
 * condemned, and neither is a module-private one, which cannot spread past the module that
 * declares it.
 */
const FREEZES_THE_HOME = /^export const ([A-Z][A-Z0-9_]*) =[^;]*os\.homedir\(\)/gm;

/** Every constant `source` declares whose value freezes the home directory, in declared order. */
export function frozenHomeConstantsIn(source: string): string[] {
  return [...source.matchAll(FREEZES_THE_HOME)].map((match) => elementAt(match, 1));
}
