---
type: convention-drift
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.tsx
  - e2e/interactive/edit-wizard-dual-scope-added-marker.e2e.test.ts
  - e2e/interactive/edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts
  - e2e/interactive/sources-focused-row-marker-spacing.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-31
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

The Sources grid renders a focused row's status marker and name in one `<Text>`:
`{statusGlyph}{` ${name} `}`. `rowStatusGlyph` already returns a trailing space (`"+ "`), so the
highlight's own leading pad lands on top of it — a focused diff row renders `"+  Name "` with TWO
spaces while the same row unfocused renders `"+ Name"`. The skill name shifts a column the moment
focus arrives.

That is a product defect. It has instead been recorded, three times, as a rule for test authors:

1. `edit-wizard-dual-scope-added-marker.e2e.test.ts` carries a JSDoc paragraph explaining that the
   frame is captured while the row under test is UNFOCUSED, "which splits the marker from the name".
2. `edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts` carries the same paragraph, adapted to
   the removal marker.
3. `.ai-docs/standards/e2e/anti-patterns.md` § "Never treat `getOutput()` as a log of every frame"
   states the padding as settled fact in its own WHAT clause — _"typically to dodge the focus
   padding a focused row adds (`+  React ` with two spaces, so `"+ React"` is not a substring)"_ —
   and its corollary "do not manufacture a different render state with a key press" then tells the
   reader to route around it.

The `getOutput()` rule those paragraphs sit inside is correct and should stay: xterm's processed
buffer genuinely is not a frame log. What drifted is the WORKED EXAMPLE. Once a rendering bug is
written into a standards doc as the motivating example for an unrelated rule, every future spec
inherits the dodge, no spec ever asserts the focused form, and the defect becomes structurally
invisible — the suite is green precisely because nothing looks. Two releases of Sources-tab specs
went by with the padding documented and untested.

There is a second, quieter half. `rowStatusGlyph` returns `""` for a row with no status, so in a
mixed grid plain names start two columns left of `+`/`-` names inside the same 24-wide box. The
confirm step does not have this problem: `DIFF_PREFIX` in `skill-agent-summary.tsx` gives even
`unchanged` a two-char prefix. Two surfaces render the same diff vocabulary with different column
arithmetic, and only one of them reserves the marker cell.

## Fix Applied

None to the product — this pass writes tests only. Added
`e2e/interactive/sources-focused-row-marker-spacing.e2e.test.ts`, which is the first spec to assert
the FOCUSED form directly (`toContain("+ <name>")` plus an explicit `not.toContain("+  <name>")` for
the bug shape). It is RED on 0.146.0.

It reaches a focused marked row without a navigation key, which the `getOutput()` corollary above
warns against: the fixture makes the added row the grid's ONLY focusable row (every other row is a
locked global install, which `skipRow` refuses focus), so `firstFocusableRowIndex` can land nowhere
else. That is the general shape for any future focused-row assertion — construct the focus, do not
navigate to it.

## Proposed Standard

Two edits, both in `.ai-docs/standards/e2e/anti-patterns.md`:

1. § "Never treat `getOutput()` as a log of every frame" — replace the focus-padding worked example.
   The rule is about buffer semantics and needs an example that is not a live defect; a row that
   scrolled out of the viewport makes the same point. When the padding is fixed, an unreplaced
   example silently starts describing behaviour that no longer exists.

2. Add a rule under "Reading Rendered Output": **a workaround written into a test's JSDoc is a bug
   report unless a spec pins the un-workaround-ed form.** When a spec sidesteps a rendering
   difference (padding, chevrons, highlight width) to assert something else, it must either cite a
   finding for that difference or point at the spec that asserts it head-on. Both dual-scope Sources
   specs should gain a one-line pointer to `sources-focused-row-marker-spacing.e2e.test.ts`, and
   their dodge paragraphs should be deleted once the padding is fixed — they will read as
   superstition otherwise.

And one for the product side, in `.ai-docs/reference/wizard/component-patterns.md`: state that the
Sources grid and `SkillAgentSummary` share ONE marker cell contract — fixed two columns on every
row, blank when the row carries no status, inside the focused row's highlight so the band is one
width throughout. `DIFF_PREFIX` already implements it; `rowStatusGlyph` is the outlier. This is the
rendering half of the "One diff, one key" standard proposed in
`2026-07-29-sources-tab-session-diff-diverged-from-computescopediff.md`, which unified the
classification and left the presentation to drift.
