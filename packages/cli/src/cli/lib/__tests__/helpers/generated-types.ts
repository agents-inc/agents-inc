// Reads one alias of a generated `config-types.ts` at a time, since ids recur across aliases.

/**
 * Spans lines up to the blank line between declarations (the source has no `;`). `undefined`
 * when the alias is absent. An object body comes back whole and is not a union.
 */
export function readGeneratedUnion(typesSource: string, alias: string): string | undefined {
  const body = new RegExp(`export type ${alias} =([\\s\\S]*?)(?:\\n\\n|$)`).exec(typesSource)?.[1];

  return body?.trimEnd();
}

/** Throws on an undeclared alias, since `[]` is a real answer (`never`, or a bare reference). */
export function readGeneratedUnionMembers(typesSource: string, alias: string): readonly string[] {
  const union = readGeneratedUnion(typesSource, alias);
  if (union === undefined) {
    throw new Error(`Generated types declare no \`export type ${alias} = ...\` to read members of`);
  }

  return stringLiteralsIn(union);
}

const QUOTED_LITERAL = /'[^']*'/g;

function stringLiteralsIn(unionBody: string): readonly string[] {
  return [...unionBody.matchAll(QUOTED_LITERAL)].map(([literal]) => literal.slice(1, -1));
}
