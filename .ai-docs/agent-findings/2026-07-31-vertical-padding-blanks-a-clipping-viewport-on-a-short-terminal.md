---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/components/wizard/summary-panel.tsx
  - src/cli/components/wizard/step-confirm.tsx
  - src/cli/components/wizard/scroll-affordance.tsx
  - src/cli/components/hooks/use-measured-height.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-07-31
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: "Panel extracted to summary-panel.tsx with paddingX only; the vertical padding the info panel carried was dropped and the reason recorded in the component's JSDoc. Pinned by e2e/interactive/confirm-step-info-panel-parity.e2e.test.ts."
---

## What Was Wrong

Two things, one structural and one geometric.

**1. The scroll machinery was copy-pasted.** `step-confirm.tsx` and `info-panel.tsx` each carried
their own `useMeasuredHeight` viewport, `measureElement` effect with the monotonic
`Math.max(prev, height)` guard, `maxScroll` / `hiddenBelow` arithmetic, negative `marginTop`,
arrow-key `useInput` and trailing `<ScrollAffordance />` — identical down to a shared six-line
comment. Both then rendered the same `<SkillAgentSummary />`. The only real differences were a
header block the confirm step lacked and two cosmetic props. This is the same convergence failure
already recorded for the Sources tab versus the confirm step (the "one diff, one key" findings),
one layer up: two surfaces rendering the same thing from two copies of the same code.

**2. Vertical padding silently blanks a clipping viewport on a short terminal.** The info panel
used `paddingX={2} paddingY={1}`; the confirm step used `paddingX={1}`. Adopting the info panel's
padding wholesale — which is what "make the confirm step look exactly like the info panel" asks
for — made the panel paint **nothing at all** at `TERMINAL_SIZE.SHORT` (16 rows): no summary row,
and no `N more below` affordance to say rows were missing. Just an empty bordered box.

The mechanism is a self-reinforcing zero, and it is invisible in the code:

- Padding is unshrinkable in Yoga. At 16 rows the panel's content area is one row, so
  `paddingY={1}` (top **and** bottom) consumes it and the clipping viewport is laid out at height 0.
- `measureElement` on a subtree inside a zero-height viewport reports `0`, so `contentHeight` stays
  `0` — the `Math.max(prev, height)` guard cannot rescue it, because there was never a taller
  reading to keep.
- `maxScroll = contentHeight - viewportHeight` is therefore `0`, and `ScrollAffordance` returns
  `null` when both counts are `<= 0`. The panel signals nothing.

Without the padding the same panel is strictly better off: the viewport gets its one row on the
first layout pass, the content measures non-zero, the affordance appears and claims that row back,
and the user at least learns that content is being clipped. The affordance is the _first_ thing
vertical padding takes and the _last_ thing that should go.

## Fix Applied

- Extracted the panel — header + clipped viewport + summary + affordance — into
  `src/cli/components/wizard/summary-panel.tsx` (`SummaryPanel`). It owns the scroll state and the
  `↑`/`↓` keys. `wizard-layout.tsx` (the `I` overlay) and `step-confirm.tsx` both render it;
  `info-panel.tsx` is deleted rather than left as a pass-through wrapper. The duplicated block now
  exists in exactly one place.
- `StepConfirm` keeps a `useInput` of its own for `Enter` / `Esc` only. Two Ink `useInput` hooks
  coexist while they claim disjoint keys.
- Reconciled the cosmetics toward the info panel — `paddingX={2}`, plain `NEUTRAL` border, no
  `borderDimColor` — **except** `paddingY`, which is dropped for the reason above, with the
  constraint written into the component's JSDoc since it is invisible in the result.

## Proposed Standard

For `.ai-docs/reference/component-patterns.md`, in the `ScrollAffordance` section next to the
existing **Placement rule** (which already says the affordance must be a _sibling_ of the clipped
viewport, never a child):

> **A clipping viewport's box takes horizontal padding only.** `paddingY` / `marginY` on the box
> that contains a `useMeasuredHeight` viewport is unshrinkable, so on a short terminal it claims
> the last row the viewport had. The viewport is then laid out at height 0, `measureElement`
> reports `0` for content measured inside it, `maxScroll` is `0`, and `ScrollAffordance` renders
> `null` — the panel paints neither content nor the hint that content is missing. The monotonic
> `Math.max(prev, height)` guard does not help: it preserves the tallest reading, and there never
> was one. Vertical breathing room belongs _inside_ the scrolled content (a `marginBottom` on the
> header block), where it scrolls away instead of permanently costing a row.

The general rule this is an instance of: **a fixed-height cost paid outside a flex viewport is
paid at every terminal height, including the one where the viewport has nothing left to give.**
Anything cosmetic that competes with a clipped viewport for rows should live inside the scrolled
content, not around it.
