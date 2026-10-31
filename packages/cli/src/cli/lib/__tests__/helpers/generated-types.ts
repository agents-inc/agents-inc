// Reads one alias of a generated `config-types.ts` at a time, since ids recur across aliases.

/**
 * Spans lines up to the blank line between declarations (the source has no `;`). `undefined`
 * when the alias is absent. An object body comes back whole and is not a union.
 */
export function readGeneratedUnion(typesSource: string, alias: string): string | undefined {
  const body = new RegExp(`export type ${alias} =([\\s\\S]*?)(?:\\n\\n|$)`).exec(typesSource)?.[1];

  return body?.trimEnd();
}

/**
 * Throws rather than answer `[]`: an empty answer passes every `not.toContain`, so a quote style
 * this reader misses would turn each caller's assertion vacuous.
 */
export function readGeneratedUnionMembers(typesSource: string, alias: string): readonly string[] {
  const union = readGeneratedUnion(typesSource, alias);
  if (union === undefined) {
    throw new Error(`Generated types declare no \`export type ${alias} = ...\` to read members of`);
  }

  const members = stringLiteralsIn(union);
  if (members.length === 0) {
    throw new Error(`\`export type ${alias} =${union}\` names no single-quoted member to read`);
  }

  return members;
}

const QUOTED_LITERAL = /'[^']*'/g;

function stringLiteralsIn(unionBody: string): readonly string[] {
  return [...unionBody.matchAll(QUOTED_LITERAL)].map(([literal]) => literal.slice(1, -1));
}
