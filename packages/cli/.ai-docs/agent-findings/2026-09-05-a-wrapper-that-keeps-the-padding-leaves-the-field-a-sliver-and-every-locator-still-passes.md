---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/input.tsx
  - packages/ui/src/components/input.stories.tsx
  - apps/editor/src/features/configure/components/filter-bar.tsx
  - apps/editor/src/features/configure/components/composer.tsx
  - apps/editor/src/features/configure/components/add-skill-dialog.tsx
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/e2e/specs/field-hit-area.spec.ts
  - apps/editor/e2e/specs/composer.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
  - packages/ui/CLAUDE.md
date: 2026-09-05
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  EDITOR-76 moved each box's inset off the wrapper and onto the field it draws around, made
  the one box that cannot give its inset away a `<label>`, and added
  `apps/editor/e2e/specs/field-hit-area.spec.ts` — which presses each corner of each drawn
  box and asks what holds the caret. `input.tsx`'s docblock now states the half of the
  contract it had left unsaid, and `input.stories.tsx` stopped demonstrating the broken
  arrangement.
---

## What Was Wrong

`packages/ui/src/components/input.tsx` is deliberately a bare field — its cva base is
`min-w-0 flex-1 border-0 bg-transparent p-0 …` — and its comment said why:

> Both search fields in the design are borderless — the border belongs to the bar or field
> wrapping them, so the input itself contributes only type.

**The comment named the border and said nothing about the padding, and every wrapper kept
it.** So between the border a visitor sees and the text they read sat a ring belonging to
neither: inside the field's border, on the field's own fill, and dead to a press. The field
was a strip in the middle of its own box. The owner's framing: "that entire border area
should be the search field. The input inside of it shouldn't be a sliver of it."

Four boxes, measured through `getComputedStyle` and `getBoundingClientRect` in Chromium at
1600×1000 — `packages/ui/src/styles/globals.css` sets the root to `font-size: 110%`, so the
computed figures below are 1.1× their rem values and `0.9375rem` is 16.5px rather than 15:

| box                                  | border box       | field inside it | wrapper padding  |
| ------------------------------------ | ---------------- | --------------- | ---------------- |
| `filter-bar.tsx` search field        | 838.28 × 57      | 803.28 × 22     | 16.5px all round |
| `composer.tsx` band (no side border) | 1102.81 × 106.48 | 970.81 × 37.13  | 66px left/right  |
| `add-skill-dialog.tsx` search        | 570 × 43         | 513.84 × 19     | 11px / 13.2px    |
| `marketplace-dialog.tsx` `Field`     | 570 × 43         | 541.63 × 19     | 11px / 13.2px    |

Pressing 2px inside each corner and reading `document.activeElement` back: `BODY` for the
search field, `BODY` for the composer's band edges, a `DIV` for the add-skill search.

**The consumer list is a census**, from

```
grep -rln "components/input" apps packages --include="*.tsx" | grep -v stories
```

which returns three files. `composer.tsx` is a fourth site with the same defect and does not
appear in it, because its field is a raw `<textarea>` rather than the shared `Input` — the
grep that finds the shared component cannot find the shape.

### The partial fix that looks total

`marketplace-dialog.tsx`'s `Field` already wrapped its box in a `<label>`, so every corner
press there DID reach the field — it was the one of the four that passed the new spec on its
first red run. It is not a fix and it hid the defect at that site: activating a label focuses
the control and drops the caret at the END of the value wherever the pointer was. Pressing
2px inside the left border of a field holding `owner/repo` answered `selectionStart === 10`.
A `<label>` turns the dead ring into a button that opens the field; it does not make the ring
part of the field.

### Nothing in the suite could see any of it

507 e2e tests passed with all four fields dead. **A press at a POINT had never been made:**

```
grep -rn "mouse.click\|mouse.move\|elementFromPoint" e2e --include='*.ts'
```

returned nothing before this row. `apps/editor/e2e/README.md` already names the mechanism —
"Playwright clicks by dispatching at an element's box rather than by hit-testing what a person
would press" — but names it about ONE ELEMENT COVERING ANOTHER, and every locator-driven
action in the suite is a dispatch at the field's own box, which was live. `.click()`,
`.fill()`, `toBeFocused()` and `getByLabel` are all satisfied by a field that is one pixel
tall in the middle of a 57px box.

The two `data-slot="search-field"` assertions in `specs/filters.spec.ts` are the closest the
suite came: they claim the search field holds one textbox and no buttons. Both are true of a
box whose textbox is a sliver.

## Fix Applied

**Per-site rather than in the shared component, and that is the finding's second half.** The
padding is a property of the box each site draws, and the four boxes disagree: 16.5px against
11px/13.2px, one of them swapping for a single gutter and animating on the filter bar's own
150ms, and one of them shared with two decorations. There is no figure to centralise — the
shared component was already correct, and what it was missing was the RULE, which now sits in
its docblock.

- `filter-bar.tsx` — wrapper keeps border and fill only; the `Input` takes `py-[0.9375rem]`,
  the stateful `px-[0.9375rem]` / `pr-0 pl-gutter`, and the `transition-[padding] duration-150`
  that used to animate the wrapper. Its `gap-3` was deleted: the wrapper has one child, so the
  gap had nothing to space and the class read as a sibling that is not there.
- `composer.tsx` — `px-gutter` moved off the `<section>` and onto each of its two children, so
  the field's box reaches the bleed while its padding still insets the prompt to the content
  edge. Horizontal only: `FIELD_HEIGHT_CAP` is a border-box `max-h`, so vertical padding here
  would come out of the six lines it exists to allow.
- `add-skill-dialog.tsx` — the one box that cannot give its horizontal inset away, because the
  ⌕ glyph and the caret bar are inside the border and the `px-3` is what places them. The
  field takes the vertical inset and the wrapper becomes a `<label>`, so the decorations' own
  area reaches the field.
- `marketplace-dialog.tsx` — `Field`'s box keeps the border alone; both `Input`s take a shared
  `FIELD_INSET` constant.

**Every outer box and every text origin is unchanged.** Measured before and after: search
`838.28 × 57 @ 233.19,688.89` with text at `250.69,706.39` both times; add-skill and
marketplace `570 × 43 @ 515,180.38`; composer section `1102.81 × 106.48` with the prompt at
`233.19,910.02`. Nothing moved except which element owns the pixels.

`packages/ui/src/components/input.stories.tsx` drew the broken arrangement in its own
decorator (`border … px-3 py-2` on the wrapper), which is where a reader learns what to wrap
this component in and what Chromatic holds the baseline for. The inset moved to the story
args, and `FillsTheBoxItSitsIn` measures the field's rect against the wrapper's `clientWidth`
/ `clientHeight` — established as a live gate by putting `px-3 py-2` back on the decorator,
which reddens it at `expected 323.625 to be close to 350`.

### One spec moved

`composer.spec.ts` › `insets its content to the edge the skill grid sits on` went red at
`Expected: 233.1875 / Received: 167.1875 / Received difference: 66`. It was pinning the
padding INCIDENTALLY: its subject is where the prompt sits, and a box edge said that only for
as long as the field had no padding of its own. It now reads the field's content edge —
`field.x + paddingLeft` — and makes the same claim. Nothing else in the suite moved: 514
passed, 0 failed, including the a11y project's audits of both dialogs.

## Proposed Standard

**`apps/editor/e2e/README.md`**, appended to the existing "A floating control needs a geometry
assertion, not a visibility one" paragraph — which already carries the dispatch-versus-hit-test
sentence this rests on, and stops one element short:

> **A hit area is a press, not a box.** The same dispatch-at-the-element rule that hides one
> element covering another also hides a field that does not fill the box drawn around it: every
> `.click()`, `.fill()` and `toBeFocused()` in this suite targets the field's own box, so a
> field that is a sliver in the middle of its border is green everywhere. Where a border is
> drawn by a wrapper and the control is inside it, press each corner with `page.mouse.click(x,
y)` at a `boundingBox()`-derived point and read `document.activeElement` back — and assert
> `selectionStart` as well, because a `<label>` wrapper passes the focus half while leaving the
> caret at the end of the value. `specs/field-hit-area.spec.ts` is the shape.

**`packages/ui/CLAUDE.md`**, as a bullet under "House conventions":

> **A wrapper draws the border; the field takes the inset.** A wrapper that keeps the padding
> as well leaves a ring inside the border that belongs to neither and takes no press. The
> figures stay at the call site — they are the box's, not the component's — so what the shared
> component owns is `p-0` as a DEFAULT and a `className` that overrides it. Where the box holds
> something beside the field, the field takes what it can and the wrapper is a `<label>`.

Cross-checked against both CLAUDE.md files and against `packages/ui/CLAUDE.md`'s "A class in
the DOM is not a class in effect", which the new story is an instance of rather than a conflict
with. It also touches "Play functions stay simple": `FillsTheBoxItSitsIn` reaches past the
accessibility tree to a measurement, which that section discourages and the "measure it once in
a real browser" section of the same file licenses for exactly this kind of load-bearing layout
claim — `FocusDrawsTheRing` in the same file is the precedent. The two sentences should be
reconciled; this finding does not do it.

Recorded because it was found on the way and is not part of the proposal: the corner press this
row needed is not expressible in a Storybook play function. `userEvent` dispatches on an
element rather than hit-testing a point, so what a pointer does to a padded wrapper is a
browser behaviour only a real pointer produces. A component-level suite can measure the box; it
cannot press it.
