/**
 * The two normalisers a `config.ts` equality assertion is built on, in one module and off one
 * implementation.
 *
 * They differ in exactly one property and that property is load-bearing: one sorts the surviving
 * lines and one does not, so one detects reordering and the other cannot. Both take a config string
 * and return a config string, both back a `toStrictEqual`, and for a while both were called
 * `normalize<something>Config` in separate modules — which made the obvious dedup, deleting one and
 * importing the other, compile, pass, read as pure cleanup and silently weaken a round-trip
 * assertion from "the passthrough edit rewrote the config byte for byte" to "it kept the same set
 * of lines in any order".
 *
 * So the strength is in the name rather than in a boolean a reader has to look up, and the
 * duplicated behaviour is in one place rather than two. Swapping one for the other under an
 * existing assertion is an assertion change, not a refactor.
 */

/** The machine-specific line neither comparison can survive: it holds absolute project paths. */
const PROJECTS_KEY = '"projects"';

/**
 * Normalize a serialized `config.ts` for order-INSENSITIVE equality comparison.
 *
 * Sorting means a re-serialization that reorders entries compares equal, so this answers "the same
 * entries are present" and nothing about their arrangement. Used by dual-scope lifecycle tests
 * asserting a project-scope edit leaves the global config's MEMBERSHIP untouched.
 */
export function normalizeGlobalConfig(content: string): string {
  return significantLines(content).sort().join("\n");
}

/**
 * Normalize a serialized `config.ts` for order-SENSITIVE equality comparison.
 *
 * Every surviving line keeps its position, so a comparison built on this still fails when entries
 * are reordered — which is the regression class the round-trip caller in
 * `e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts` exists to guard. Do not add sorting here, and
 * do not reach for {@link normalizeGlobalConfig} at a call site that means this: the two are one
 * substitution apart and the weakening leaves the test green.
 */
export function normalizeConfigPreservingOrder(content: string): string {
  return significantLines(content).join("\n");
}

function significantLines(content: string): string[] {
  return content.split("\n").filter((line) => !line.includes(PROJECTS_KEY));
}
