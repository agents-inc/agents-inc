/**
 * Readers for a generated `config-types.ts`, shared by the unit specs that
 * assert on an emitted union and the E2E specs that assert on one written by a
 * real CLI run.
 *
 * Asserting on the whole file would let a literal satisfy an alias it has
 * nothing to do with — every skill id is also a substring of the emitted
 * StackAgentConfig, every domain name prefixes a category, and every agent name
 * appears in both `AgentName` and `SelectedAgentName`. Reading one alias at a
 * time is what makes "the Domain union carries web" a claim about Domain.
 */

/**
 * The right-hand side of one `export type <alias> = ...;`, whitespace intact.
 *
 * Spans lines deliberately: `formatUnion` emits members inline below its
 * threshold and one-per-line above it, so a reader that stopped at the first
 * newline would return an empty string for exactly the large unions whose
 * membership is hardest to eyeball — and every `not.toContain` against it would
 * pass without testing anything.
 *
 * Returns `undefined` when the alias is absent, so a caller can tell "declared
 * as nothing" apart from "not declared"; asserting the alias exists is the
 * caller's to make.
 */
export function readGeneratedUnion(typesSource: string, alias: string): string | undefined {
  return new RegExp(`export type ${alias} =([\\s\\S]*?);`).exec(typesSource)?.[1];
}
