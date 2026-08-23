/**
 * Two readers over a TypeScript source's own text, for gates that hold a file's call sites
 * against a roster naming each one.
 *
 * Text rather than a syntax tree, deliberately: what a gate like this protects is a decision a
 * reader makes at a call site, and the line the call sits on is what that reader sees. The cost
 * is that reformatting a rostered line reddens the gate — which is the intended reading, because
 * a call site that moved is a call site somebody touched.
 */

/**
 * Every line of `source` on which `call` appears, trimmed, in source order.
 *
 * One entry per OCCURRENCE and never per line: two calls sharing a line produce two identical
 * entries, and nothing is deduplicated. A reader that collapsed them would report a file that
 * grew a second call site as unchanged, which is the one thing a roster is for.
 */
export function callSiteLines(source: string, call: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line) => Array(occurrencesIn(line, call)).fill(line.trim()) as string[]);
}

/**
 * Every member of `constantName` this source names, in source order and WITH repeats.
 *
 * Repeats are the point — two sites reaching for the same recovery sentence are two sites, and a
 * set would report the pair and the survivor identically once one of them went.
 *
 * `unreadable` carries every occurrence of the constant that names no member, so a reference form
 * this does not understand is reported rather than dropped. A reader that silently skipped them
 * would answer with a clean roster for a file full of references it could not see.
 */
export function constantMembersNamed(
  source: string,
  constantName: string,
): { members: string[]; unreadable: number } {
  const references = [...source.matchAll(new RegExp(`${constantName}(\\.\\w+)?`, "g"))];
  const members = references.flatMap((match) =>
    match[1] === undefined ? [] : [match[1].slice(1)],
  );

  return { members, unreadable: references.length - members.length };
}

/**
 * Class-member declaration at member indent: two spaces, an optional modifier
 * run, then a name opening a parameter or type-parameter list. Anchored at two
 * spaces exactly, because everything nested inside a member sits deeper.
 */
const MEMBER_DECLARATION =
  /^ {2}(?:public |private |protected )?(?:static )?(?:async )?(\w+)\s*[(<]/;

/**
 * Keywords that wear a declaration's shape at member indent inside a top-level
 * function. Excluded by name rather than by grammar: a roster naming `if` reads
 * like a real owner, and that is worse than a reported gap.
 */
const NOT_A_MEMBER_NAME = new Set(["if", "for", "while", "switch", "catch", "return", "do"]);

/**
 * The class member each occurrence of `call` sits inside, in source order and
 * WITH repeats — two presses in one method are two call sites, and a roster
 * that collapsed them would report a method that grew a second one as
 * unchanged.
 *
 * `unattributed` carries every occurrence with no member declaration above it,
 * so a shape this reader does not understand is reported rather than dropped.
 * A gate handed a silently-short roster answers clean for a file full of calls
 * it could not see, which is the failure mode the whole module exists against.
 */
export function callSiteOwners(
  source: string,
  call: string,
): { owners: string[]; unattributed: number } {
  const owners: string[] = [];
  let unattributed = 0;
  let member: string | null = null;

  for (const line of source.split("\n")) {
    const [, declared] = line.match(MEMBER_DECLARATION) ?? [];
    if (declared !== undefined && !NOT_A_MEMBER_NAME.has(declared)) member = declared;

    for (let i = 0; i < occurrencesIn(line, call); i++) {
      if (member === null) unattributed++;
      else owners.push(member);
    }
  }

  return { owners, unattributed };
}

function occurrencesIn(line: string, call: string): number {
  let count = 0;
  for (let at = line.indexOf(call); at !== -1; at = line.indexOf(call, at + 1)) {
    count++;
  }
  return count;
}
