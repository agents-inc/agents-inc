---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/components/hooks/use-section-scroll.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-07-24
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: D-271 fix — extended useSectionScroll with a measured viewport, overflow counts and a focus-decoupled overscroll channel; source-grid now clips-and-signals (ScrollAffordance sibling) and lowers its clip gate below MIN_VIEWPORT_ROWS.
---

## What Was Wrong

The Sources grid (`source-grid.tsx`) diverged from the two established overflow
patterns in three ways, and the gaps compounded at short terminal heights (the
D-271 bug):

1. **No overflow affordance.** `info-panel.tsx` and `step-confirm.tsx` clip a
   too-tall summary and render a `ScrollAffordance` ("N more below") sibling.
   The Sources grid clipped (or bled) with no such signal, so a user could not
   tell content was hidden.

2. **Viewport scroll was welded to focus.** `useSectionScroll` only ever moved
   the viewport to keep the _focused_ row visible, and focus deliberately skips
   inert rows (locked-global `readOnly`, pending-removal `disabled`). A trailing
   inert row — the D-257 pending-removal row is appended last — was therefore
   unreachable: no key could bring it into view.

3. **The outer clip box was missing `overflow: "hidden"`.** `category-grid.tsx`
   sets `{ height, overflow: "hidden" }` on its clip box; `source-grid.tsx` set
   only `{ height }` and relied on the inner viewport's overflow. Once the grid
   actually clipped at a short height this produced a Yoga measurement feedback
   loop (the inner `flexGrow` viewport ballooned to content height in some
   passes), i.e. a latent "Maximum update depth exceeded" waiting for the first
   consumer that measured the viewport.

Separately, the shared `MIN_VIEWPORT_ROWS` gate (`scrollEnabled = availableHeight

> = 5`, tracked as D-266) meant the Sources grid _bled_ rather than clipped when
> its budget dropped below 5 rows — which is exactly what happens on the Sources
> step (tab bar + "Customize skill sources" dropdown card + footer leave it ~3
> rows at a 16-row terminal).

## Fix Applied

Extended the existing `useSectionScroll` mechanism rather than adding a third
scroll pattern:

- The hook now measures the actual viewport box (`setViewportRef`) AND the
  scrolled content box (`setContentRef`), exposes `hidden{Above,Below}` line
  counts, and adds a focus-decoupled `scrollBy` overscroll channel that resets
  whenever focus moves. Measuring the content box (monotonic max, mirroring
  info-panel/step-confirm) rather than summing per-section row heights is
  essential: the sum omits scope-group margins and labels, so `maxScroll` was
  under-computed — the affordance under-reported at 1-2-line boundary overflow
  and overscroll stopped short of the trailing Project-group row.
- `source-grid.tsx` renders `ScrollAffordance` as a sibling of the clipped
  viewport, and its down-arrow handler overscrolls the viewport (instead of
  wrapping) once focus sits on the last focusable row, so trailing inert rows
  scroll into view while staying inert (no select/space/source-cycling). When
  EVERY row is inert (zero focusable rows — a run of locked-global rows plus the
  pending-removal row, the real-world shape), there is no focus anchor, so
  vertical keys fall back to a pure viewport scroll.
- Added `overflow: "hidden"` to the outer clip box (matching category-grid),
  killing the measurement loop.
- Gave the Sources grid a lower clip gate (`minViewportRows: 1`) and let its
  pinned column header/spacer yield to content at the shortest viewports, so it
  clips-and-signals rather than bleeding — the D-266 direction, scoped to the
  one grid the D-271 spec exercises.

## Proposed Standard

Add to `.ai-docs/reference/component-patterns.md` (scroll/overflow section) a
short rule for clip-and-scroll views:

> Any view that clips variable-height content MUST (a) put `overflow: "hidden"`
> on the fixed-height clip box itself — not only an inner child — to keep Yoga
> measurement stable, and (b) render a `ScrollAffordance` sibling of the clipped
> viewport when content overflows. If the view has rows that cannot take focus
> (inert/locked/pending-removal), viewport travel must not depend solely on
> focus — provide a focus-decoupled scroll so every clipped row is reachable.

This would have flagged all three source-grid gaps up front and is the shared
contract `info-panel`, `step-confirm`, `category-grid` and now `source-grid`
should all be measured against (relevant to the D-266 shared-scroll-gate work).
