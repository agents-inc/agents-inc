/**
 * Declared in `@workspace/compile` because the seed decode orders its `selectedDomains` with it
 * and that decode is shared with the editor. Re-exported here under the path every CLI call site
 * reads it from.
 */
export { orderDomains } from "@workspace/compile";
