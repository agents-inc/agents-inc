---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/lattice.stories.tsx
  - packages/ui/src/components/chip.stories.tsx
  - packages/ui/src/components/dialog.stories.tsx
  - packages/ui/src/components/divider.stories.tsx
  - packages/ui/src/components/matrix-grid.stories.tsx
  - packages/ui/src/components/input.stories.tsx
  - packages/ui/src/components/badge.stories.tsx
  - packages/ui/src/components/menu.stories.tsx
  - apps/editor/e2e/specs/skill-options.spec.ts
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-03
reporting_agent: web-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The one instance that was actually invisible — LatticeCellButton's ring, clipped by its cell — is
  fixed (`focus-visible:ring-inset`) and held by a screenshot comparison in
  apps/editor/e2e/specs/skill-selection.spec.ts, light and dark, selected and not. The eleven
  computed-style assertions are unchanged and still cannot see a hidden ring; whether to strengthen
  them is open.
---

## What Was Wrong

`packages/ui/CLAUDE.md` -> "One focus treatment" makes a play function the whole gate on a
focus ring: "a component that adds a focusable control adds the play function that focuses it and
asserts a ring is drawn". Every such story asserts it the same way —
`getComputedStyle(element).boxShadow` is not `"none"`. That reads the DECLARATION, and a ring can
be declared, computed, and entirely invisible.

`LatticeCellButton` was exactly that. It is an `absolute inset-0` overlay that fills its cell's
padding box, so its `ring-1` — an outset box-shadow — is drawn wholly in the 1px band outside the
button, which is the cell's border. An unselected cell is `overflow-hidden`, so the ring was
clipped; a selected cell is `overflow-visible` but draws its own `-outline-offset-1` amber over
that same pixel. A focused skill cell and an unfocused one screenshotted byte-identical (audit
issue 23), across about a third of the forward Tab stops on the Configure screen, while
`CellButtonFocusDrawsTheRing` in `lattice.stories.tsx` passed throughout — its own comment calls it
"the only thing holding the cell's surface to that ring".

**Census, not a sample** —
`grep -rn "boxShadow" packages/ui/src apps/editor/e2e --include='*.ts' --include='*.tsx'` on
2026-10-03: 11 story assertions in the 8 `packages/ui` files above, plus the `focusRing` helper in
`skill-options.spec.ts`. Only the lattice cell was found hidden; the other ten were not checked
for visibility, which is the point — the assertion cannot say either way.

## Fix Applied

`LatticeCellButton` draws its ring inset (`focus-visible:ring-inset`), inside the cell's clip and
inside a selected cell's outline; its docblock says why it is the one inset ring in the package.
The editor gained a behavioural test that takes the cell's screenshot under the keyboard and away
from it and asserts the two differ — red on the old class, green on the new, in both themes and
both selection states. The story was left as it is.

## Proposed Standard

For `packages/ui/CLAUDE.md` -> "One focus treatment": a computed `box-shadow` proves a ring was
declared, not that it can be seen, so a control drawn INSIDE a clipping or outlined container
(any overlay filling its parent's padding box, any part rendered under `overflow-hidden`) needs a
visibility check of its own — two screenshots of the container, focused and blurred, compared for
difference. The browser suites already have a screenshot API; a play function does not, which is
why the check for this case lives in the editor's Playwright suite rather than in the story.
This proposal does not conflict with the package's "Play functions stay simple" rule: the story
keeps its simple claim, and the claim it cannot make moves to the suite that can.
