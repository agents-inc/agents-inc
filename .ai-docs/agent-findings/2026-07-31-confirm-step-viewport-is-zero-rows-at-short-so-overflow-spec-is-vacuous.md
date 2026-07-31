---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/wizard-overflow-affordance.e2e.test.ts
  - e2e/interactive/confirm-step-info-panel-parity.e2e.test.ts
  - src/cli/components/wizard/step-confirm.tsx
  - src/cli/components/wizard/info-panel.tsx
  - src/cli/components/wizard/scroll-affordance.tsx
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-07-31
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: superseded
superseded_by: 2026-07-31-negative-render-assertion-needs-a-positive-subject-guard.md
---

<!--
SUPERSEDED. The measurement below was taken at the 16-row TERMINAL_SIZE.SHORT. The minimum-terminal
gate has since moved to 20 rows, so the confirm viewport is FIVE rows, not zero — the panel header
fills all five at scroll offset 0, and summary rows do render further into the scroll range. The
vacuous assertion this finding identified is fixed, and the proposed standard is carried forward
with mutation evidence, in the superseding finding.
-->

## What Was Wrong

At `TERMINAL_SIZE.SHORT` (16 rows) the confirm step's clipping viewport measures **zero rows**, so
the step paints **no summary content at all** — only the overflow affordance. Verified against the
real binary at v0.146.0; the whole content box is three lines and the single line inside its border
is consumed by `ScrollAffordance`:

```
 ┌────────────────────────────────────────────────┐
 │ 2 more below                                   │
 └────────────────────────────────────────────────┘
```

Arrowing down changes only the counters (`3 more above   9 more below` … `12 more above`); no skill
or agent row is ever painted at any scroll offset. The layout above it is fixed-height — the tabs
box (3 rows), the `Ready to install …` dropdown (3 rows), a margin row, then the hotkey row and the
two-rule footer — so nothing about the selection can make content visible at this geometry.

Two consequences:

1. **An existing assertion cannot fail.** `wizard-overflow-affordance.e2e.test.ts` → "keeps the
   confirm summary inside its box border" asserts `expect(screen).not.toContain("─+ ")`, whose
   stated contract is "the summary must not paint over the border it should be clipped inside". The
   summary is never painted at that geometry, so the bug shape it looks for is unreachable and the
   assertion is vacuously true. Its sibling in the same file ("shows a scroll-down affordance …") is
   sound — the affordance IS the thing rendered. The two read as a matched pair, which is what makes
   the vacuous one easy to trust.

2. **A geometry gap in the affordance-vs-content contract.** A scroll affordance whose viewport has
   no room for content tells the user there are twelve hidden lines and offers no way to see one.
   Whether that is a product defect or an accepted degradation at the minimum supported height is a
   product call; it is recorded here because the E2E suite currently reads as if it were covered.

This is the same class the standards already name for `expect.arrayContaining` and
`fileExists`-wrapped assertions — an assertion that passes for a reason other than the one it
claims — but the trigger here is a **geometry** where the subject never renders, which neither
anti-patterns.md nor assertions.md currently mentions.

## Fix Applied

None to product code — this pass was test-only, and `step-confirm.tsx` must stay untouched for the
F-4 refactor.

In `e2e/interactive/confirm-step-info-panel-parity.e2e.test.ts` the scroll spec asserts the strongest
signal that IS observable at `SHORT` — the affordance transition across the full scroll range in both
directions (`more below` present / `more above` absent at the top → `more above` present /
`more below` absent at the bottom → back again after arrowing up) — and carries a `// KNOWN GAP:`
comment holding the content-reveal assertion that becomes valid once the panel reserves a content
row. The existing vacuous assertion in `wizard-overflow-affordance.e2e.test.ts` was left alone
rather than deleted: it is another file's spec, and it becomes meaningful the moment the viewport
has a row.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the "Weak Assertions" group:

> **Never assert a rendering invariant at a geometry where the subject does not render.** A
> `not.toContain("<bug shape>")` on a clipped viewport passes for free when the viewport measures
> zero rows and paints nothing. Before writing a negative rendering assertion at
> `TERMINAL_SIZE.SHORT`, pair it with a positive assertion that the subject IS on screen — the same
> proof-of-execution rule the bible already applies to conditional code paths. If the subject cannot
> be made visible at that geometry, the invariant belongs in a component test, where the viewport
> height is a prop rather than a terminal.

Cross-reference it from `.ai-docs/standards/e2e/assertions.md` → "Assert the Surface That Retains
the Value", which today distinguishes WHICH surface holds a value but not whether the value was
ever rendered onto any of them.

Also worth recording in `.ai-docs/reference/testing/e2e-infrastructure.md` beside the
`TERMINAL_SIZE` table: at `SHORT`, the confirm step's summary viewport is zero rows. That single
sentence is what would have stopped this spec from being written as it was.
