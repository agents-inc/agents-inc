import { MATRIX } from "@workspace/matrix"

import type { CompileCatalog } from "./catalog.js"

/**
 * The catalogue the config BUILDERS read, seated by whoever is driving them.
 *
 * **The renderers do not use this and must not.** `generateConfigSource` and
 * `generateConfigTypesSource` take their catalogue as an argument at every call,
 * which is the whole point of the extraction: the CLI hands them the catalogue it
 * merged the machine's local skills into, and the editor hands them the one it
 * fetched, and neither can silently get the other's.
 *
 * `generateProjectConfigFromSkills` could not follow, and the reason is a
 * migration one rather than a design one: its signature is `(name, ids, options)`
 * and roughly a hundred existing call sites pass no catalogue, each depending on
 * one seated by `initializeMatrix` in a `beforeEach` several screens away. Adding
 * a required parameter means deciding, per call site, which catalogue that
 * `beforeEach` had in force — a judgement, not a rename. So the seat moved here
 * with the function, and the CLI's `initializeMatrix` is still its single writer.
 *
 * Recorded as debt rather than as a pattern: nothing else in this package may
 * read it, and a call-site pass that makes the catalogue an argument of
 * `generateProjectConfigFromSkills` retires this module.
 *
 * The default is the built-in public catalogue, which is what an unconfigured
 * caller should render against — never `undefined`, so no reader needs a
 * fallback of its own.
 */
let seated: CompileCatalog = MATRIX

export function seatCatalog(catalog: CompileCatalog): void {
  seated = catalog
}

/** The seated catalogue, read at call time so a later seating is honoured. */
export function seatedCatalog(): CompileCatalog {
  return seated
}
