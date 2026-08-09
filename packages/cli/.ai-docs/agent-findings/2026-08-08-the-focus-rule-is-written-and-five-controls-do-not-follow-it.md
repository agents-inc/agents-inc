---
type: audit
severity: medium
affected_files:
  - packages/ui/src/components/badge.tsx
  - packages/ui/src/components/dialog.tsx
  - packages/ui/src/components/input.tsx
  - apps/editor/src/features/configure/components/skill-options-panel.tsx
  - apps/editor/src/features/configure/components/skill-cell.tsx
date: 2026-08-08
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  EDITOR-27, 2026-08-09. All five controls carry
  `outline-none focus-visible:ring-1 focus-visible:ring-ring`, each behind a
  test that was red first — `Badge`, the dialog ✕ and `Input` through play
  functions in the package's own suite, `LabelledAgentCell` and the ••• dots
  through Playwright specs in `apps/editor`. `Input` took the ruling the
  finding asked for: the ring is the input's own rather than a wrapper's, and
  its comment no longer delegates. `packages/ui/CLAUDE.md`'s exception list is
  empty.
---

## What Was Wrong

EDITOR-25 wrote the focus rule into `packages/ui/CLAUDE.md` and applied it to
the two components it was scoped to. Writing it down forced the question nobody
had asked: which controls actually follow it? Every focusable element the
package can render, checked against source rather than against the list the
originating finding happened to name:

| Control                                   | Focusable when              | Indicator                        |
| ----------------------------------------- | --------------------------- | -------------------------------- |
| `Button`                                  | always                      | ring, in the cva base            |
| `Chip`                                    | always — it is a `<button>` | ring, on the element (EDITOR-25) |
| `MatrixGrid` cell                         | the `<button>` branch       | ring, on the element (EDITOR-25) |
| `CommandBlock`                            | `copyable`                  | ring, on the element             |
| `SegmentedItem`                           | always, via `Chip`          | ring, inherited                  |
| `AlertDialogAction` / `AlertDialogCancel` | always, they render Buttons | ring, inherited                  |
| **`Badge`**                               | when `render` is a button   | **none**                         |
| **the dialog header's ✕**                 | always — a Base UI `Close`  | **none**                         |
| **`Input`**                               | always                      | **none, and suppressed**         |

The last three are not equivalent to each other.

**`Badge`** and **the ✕** fall through to the base layer's
`* { outline-ring/50 }`, which names a colour and leaves the drawing to the user
agent — the same accidental treatment the originating finding described. Both
are real controls: the skill cell renders two interactive `Badge`es, one per
flippable option, each with its own `aria-label`, and the ✕ closes every dialog
in the app. `Badge`'s interactive compound even draws a one-pixel inset glow on
_hover_, so the pointer gets a marker and the keyboard does not.

**`Input`** is worse, and it is the one thing here that is not a fall-through.
Its cva base sets `outline-none` and puts nothing in its place. The component's
own comment says why — "the border belongs to the bar or field wrapping them …
that keeps the wrapper free to own focus and hover states for the whole row" —
but neither wrapper does. `filter-bar.tsx` and `add-skill-dialog.tsx` both draw
a static border and there is no `focus-within` rule anywhere in `apps/editor` or
`packages/ui` except one unrelated opacity reveal in the roster. So both search
fields are focusable with no focus state at any level, and the filter bar
_programmatically moves focus into one of them_ as the bar sticks —
`sticky-bar.spec.ts` asserts exactly that. A keyboard user is handed a caret in
a field nothing marks.

Two more in `apps/editor`, both hand-rolled buttons rather than package
components, both outside EDITOR-25's scope:

- `LabelledAgentCell` in `skill-options-panel.tsx` — a real `<button>` built
  from the design system's own `matrixCellVariants`, so it looks exactly like a
  grid cell and, since EDITOR-25, is the only one of the two without a ring.
- The `•••` dots button in `skill-cell.tsx`, whose only focus treatment is
  `focus-visible:opacity-100` — it becomes visible when focused, which is not
  the same as being marked as focused.

Nothing catches any of it. Axe does not check focus indicators, which is the
whole reason the originating finding exists.

## Fix Applied

Nothing at the time of writing. EDITOR-25 was scoped to `Chip` and `MatrixGrid`'s
cells, and its acceptance was those two plus the authoring doc. Widening it to
five more controls in the same change would have made the red-first evidence for
the two it asked for unreadable.

All five carry the ring under EDITOR-27 on 2026-08-09, each with a red-first
test — three play functions in the package's own suite, two Playwright specs for
the editor's:

- **`Badge`** — on the element, gated on `interactive`, since the same variants
  dress the `added` tag and the `one of` marker. `badge.stories.tsx` gained the
  package's first story of the interactive render at all.
- **the dialog ✕** — on the element; it has no cva.
- **`Input`** — in the cva base, beside the `outline-none` it answers, because
  every render of those variants is an `<input>`. This was the one that needed a
  decision rather than a line, and the finding was right that it belonged to the
  owner: ring-on-input over focus-within-on-wrapper. The filter bar's wrapper
  holds six chips that each draw this ring already, so a `focus-within` there
  would mark the whole row every time one was pressed; and the bar moves focus
  into the field by itself as it sticks, so what receives focus is what has to
  show it. The component's comment no longer delegates.
- **`LabelledAgentCell`** — on the element, mirroring the grid cell it is drawn
  from.
- **the ••• dots** — the ring alongside the `focus-visible:opacity-100` it
  already had, which revealed it without marking it.

`packages/ui/CLAUDE.md`'s exception list is now empty.

Writing the two editor specs turned up why this class of defect survives there:
a Tab that scrolls the page loses its focus to the filter bar. Reported
separately in
`2026-08-09-a-tab-that-scrolls-the-page-loses-its-focus-to-the-filter-bar.md`.

## Proposed Standard

The rule already exists — `packages/ui/CLAUDE.md`, "One focus treatment". What
does not exist is the thing that would have caught this list years earlier:

> **A component that adds a focusable control adds the play function that
> focuses it.** One per component, asserting a ring is drawn. It is three lines
> and it is the only automated check available for this class — axe cannot see a
> focus indicator, so a story that focuses the control and reads its computed
> `box-shadow` is the entire gate.

`Chip` and `MatrixGrid` carry that story now and the pattern is copyable from
either.

For `Input` specifically the decision is a design one and belongs to the owner:
either the input carries the ring itself, or the two wrappers grow a
`focus-within` treatment and the component's comment stops describing something
no call site does. The current arrangement is the only one of the three that is
not defensible, because it is not a fall-through — the outline is switched off
deliberately and replaced with nothing.
