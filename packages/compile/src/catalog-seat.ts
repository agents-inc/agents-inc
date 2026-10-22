import { MATRIX } from "@workspace/matrix"

import type { CompileCatalog } from "./catalog.js"

/**
 * The catalogue `generateProjectConfigFromSkills` reads, seated by the CLI's `initializeMatrix`.
 * Debt: that function takes no catalogue parameter, so its callers depend on this mutable seat.
 * The renderers take theirs as an argument and must not read this.
 */
let seated: CompileCatalog = MATRIX

export function seatCatalog(catalog: CompileCatalog): void {
  seated = catalog
}

/** Read at call time so a later seating is honoured. */
export function seatedCatalog(): CompileCatalog {
  return seated
}
