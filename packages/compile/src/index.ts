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
export * from "./source-layout.js"
export * from "./types.js"

/**
 * The old name of {@link LEGACY_SOURCE_DIR}, kept alive only for readers inside
 * `packages/cli`.
 *
 * **The editor no longer reads it.** R2 landed, and
 * `apps/editor/src/features/configure/lib/output-preview.ts` now takes its
 * folder from `sourceDirName` against the provider it names itself. What is left is `consts.ts`'s
 * re-export and the CLI specs that seed a pre-rename install through it:
 *
 * ```
 * grep -rIl --include='*.ts' --include='*.tsx' 'CLAUDE_SRC_DIR' packages apps
 * ```
 *
 * An alias in this barrel rather than a second declaration in `paths.ts`, so
 * `.claude-src` has exactly one home while both vocabularies are live. Deleting
 * it is a rename of that CLI-side vocabulary to `LEGACY_SOURCE_DIR` — which
 * `consts.ts` already re-exports beside it — plus the roster in
 * `lib/configuration/__tests__/renderers-come-from-the-shared-package.test.ts`
 * and the `no-restricted-imports` zones that name it.
 */
export { LEGACY_SOURCE_DIR as CLAUDE_SRC_DIR } from "./paths.js"
