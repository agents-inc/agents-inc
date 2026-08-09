---
type: standard-gap
severity: low
affected_files:
  - packages/ui/CLAUDE.md
  - packages/ui/src/components/chip.tsx
  - packages/ui/src/components/matrix-grid.tsx
  - packages/ui/src/styles/globals.css
date: 2026-08-08
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  EDITOR-25 wrote the rule into `packages/ui/CLAUDE.md` and put the ring on
  `Chip` and `MatrixGrid`; EDITOR-27 on 2026-08-09 put it on the five controls
  the resulting audit turned up, each behind a red-first test. The package now
  has one answer everywhere and the doc's exception list is empty, which closes
  both directions of the Proposed Standard. Detail in
  `2026-08-08-the-focus-rule-is-written-and-five-controls-do-not-follow-it.md`.
---

## What Was Wrong

EDITOR-24 made two components focusable, which raised a question the design
system cannot answer: what is a focused control supposed to look like?

`Button` is the only component in `packages/ui` that says. Its cva base carries
`outline-none focus-visible:ring-1 focus-visible:ring-ring`, and nothing else in
the package did until the two EDITOR-24 components copied it. Every other
focusable control — `Chip` (the filter bar, the sub-agent toggles), every
`MatrixGrid` cell, the editor's own hand-rolled buttons — falls through to the
base layer, which sets a colour and no shape:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
}
```

That declares `outline-color` only. Whether anything is drawn, and whether the
amber survives, is then the user agent's decision rather than the design's — and
it differs by browser for `outline-style: auto`. So "focus is visible" is true by
accident on most controls and by intent on three.

Nothing catches this. Axe does not check focus indicators — they are not
machine-decidable — so the a11y addon that gates every story structurally is
silent here, and it is the one class of defect this suite cannot see.

The reason this is a gap and not a bug is that both answers are defensible. A
design that draws no ring and leans on the UA outline is a choice; so is the
amber ring on `Button`. What is not defensible is that the next component author
has no way to find out which one this project made — `MatrixGrid` and `Button`
sit in the same panel and disagree.

## Fix Applied

Nothing at the time of writing. EDITOR-24 was scoped to `CommandBlock` and
`Segmented`; both now carry `Button`'s treatment, on the grounds that a control
made focusable in the same change had better be visibly focusable, and that
copying the one explicit precedent beats inventing a second. `Chip` and
`MatrixGrid` were left exactly as they were.

Under EDITOR-25 on 2026-08-08:

- **The rule is written.** `packages/ui/CLAUDE.md` now exists — the file this
  finding and `2026-08-07-two-interactive-components-are-pointer-only-command-block-and-segmented.md`
  both asked for. It carries the focus rule, the semantics-in-the-tree rules
  those two findings proposed, the play-function simplicity mandate, the axe
  gate with its permanent `color-contrast` holdout, and the three house
  conventions.
- **`Chip` and `MatrixGrid` carry the ring**, on the element rather than in the
  cva. Both cvas are deliberately exported and reused on a passive form — the
  add-skill row's stage badge is a `<span>`, and the grid's absent slot is an
  `aria-hidden` gap — and a thing that cannot take focus should not carry a rule
  about being focused. That placement is now the written rule rather than a
  judgement call.
- **`SegmentedItem` stopped restating it.** It passed the ring down to the
  `Chip` it renders; `Chip` carries it now, so the row says it once.
- One play function each, asserting that focusing the control draws a ring —
  `getComputedStyle(el).boxShadow !== "none"`, in the real Chromium the suite
  already runs. Both were red before the change, and the failure was this
  finding's own point restated: expected `none` not to be `none`. The controls
  drew nothing.

What did not land then were the three more focusable controls the audit turned
up — `Badge` rendered as a button, the dialog header's ✕, and `Input` — which
this finding did not name because it never audited past the two it did.

Under EDITOR-27 on 2026-08-09 those three carry the ring, along with the two
hand-rolled controls in `apps/editor` the same audit named, each with a
red-first test. `packages/ui/CLAUDE.md`'s exception list is empty, so the
package has one answer everywhere and this finding's Proposed Standard is met in
both directions. The detail is in
`2026-08-08-the-focus-rule-is-written-and-five-controls-do-not-follow-it.md`.

## Proposed Standard

> **One focus treatment, named once.** Either every focusable control in
> `packages/ui` carries `focus-visible:ring-1 focus-visible:ring-ring`, or the
> package states that the base-layer outline is the treatment and `Button` is
> corrected to match. A design system with two answers has none.

Where it should live: the `packages/ui/CLAUDE.md` that
`2026-08-07-two-interactive-components-are-pointer-only-command-block-and-segmented.md`
already proposed and which still does not exist. That finding's code side is now
resolved; its Proposed Standard is not, and this is the second rule that has
nowhere to go. The file it asks for would carry three by now: shadcn output is
overwritten by `shadcn add`, cva variants are exported beside the component, a
styled-clickable thing is a button or carries role + tabIndex + keys — plus this
one.
