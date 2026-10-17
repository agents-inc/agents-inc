// Text readers, not a syntax tree: reformatting a rostered call site is meant to redden its gate.

/** One entry per occurrence, not per line, so a second call on a line is never collapsed. */
export function callSiteLines(source: string, call: string): string[] {
  const lines = source.split("\n");
  // Array(n).fill() is typed any[].
  return lines.flatMap((line) => Array(occurrencesIn(line, call)).fill(line.trim()) as string[]);
}

/** Keeps repeats; `unreadable` counts references naming no member, so none is silently dropped. */
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

// Exactly two spaces: anything nested inside a member sits deeper.
const MEMBER_DECLARATION =
  /^ {2}(?:public |private |protected )?(?:static )?(?:async )?(\w+)\s*[(<]/;

// Control-flow keywords at member indent inside a top-level function look like declarations.
const NOT_A_MEMBER_NAME = new Set(["if", "for", "while", "switch", "catch", "return", "do"]);

/** Keeps repeats; `unattributed` counts calls with no member above them, never dropped. */
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
