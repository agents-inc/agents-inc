/**
 * Undoes oclif's terminal wrapping so a whole sentence can be asserted.
 *
 * oclif wraps error and warning text at the terminal width and prefixes each continuation with
 * ` ›  `, so a full sentence straddles line breaks in the captured output. Asserting on a short
 * fragment instead would just move the brittleness — it would pass on a message that had been
 * truncated. Undo the wrapping and assert the whole thing.
 *
 * Lives here rather than beside its first caller because `packages/cli/CLAUDE.md` names
 * `__tests__/helpers/` the one home for a tested helper: no vitest project collects `*.test.ts`
 * under `e2e/helpers/`, so a test written there never runs while looking like coverage. E2E specs
 * reach it through `e2e/helpers/test-utils.ts`, the single door for shared e2e helpers.
 */
export function flattenCliOutput(output: string): string {
  return output.replace(/›/g, " ").replace(/\s+/g, " ").trim();
}
