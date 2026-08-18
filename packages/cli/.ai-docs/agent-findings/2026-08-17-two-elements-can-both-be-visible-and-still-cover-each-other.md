---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/src/features/configure/components/configure-screen.tsx
  - apps/editor/src/components/nav-rail.tsx
  - apps/editor/src/routes/route-components.tsx
  - apps/editor/e2e/specs/marketplace.spec.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-17
reporting_agent: web-developer
category: testing
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed — EDITOR-35 is fixed and `marketplace.spec.ts` now measures bounding boxes at two
  window widths. Standard side pending — nothing tells the next author that a floating control needs
  a geometry assertion, and nothing forbids the positioning idiom that caused this, so the next
  floating control will be written exactly the same way.
---

## What Was Wrong

Two defects, and the second is why the first survived.

**The defect.** The editor's floating Marketplace button was `fixed bottom-5 left-5`. The nav rail is
the page grid's first column, `h-svh` and pinned to the left edge, with a Github link at its foot.
Measured in Chrome at 1600×1000 the button occupied x 22–136 and the link x 85–149: the word
"Github" was covered outright and a sliver of the Octocat showed past the button's right edge.
`document.elementFromPoint` at the link's own centre returned the button. It had been that way since
the button was introduced.

**Why no test saw it.** Both elements were present, both were `visible` to Playwright, both had their
accessible names, and both were clickable by Playwright — which clicks through an overlay by
dispatching at the element's box rather than by hit-testing what a person would actually press. Every
assertion in a 255-test suite was true. The suite had no assertion of any kind about where two
elements are relative to each other, so an entire class of defect — one element sitting on another —
was invisible to it by construction. This is the class that "found by hand-drive" keeps meaning.

**The positioning idiom that caused it, which is general.** `position: fixed` resolves against the
viewport. The page it was placed on is `mx-auto max-w-[105.25rem] min-w-[85.25rem]`, so past 1852px
the grid stops filling the window and starts being centred in it. From then on every column slides
right as the window widens while a viewport-fixed offset stays where it is. Measured:

| window | nav rail | fixed button | outcome                     |
| ------ | -------- | ------------ | --------------------------- |
| 1600   | 0–167    | 22–136       | on top of the rail          |
| 1920   | 34–201   | 22–136       | on top of the rail          |
| 2560   | 354–521  | 22–136       | out in the margin, detached |

No constant `left` is right at all three. A value tuned on one monitor is wrong on the next, and
tuning it against the suite's pinned 1600px viewport would have produced exactly that — a green
suite and a broken wide screen. **A viewport-fixed offset cannot address a centred max-width layout
at all**; it is not a value to get right, it is the wrong mechanism.

## Fix Applied

The button became `sticky bottom-5 z-40 w-fit` and moved inside `<main>`, the column it is a
statement about. Sticky asks the column where it is instead of guessing, so the button now tracks the
grid at every width — measured gap to the rail is the 66px gutter at 1600, 1920 and 2560 alike — and
carries no layout constant of its own. `w-fit` keeps the box no wider than the button, because any
width it does not need is a strip of skill cells that cannot be clicked.

The assertion added to `marketplace.spec.ts` measures both bounding boxes live and asserts the
button's left edge is at or past the rail's right edge, at the pinned viewport and again at 2560
where the grid centres. Three properties make it worth having rather than a snapshot of today's
pixels:

- **It reads both boxes at run time.** There is not one coordinate in the test; what is asserted is a
  relationship between two elements that are on screen now.
- **It is asserted against the RAIL, not the Github link.** The rail is a full-height column at the
  page's left edge, so vertical separation is impossible by construction and the whole question is
  horizontal. Move the link, add a second item beside it, or change the column's width and the
  assertion still says the same thing — and it says it about the whole class of "a floating control
  was dropped on the nav rail" rather than about one link.
- **It runs at a width where the grid centres.** That is the width a constant `left` gets wrong, so
  the wrong fix cannot pass.

It also prints usefully. The recorded RED was `Expected: >= 0, Received: -145.1875` — the overlap in
pixels — where a boolean would have said "expected true to be false".

## Proposed Standard

Two rules, both for `.ai-docs/standards/e2e/README.md` (a new "Geometry" section — the file has no
rule about position today, only about roles, waiting and fixtures):

1. **A control that floats over other content needs a bounding-box assertion, not a visibility
   assertion.** `toBeVisible()` is true of both elements in every overlap defect there is, and
   Playwright's click dispatches at the box rather than hit-testing, so neither visibility nor
   clickability can see one element covering another. Assert the relationship between two live
   `boundingBox()` reads, and assert it against the CONTAINER the control must clear rather than
   against whichever element happens to sit in the overlap today. Prefer an assertion that prints the
   overlap (`expect(gap).toBeGreaterThanOrEqual(0)`) over one that prints a boolean.

2. **`position: fixed` is not available inside a centred max-width layout.** Any component whose
   offset is measured from the viewport while the page is `mx-auto max-w-*` is wrong at some window
   width by construction, and reviewing the number will not find it — the number is not the problem.
   Use `sticky` within the column the control belongs to, so the grid positions it, or if it genuinely
   must be viewport-fixed, say why and pin it with a geometry assertion at a width where the grid
   centres. This belongs beside the layout constants in `apps/editor/src/routes/route-components.tsx`
   as well, which is the only place `max-w-[105.25rem]` and the `9.5rem` rail width are written down
   and which nothing currently warns you about.

A related gap this pass did not close: the suite pins one viewport (1600×1000) for every project,
and the config's comment explains the FLOOR (below 1324px the layout is undesigned) without saying
anything about the ceiling. Nothing tests a window wider than the grid's own max width, which is
where centring begins and where a whole family of offset bugs lives.
