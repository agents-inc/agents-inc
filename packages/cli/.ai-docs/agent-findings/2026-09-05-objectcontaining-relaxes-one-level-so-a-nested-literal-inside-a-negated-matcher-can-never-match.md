---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/derive.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-09-05
reporting_agent: web-developer
category: testing
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  The assertion was deleted with the rest of its describe block under EDITOR-79, because the domain
  chip it was about stopped filtering. The finding stands as the general shape rather than as a
  pending repair — the census below is the whole of the class and it is now empty.
---

## What Was Wrong

`derive.test.ts` carried, at HEAD, one assertion that could not fail:

```ts
expect(
  views.flatMap((view) => view.categories.flatMap((c) => c.cells))
).not.toContainEqual(expect.objectContaining({ skill: { id: HOUSE_ID } }))
```

**`expect.objectContaining` relaxes exactly one level.** Its own keys are matched as a subset; every
VALUE it holds is then compared with full structural equality. So `skill: { id: HOUSE_ID }` asks for
a cell whose `skill` is an object with `id` and nothing else — and `GridSkill` has seven fields
(`id`, `displayName`, `description`, `monogram`, `slug`, `added`, `sourceUrl`). No cell the grid can
ever produce satisfies it, so `not.toContainEqual` was satisfied by every possible input, including
one containing the very skill the test was named for.

**The negation is what made it invisible.** A positive `toContainEqual` written the same way fails on
the first run and is fixed before it lands; a negated one passes on the first run and goes on passing.
This is the shape CLAUDE.md's "NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE"
rule is about, arriving through the matcher rather than through the expected value — and the existing
rule does not reach it, because the assertion names the thing it is looking for.

It also had a pre-existing green reason to pass: the domain chip really did filter the skill out. So
the assertion was right about the world and incapable of noticing when it stopped being right, which
is the case the rule has to catch. When EDITOR-79 removed the domain filter and the skill became
present in every view, the assertion did not move.

## Census

The shape is "a bare object literal as a VALUE inside `expect.objectContaining`", scanned by
bracket-matching each `objectContaining(` call's argument and looking for `key: {` inside it:

```
git grep -l 'objectContaining(' HEAD -- 'apps/**' 'packages/**'
```

**39 `objectContaining` call sites across the two workspaces; exactly one carried a nested bare
object literal, and it is the one above.** Every other site holds primitives, `expect.any(...)`, or
a further `expect.objectContaining(...)` — which is the correct spelling and is what makes this a
one-instance finding rather than a sweep. Rerunning the same scan after the deletion returns zero.

## Fix Applied

None targeted. The assertion and its sibling (`survives its own domain's filter chip`) were deleted
under EDITOR-79 because the domain chip no longer filters anything, so both were testing a mechanism
that had been removed. What EDITOR-19 was actually about — that an added skill sits inside a real
domain rather than outside every one of them — moved onto
`renders in the category it was filed under`, which asserts it by looking the skill up under
`view.id === DOMAIN` and therefore fails if the placement regresses.

## Proposed Standard

A line for `packages/cli/CLAUDE.md` under "Test Assertions", beside the ARITY/LENGTH/ABSENCE rule:

> NEVER nest a bare object literal inside `expect.objectContaining` — the helper relaxes ONE level
> and compares every value it holds structurally, so `objectContaining({ skill: { id } })` asks for a
> `skill` with exactly one field and matches nothing a real type produces. Nest a second
> `expect.objectContaining` instead. A POSITIVE assertion written this way fails immediately and is
> caught; a NEGATED one passes for every input forever, which is why the rule is about the matcher
> rather than about the value. Census: bracket-match each `objectContaining(` argument and look for
> `key: {` inside it — there were 39 call sites and one violation on 2026-09-05.

Cross-checked against the existing NEVER rules: it does not conflict with any, and it is deliberately
narrower than "NEVER broaden an assertion to make a failing test pass" — nobody broadened anything
here; the assertion was born unable to fail.
