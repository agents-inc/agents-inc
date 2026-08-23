---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/helpers/producer-rosters.ts
  - src/cli/lib/__tests__/helpers/producer-rosters.test.ts
  - src/cli/lib/__tests__/kebab-name-judges-agree.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-22
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Both questions the reader asks now run through one `reachesThroughBindings`, so following the
  file's own bindings is a property of the reader rather than of one of its halves. Four fixtures
  were planted in `producer-rosters.test.ts` — one acceptance for the shape that was condemned,
  three refusals for the shapes a widened reader could have been talked into. The workaround the
  limitation forced at `kebab-name-judges-agree.test.ts` kept its function and lost the paragraph
  justifying it, which had become false.
---

# A reader following bindings in one of two questions condemns what it accepts

## What Was Wrong

`producerRostersIn` in `src/cli/lib/__tests__/helpers/producer-rosters.ts` decides whether a spec
holds its roster of producers against a walk of the tree. It asks two questions of every assertion
in the file, in order:

1. does this assertion name the roster?
2. does this assertion reach the tree?

The second followed the file's own bindings — a local holding a glob's result, a helper returning
one — because every derived roster in this repository reaches its walk that way. The first did
not: it was a literal identifier match. So a file whose comparison names a PROJECTION of the
roster rather than the roster read as underived:

```ts
const SITES = [...new Set(JUDGES.map(siteOf))];
expect(walk).toStrictEqual(SITES); // JUDGES appears in no assertion
```

The two questions ask the same kind of thing about the same statement, and only one of them
followed the trail. The asymmetry is invisible at the call site of the gate — a roster reported
underived reads as a roster that IS underived — and the cost lands on whoever writes the next
roster spec: the gate names their file, the file is correct, and the diagnosis is a walk through a
TypeScript AST reader. That happened once, and the file that met it worked around the reader
rather than fixing it, keeping `sitesOf(JUDGES)` as a function so the roster's identifier would
survive into the assertion, with a docblock explaining why an intermediate constant was not
allowed.

**A widening like this can only turn red into green**, which is what makes it dangerous to ship on
its own evidence: nothing it does can redden the gate, so a run that stays green after the change
says nothing about whether the reader still refuses the vacuous shapes it exists to catch.

## Fix Applied

`reachesTheTree` and a new `namesTheRoster` are two callers of one `reachesThroughBindings(root,
index, followed, matches)`. Following bindings is now a property of the reader rather than of one
of its questions, and the two differ only in what they look for and how their visited set is
seeded — the tree question is seeded with the roster's own name, because a roster reached through
itself is the vacuous shape; the roster question is seeded empty, because it is looking FOR that
name and stops on it.

Four fixtures were planted in `producer-rosters.test.ts`, since the gate is green on a clean tree
by design and cannot be the evidence:

| Planted shape                                                   | Verdict |
| --------------------------------------------------------------- | ------- |
| roster held against a walk through an intermediate constant     | derived |
| roster's own key list read through an intermediate constant     | refused |
| roster compared to a projection of itself, no walk anywhere     | refused |
| roster in one assertion, an unrelated walk in the one beside it | refused |

The first fails against the old reader and is the change's own red. The three refusals passed
before the change and after it, which is exactly their job: they are what says the widening did
not also let the vacuous shapes through.

The workaround in `kebab-name-judges-agree.test.ts` was left standing — `sitesOf` still
deduplicates sites and that reason is unchanged — and the paragraph claiming an intermediate
constant "hides that from any reader working from source text" was deleted rather than rewritten,
because it is no longer true.

## Proposed Standard

A rule for `.ai-docs/standards/e2e/assertions.md`, in the section on gates that scan source text:

> **A scan that asks two questions of one statement answers both the same way.** Where one
> question follows the file's bindings and the other matches literally, the scan condemns a shape
> its own other half accepts, and the verdict is indistinguishable from a real defect at every
> call site.
>
> **A widening that can only turn a verdict from red to green ships with planted refusals.** Its
> own suite going green proves nothing — no widening can redden a gate. One fixture per shape the
> widened reader could newly reach, each asserting the verdict it must still refuse.

The second half generalises past this reader and is the part worth keeping: it applies to any
predicate a gate reads a tree with. It does not conflict with the existing rule that a known gap
is named in the assertion rather than encoded in its absence — a planted refusal fixture names the
shape in its own constant and its own `it`, which is that rule's shape rather than an exception to
it.
