---
type: anti-pattern
severity: medium
affected_files:
  - e2e/pages/steps/build-step.ts
  - e2e/interactive/init-wizard-category-header.e2e.test.ts
  - src/cli/components/wizard/category-grid.tsx
  - .ai-docs/reference/testing/e2e-infrastructure.md
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-25
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: premise-expired
status: partial
partial_note: >-
  The code side had already landed when this was filed and is not this pass's work.
  `getExclusiveCategorySelectedCount` in `e2e/pages/steps/build-step.ts` now matches the escaped
  display name straight onto its counter group with nothing optional between them, its docblock
  example carries nothing between the two halves either, and
  `e2e/interactive/init-wizard-category-header.e2e.test.ts` pins the adjacency positively. The
  documentation half landed with this filing — `.ai-docs/reference/testing/e2e-infrastructure.md`
  had rendered the deleted glyph in its observability table and no longer does. What is NOT written
  is the general rule. This programme was fixes-only and a new checker or standards clause was ruled
  out of scope, so the Proposed Standard below is a proposal and nothing enforces it.
---

## What Was Wrong

Two halves, one occasion. The first is the discovery; the second is about the sweep that hunts it,
and is filed here rather than separately for the reason given at the end.

### A spec's TOLERANCE for a deleted token outlives the token, and the compiler cannot see it

A product change deleted the marker the build grid used to paint between an exclusive category's
display name and its pick-one counter. `CategorySection` in
`src/cli/components/wizard/category-grid.tsx` now emits the display name, one space and the
`(N of M)` counter, and nothing else — for a non-exclusive category, the name alone.

The assertion that matched the marker HARD went red on the removal and was fixed. That is the cheap
half, and it is the half everyone sees.

What was not caught is that `getExclusiveCategorySelectedCount` in `e2e/pages/steps/build-step.ts`
carried an OPTIONAL match for the same glyph inside its own header regex — an escaped-then-optional
fragment sitting between the display name and the counter group — and that the docblock immediately
above it carried the same accommodation in prose. **An optional match for something that can never
appear is green forever.** No assertion fails, `tsc` reports nothing, and ESLint has nothing to
report: the fragment is not wrong, it is unreachable, and nothing in this toolchain distinguishes
those two states.

The class generalises past this one regex. When a product removal deletes a rendered token, the red
assertions are the cheap half; the expensive half is every **optional** or **negative**
accommodation of that token in the page-object layer, and no test failure and no `tsc` run will
surface one. The negative form is worse on this harness specifically: `getOutput()` reads scrollback
as well as the viewport, so a `not.toContain` naming a glyph the product no longer draws is an
assertion that can never fail again — and, unlike the optional form, it reads as a deliberate guard.

Two censuses over the tree as of this filing, both run rather than estimated:

```
grep -rnF '\*?' e2e src scripts --include='*.ts' --include='*.tsx' --include='*.mjs'
```

One hit in one file, and it is not a live site: `e2e/helpers/handrun.gen.mjs` is the esbuild bundle
`scripts/handrun.mjs` writes, so it carries the pre-fix source of the page object and clears on the
next regeneration.

```
grep -rnE 'not\.(toContain|toMatch)' e2e --include='*.ts' | grep -F '*'
```

Five hits in five files, none of them an accommodation: every one is doc-comment prose about the
scrollback pitfall in general, and none names the deleted glyph. So the negative form of the class
is at zero here — which is worth writing down, because "zero" and "nobody looked" are the same
sentence otherwise.

### The census for a deleted token cannot find its own headline hit

A prior sweep for this glyph ran a pattern of the shape `grep -rn 'Name \*'`. That is a basic
regular expression, where `\*` is a LITERAL asterisk — so the command matches the token as it is
RENDERED and does not match the token as it is WRITTEN IN SOURCE, where a regex literal or a string
escape puts a backslash in front of it. The one line the sweep existed to find was the one line it
could not match. Reproduction, two commands over the same two-line file:

```
printf 'const re = /Cat \\*/;\nCat * (0 of 1)\n' > demo.txt
grep -n  'Cat \*' demo.txt   # -> line 2 only: the RENDERED form
grep -nF 'Cat \*' demo.txt   # -> line 1 only: the SOURCE form
```

Neither invocation finds both, and the failure is silent in the direction that matters: the sweep
returns hits, so it reads as having run, and the absence of the source-form hit reads as the source
being clean.

**Why this is filed with the half above rather than on its own.** The remedy the first half asks for
IS a census, and this is the way that census silently returns nothing. Split across two files, the
caveat sits where nobody running the sweep has reason to look, which is the same reasoning
`CLAUDE.md` already uses for putting a pin in the test whose subject is the gap. The two do have
different causes — the first is a premise that expired under it, the second is a tool dialect that
was never right — and `root_cause:` above carries the first, because the frontmatter holds one value
and the first is what this file is about.

## Fix Applied

Documentation only, and only the half in this agent's lane.
`.ai-docs/reference/testing/e2e-infrastructure.md` stated the focused category header as carrying
the deleted glyph between the display name and the counter; the passage now states the rendering
re-derived from `CategorySection`, and draws its focused-vs-unfocused contrast on the leading space
the highlight adds, which is the property that sentence was always about.

The e2e-side accommodations were already gone when this was filed — see `partial_note:`. This pass
did not write them and did not verify when they went; it verified only that they are absent now.

## Proposed Standard

**A proposal, not an approved instruction, and deliberately not implemented here.** The programme
this was found under was fixes-only, and "guards are not features" is a standing ruling in this
repository — so no checker was added and no standards file was edited.

If it is ever taken up, `.ai-docs/standards/e2e/anti-patterns.md` is where it goes, as a clause on
removing a rendered token: the sweep covers optional and negative references to the token as well as
hard matches, and it is written with `grep -F` (or with both dialects run separately) because the
rendered form and the source form of a token carrying a regex metacharacter are different strings.

Cross-checked against `CLAUDE.md` as `README.md` -> "Writing a Finding" requires, and it does not
conflict. The nearest existing rule is "NEVER encode a known gap in an assertion's ARITY, LENGTH or
ABSENCE", and this is a different mechanism rather than a restatement of it: that rule covers an
assertion written around a defect that is present, where this covers an accommodation that was
CORRECT when written and was left behind by a later removal. "NEVER broaden an assertion to make a
failing test pass" is adjacent for the same reason and does not reach it either — nothing was
broadened; the breadth was already there and stopped being paid for.
