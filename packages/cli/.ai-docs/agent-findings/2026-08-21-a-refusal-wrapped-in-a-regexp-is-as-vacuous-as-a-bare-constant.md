---
type: standard-gap
severity: medium
affected_files:
  - scripts/check-briefing-contract.test.ts
  - scripts/refusal-expectations.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

The pass that closed the vacuous-refusal defect had two candidate fixes written down for it, and
**one of them does not work**. The tracker row proposed asserting
`toThrow(new RegExp(CONSTANT))` "so an undefined constant is a TypeError rather than a wildcard".
`new RegExp` does not throw on `undefined`: it coerces the argument to the empty string, so the
value is `/(?:)/`, the empty pattern, which is a substring of every error message ever thrown. The
wrapped shape is vacuous in exactly the way the bare one is, one keystroke longer, and it reads as
the deliberate repair.

Reproduction, in plain node:

```
node -e 'console.log(String(new RegExp(undefined)), /(?:)/.test("any error at all"))'
```

answers `/(?:)/ true`.

The second half is that **the scan written to stop the class does not see it**. `isVacuous` in
`scripts/refusal-expectations.ts` condemns an argument that is a bare identifier the file imports;
`new RegExp(NO_BINDING_DOCUMENT)` is a `NewExpression`, so it passes. Census of the shape, over
every tree a spec lives in:

```
grep -rn 'toThrow(new RegExp(' scripts/ src/ e2e/ --include='*.ts' --include='*.tsx'
```

answers two files, and the population moved while this was being written —
`check-briefing-contract.test.ts` gained another wrapped assertion between two runs of that command
an hour apart, which is why the command is written here and a tally is not. Every hit in that file
wraps a refusal constant imported from `check-briefing-contract.ts`. The one in
`src/cli/lib/seed/config-to-seed.test.ts` is a different thing entirely: it interpolates locals into
its pattern, a regex there is what the assertion needs, and a locally-declared name cannot be the
one a module forgot to export. (Run it both ways. This machine's `grep` is ugrep, which needs `-P`
for some parenthesis patterns; for this one the two agree, and a census that has not been checked
both ways can be silently empty.)

**Nothing is vacuous in fact today.** Every constant those assertions name is exported, so every one
of them discriminates. What the shape costs is the guarantee: the day one of those exports is
renamed, they go on passing, and the scan that exists to say so reports clean. That is the same
distance from a live defect as the original was on the day it was written.

## Fix Applied

None to the checker, and deliberately. The three call sites are in a file another lane owns this
round, and widening `isVacuous` before they move would redden a suite this pass cannot repair — a
gate whose first act is to fail somebody else's work is a gate that gets reverted. Reported with
the exact change instead, per the standing rule that an agent needing a change in another lane's
file reports it rather than makes it.

Both halves, so whoever holds those files can land them in one edit:

1. In `check-briefing-contract.test.ts`, every wrapped assertion becomes the same call every other
   suite under `scripts/` already makes —
   `expectRefusal(() => check({ repositoryRoot: root }), NO_BINDING_DOCUMENT)` and its siblings,
   importing `expectRefusal` from `./refusal-expectations.js`.
2. In `refusal-expectations.ts`, `isVacuous` looks through a regexp wrapper before judging its
   argument: an argument that is a `new RegExp(x)` or a bare `RegExp(x)` call is judged as `x`.
   Its own suite gets the fixture beside the ones already there — a `toThrow(new RegExp(IMPORTED))`
   that must be condemned, and a `toThrow(new RegExp(\`${LOCAL}\`))` that must not be.

Order matters between them: (2) before (1) is a red suite in another lane's tree, and the whole
reason this is a report rather than a commit.

## Proposed Standard

The rule already exists in the right words and is one clause short. Wherever the vacuous-refusal
rule is written — `refusal-expectations.ts`'s own docblock is where a reader of these suites meets
it — it names the bare constant and the empty matcher. Add the third:

> A refusal is asserted against a message the run can read. `toThrow(CONSTANT)`,
> `toThrow()` and `toThrow(new RegExp(CONSTANT))` are the same assertion — the last one looks like
> the repair for the first and is not, because `new RegExp(undefined)` is the empty pattern rather
> than an error. Wrap nothing; call `expectRefusal(run, refusal)`, which judges the message before
> the matcher ever sees it.

No new checker is proposed: this is one predicate inside the scan that already exists, which is the
cheapest place a rule of this shape can live, and the reason the original was worth writing.
