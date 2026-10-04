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

/**
 * Removes every space and oclif's continuation marker, for asserting text that holds a path.
 *
 * {@link flattenCliOutput} rejoins wrapped lines with a space, which is right where a line broke
 * between words and wrong where a word was longer than the line: oclif breaks such a word wherever
 * the column runs out, and an absolute temp path is one under any but a short `TMPDIR`. Flattened,
 * that path holds a space it never had and no assertion naming it can match. So the text expected
 * goes through this as well: the claim is still every character, in order, and only where the
 * lines broke stops mattering.
 */
export function compactCliOutput(output: string): string {
  return output.replace(/›/g, "").replace(/\s+/g, "");
}
