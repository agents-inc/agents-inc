---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/spec-gates.test.ts
  - src/cli/lib/__tests__/helpers/journey-page.ts
  - .ai-docs/standards/e2e/user-journeys.md
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  Both halves are closed. The code side had already landed — the reader classifies every backticked
  name totally in `helpers/journey-page.ts`, `spec-gates.test.ts` asserts both residue buckets, and
  the page names all five specs with their directory. The written rule now exists:
  `.ai-docs/standards/e2e/anti-patterns.md` -> Weak Assertions carries "Never let a gate filter its
  own subject", placed directly beneath "Never wrap assertions in fileExists conditionals" and
  stating the relationship between them — that rule skips an assertion, this one skips the SUBJECT.
  It carries the dropped-filter example, the six-entry blast radius from journey 13, the total
  three-kind classification with both gate assertions, the reason `unlocated-spec` and `not-a-spec`
  stay separate kinds, and a pointer to both live files.
---

## What Was Wrong

The from-scratch gate in `spec-gates.test.ts` read `user-journeys.md`'s From-scratch column and
judged the specs each journey named. Its reader picked which backticked names to judge with a
filter:

```ts
function isSpecReference(named: string): boolean {
  const [directory] = named.split("/");
  return directory !== undefined && SPEC_DIRECTORIES.includes(directory);
}
```

A name whose first segment was not a spec directory was dropped, silently. Six entries on the page
were: five specs named without the directory they live in (`init-from-agent-scope` and the three
`init-from-scenarios-*` and `init-from-revalidation`, all of which live in `commands/`) and one code
symbol (`skipIf`).

**A gate that declines to judge is worse than one that fails**, because the page it reads carries
the verdict. `user-journeys.md`'s whole job is to say what has been proved, and a row nothing judged
renders identically to a row that passed — so a quarter of journey 13's named proof was unexamined
while the page read as fully checked. Nothing anywhere printed the count of names skipped.

The filter also hid a second failure mode. The two names that legitimately are not specs are a
fixture helper and a vitest guard, and both are fine — but the gate decided that for itself, once,
for every name that would ever be added. A seventh entry naming a spec that had been deleted, or
naming a helper that no longer exists, would have been dropped on exactly the same silence.

## Fix Applied

Classification is now **total**, in `helpers/journey-page.ts` with its own tests, and the two ways a
name can fail to be a resolvable spec are kept apart because they mean opposite things:

| kind             | means                                             | the gate                       |
| ---------------- | ------------------------------------------------- | ------------------------------ |
| `spec`           | a file answers to it                              | judges it as before            |
| `unlocated-spec` | a real spec named without its directory           | requires the set to be empty   |
| `not-a-spec`     | nothing answers to it — a helper or a code symbol | requires it to be a known name |

`spec-gates.test.ts` asserts `unlocatedSpecsIn(rows)` is `[]` (naming, from `livesAt`, what each
should be rewritten to) and that `nonSpecNamesIn(rows)` equals `RECOGNISED_NON_SPEC_NAMES`, whose
two entries each carry the reason they are not a spec. A new unrecognised name now fails and has to
be justified. The five specs on the page were given their `commands/` prefix.

Both assertions were shown red before they were trusted: the first named all five bare specs and
their rewrites, and after normalisation each was re-broken singly — dropping one directory prefix
back off the page, and adding one unrecognised backticked name to journey 13's cell — and each went
red naming exactly the entry mutated and nothing else.

## Proposed Standard

`.ai-docs/standards/e2e/anti-patterns.md` -> **Weak Assertions**, beside "Never wrap assertions in
fileExists conditionals" — the same silence, one level up from the assertion:

### Never let a gate filter its own subject

**What:** a reader that selects which elements of a document, listing or output it will judge, and
drops the rest — `.filter(isSpecReference)`, `.filter(isRelevant)`, skipping a row whose shape it
does not recognise.

**Why:** the elements it dropped are indistinguishable from the elements it passed. The judgement
is reported against the survivors and reads as a verdict on the whole, and nothing prints what was
skipped or how many. The subject shrinks silently as the document grows.

**Instead:** classify totally. Every element gets a kind, including "not the sort of thing this gate
judges", and the residue is asserted against an explicit list whose entries each state why they are
in it. A gate may exclude something; it may not decide, unrecorded, that it has.

This is the existing "prove the subject is present" rule — a positive guard beside every negative —
applied to the reader rather than the frame: a gate must be able to say what it looked at, not only
what it concluded.
