/**
 * The renderers the CLI writes with and the editor previews with.
 *
 * **This barrel must reach neither `./generated/corpus` nor `./preview`,
 * transitively or otherwise.** The corpus is the heaviest artefact this package
 * ships and `./preview` is the only module that pulls both it and `liquidjs`; the
 * editor reaches them through `import()` so they land in a lazy chunk, and a
 * barrel that reached either would put them on whatever imports the barrel.
 * `src/index.test.ts` is the gate, and it covers the transitive case a grep of
 * this file could not.
 */

export type {
  CatalogCategory,
  CatalogRelation,
  CatalogRequirement,
  CatalogSkill,
  CompileCatalog,
} from "./catalog.js"
export {
  byCategoryDeclarationOrder,
  categoryDomain,
  isExclusiveCategory,
} from "./catalog.js"

export { seatCatalog, seatedCatalog } from "./catalog-seat.js"
export { seatDiagnostics } from "./diagnostics.js"
export type { CompileDiagnostics, CompileWarn } from "./diagnostics.js"

export { orderDomains } from "./domain-order.js"
export { bytewise } from "./string.js"
export { validateSelection } from "./selection.js"

export * from "./paths.js"
export * from "./scope-predicates.js"
export * from "./types.js"
