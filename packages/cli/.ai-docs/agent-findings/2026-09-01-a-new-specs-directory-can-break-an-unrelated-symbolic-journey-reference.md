---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/helpers/journey-page.ts
  - .ai-docs/standards/e2e/user-journeys.md
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-09-01
reporting_agent: api-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-856 made a directory's kind STATED rather than derived. `SPEC_DIRECTORIES` in
  `journey-page.ts` is a `readonly string[]` the reader consults; the old derivation became the
  exported `specDirectoriesIn`, used only by a roster gate in `journey-page.test.ts` that holds the
  two against each other with `toStrictEqual`. The docblock's objection to a hand-kept list — that a
  new directory would go unjudged in silence — is answered by that gate rather than ignored.
---

## What Was Wrong

Adding the first real spec file to `e2e/fixtures/` broke four unrelated tests in
`spec-gates.test.ts`, all reporting the same error for a name nothing about the new file mentions:

```
Error: the page names 'fixtures/dual-scope-helpers.initGlobalWithEject', and no spec file answers to it
```

`user-journeys.md`'s journey 1 row names `fixtures/dual-scope-helpers.initGlobalWithEject` in its
From-scratch column — a code SYMBOL (a helper function in `dual-scope-helpers.ts`), not a spec, and
`RECOGNISED_NON_SPEC_NAMES` in `spec-gates.test.ts` already lists it as such. But `classify()` in
`journey-page.ts` does not consult that allowlist at all; it decides in one step:

```ts
function classify(name, specNames, directories) {
  if (specNames.includes(name)) return { name, kind: "spec" };
  if (directories.has(firstSegment(name))) {
    throw new Error(`the page names '${name}', and no spec file answers to it`);
  }
  // ... falls through to "not-a-spec" only when the first path segment
  // names no directory that holds any real spec at all
}
```

`directories` is `specDirectories(specNames)` — the set of first path segments across every REAL
`.e2e.test.ts` file on disk, recomputed fresh each run. Before this task, `e2e/fixtures/` held zero
spec files, so `"fixtures"` was never in that set and `fixtures/dual-scope-helpers.initGlobalWithEject`
fell through to `not-a-spec`, matching `RECOGNISED_NON_SPEC_NAMES` and passing silently. The moment
`e2e/fixtures/seed-config-store.e2e.test.ts` existed, `"fixtures"` entered the set, and the SAME
symbolic name — mentioning nothing about the new file — started throwing, because the classifier's
only signal for "is this an intended spec path that went stale" is "does a spec live anywhere in
this directory," and that signal flips for every name sharing the prefix at once.

**The general shape:** a symbolic (non-spec) reference is disambiguated from a stale spec reference
purely by which directories happen to hold real specs, rather than by consulting the same allowlist
(`RECOGNISED_NON_SPEC_NAMES`) that exists to make that exact distinction. The allowlist is real and
correctly maintained; the code path that would need it to avoid a false positive does not read it.
This makes the first spec ever added to a fixture-only directory an unannounced breaking change to
whatever symbolic references already use that directory's name as their prefix — the failure names
the SYMBOL, not the new file, so nothing about the four failures pointed at what actually changed.

## Fix Applied

None to `journey-page.ts` or the allowlist mechanism — out of this task's file ownership
(`packages/api-mocks/**` and `packages/cli/e2e/fixtures/seed-config-store.ts` only). Worked around
by not adding a spec under `e2e/fixtures/` at all: the new spec
(`e2e/commands/seed-config-store-validation.e2e.test.ts`) lives in `commands/`, a directory already
spec-bearing before this task, so no directory's spec-bearing status changed and the collision does
not occur. `commands/warn-suppression-stops-at-the-harness.e2e.test.ts` is the existing precedent
for a harness-subject spec sitting outside its thematic directory for exactly this reason.
`user-journeys.md`'s harness-exception paragraph documents the placement.

## Proposed Standard

**Neither proposal this section originally carried was adopted, and both are deleted rather than
left standing — a refused recommendation reads as an instruction.** What was adopted is a third
thing: CLI-856 made a directory's kind STATED. `SPEC_DIRECTORIES` in `journey-page.ts` is a
`readonly string[]` the reader consults, and the derivation survives only as `specDirectoriesIn`,
which a roster gate in `journey-page.test.ts` holds the constant against with `toStrictEqual`.

The two refusals, so nobody re-proposes them:

- **Threading `RECOGNISED_NON_SPEC_NAMES` into `classify()`** would hand the reader the roster it is
  then measured against. A gate that consults the allowlist it exists to check answers about itself.
- **A documented pre-flight step in `user-journeys.md`** — "before adding the first spec to a
  directory, re-check every symbolic prefix" — is prose asserting an absence with nothing that could
  check it, which is the shape `documentation-bible.md` rules against. It would have turned a silent
  trap into a silent trap with a paragraph beside it.

**What survives as the rule is the DIAGNOSIS rather than either remedy**: a classifier whose only
signal for "an intended spec path that went stale" is "does a spec live anywhere in this directory"
flips that signal for every name sharing the prefix at once, and the failure then names the symbol
rather than the change. State the vocabulary a reader judges by; do not measure it off the tree it
is judging.

## How It Was Caught

Not by design — it surfaced as 4 failures in `npm test` after the write-schema-validation fix
(CLI-849) and its tests were already green, none of which touch `dual-scope-helpers.ts` or journey
1's row. Traced by noticing the failing names shared no relationship with the change under test,
checking `git status` for evidence the failure predated this session (it did not — `dual-scope-
helpers.ts` and `user-journeys.md`'s journey-1 row were both untouched and unmodified), and then
reading `classify()` to find the directory-membership check that a first-ever spec under
`e2e/fixtures/` would flip.

## Residual

**Closed by CLI-856 on 2026-09-02.** The mechanism was unfixed when this was written: a future
symbolic reference sharing a directory-style prefix with a currently spec-free `e2e/` subdirectory
would reproduce this failure shape the day a real spec first landed there, regardless of which two
were involved. Verified end to end at the time of the fix by writing a throwaway spec into
`e2e/fixtures/` and running the gates both ways — **five reds with the derivation restored, one
after**, and that one is the correct self-explanatory "a spec belongs to no journey" a new spec
should produce. `RECOGNISED_NON_SPEC_NAMES` holds exactly
two entries today (`sed -n '/RECOGNISED_NON_SPEC_NAMES = \[/,/\];/p'
src/cli/lib/__tests__/spec-gates.test.ts`); only `fixtures/dual-scope-helpers.initGlobalWithEject`
carries a slash, so `fixtures` is the only prefix currently at risk — `skipIf`, the other entry, has
none and cannot collide this way.
