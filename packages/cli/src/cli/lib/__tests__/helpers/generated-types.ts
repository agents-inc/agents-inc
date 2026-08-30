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
 * The right-hand side of one `export type <alias> = ...`, leading whitespace intact.
 *
 * Spans lines deliberately: the writer puts a union inline while it fits the
 * print width and one member per line once it does not, so a reader that
 * stopped at the first newline would return an empty string for exactly the
 * large unions whose membership is hardest to eyeball — and every
 * `not.toContain` against it would pass without testing anything.
 *
 * Returns `undefined` when the alias is absent, so a caller can tell "declared
 * as nothing" apart from "not declared"; asserting the alias exists is the
 * caller's to make.
 *
 * BOUNDARY: an alias ends at the BLANK LINE the writer puts between
 * declarations, or at the end of the source. It used to end at the first `;`,
 * which stopped existing on 2026-08-26 when the emitted pair became a fixed
 * point of prettier under `semi: false`. The blank line reads a flat union
 * exactly and hands back an object body — `StackAgentConfig`, when a project
 * carries per-category constraints — WHOLE, which is still not a union: the
 * literals inside it are candidate skills for one category rather than members
 * of an alias, so an object body is read by loading the file rather than here.
 */
export function readGeneratedUnion(typesSource: string, alias: string): string | undefined {
  const body = new RegExp(`export type ${alias} =([\\s\\S]*?)(?:\\n\\n|$)`).exec(typesSource)?.[1];

  return body?.trimEnd();
}

/**
 * The literal members of one `export type <alias> = ...`, in emission order.
 *
 * The union body alone answers "does this alias mention web-developer"; it does not
 * answer "do these two writers name the same set", and that second question needs the
 * members as values. It is the question a propagated config pair's value and type sides
 * are held to, and a `toContain` per name cannot stand in for it — a `toContain` per name
 * cannot see the member nobody thought to name.
 *
 * THROWS when the alias is not declared, rather than answering `[]`. An empty list is a
 * real answer here — `config-types-writer.ts` emits `never` for an install that selected
 * nothing and a bare `AgentName` / `SelectedAgentName` reference when it falls back — so a
 * reader that spelled "no such alias" the same way would make every `not.toContain` and
 * every set comparison over it hold against a file declaring nothing at all.
 */
export function readGeneratedUnionMembers(typesSource: string, alias: string): readonly string[] {
  const union = readGeneratedUnion(typesSource, alias);
  if (union === undefined) {
    throw new Error(`Generated types declare no \`export type ${alias} = ...\` to read members of`);
  }

  return stringLiteralsIn(union);
}

const QUOTED_LITERAL = /'[^']*'/g;

/** The quoted literals of a union body, quotes stripped, in the order emitted. */
function stringLiteralsIn(unionBody: string): readonly string[] {
  return [...unionBody.matchAll(QUOTED_LITERAL)].map(([literal]) => literal.slice(1, -1));
}
