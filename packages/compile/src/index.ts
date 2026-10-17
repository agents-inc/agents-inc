// Must not reach `./generated/corpus` or `./preview`, even transitively; `index.test.ts` gates it.

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
export * from "./source-layout.js"
export * from "./types.js"
