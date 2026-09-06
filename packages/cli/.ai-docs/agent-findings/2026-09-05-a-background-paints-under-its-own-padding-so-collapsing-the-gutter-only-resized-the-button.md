---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/filter-bar.tsx
  - apps/editor/e2e/specs/sticky-bar.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-09-05
reporting_agent: web-developer
category: testing
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  EDITOR-78 put the right gutter back on the band it never needed to leave (`pr-gutter`,
  unconditional) and took `pr-gutter pl-5` off the add-skill block, so the block keeps the
  `px-[1.125rem]` its own variant gives it and its box is byte-identical pinned and at rest.
  `sticky-bar.spec.ts` gained two geometry tests beside the paint one that could not see it —
  "keeps its width once the bar sticks" and "keeps the band running on past it once stuck".
---

## What Was Wrong

The editor's filter bar goes dark and full-bleed when it pins. Its band carried

```
className={`pb-3 transition-[padding,background-color] duration-150 ${
  stuck ? "bg-ink px-0" : "px-gutter"
}`}
```

above a comment saying why:

> 84a: once stuck, only the colour bleeds. The gutters move from this band onto the field and
> the button, **which is what lets #242320 reach the viewport edge** while search still starts
> on the content edge and add-skill still ends on it.

**The emphasised half is false. A background paints its own padding box, so `px-gutter` never
stopped `bg-ink` reaching the band's edges — nothing had to move for the fill to bleed.**
Measured after the fix, with `pr-gutter` back on the band:
`document.elementFromPoint(band.right - 2, band.mid)` answers `filter-band`, and the capture
shows dark to the bleed edge with the padding in place.

The left half of that collapse was still needed, for a different reason nobody wrote down:
the search field's **hit area** has to reach the bleed edge, which is a box question rather
than a paint one, and EDITOR-76 had just re-homed the left gutter inside the `Input` to get
it. The right half was copied from that move and had no such reason — and re-homing a
container's padding inside a child does not relocate space, it **resizes the child**:

```
className={`transition-[padding] duration-150 ${stuck ? "pr-gutter pl-5" : ""}`}
```

Chromium at 1600×1000, root at `font-size: 110%` so `--spacing-gutter: 3.75rem` computes to
66px and the variant's `px-[1.125rem]` to 19.8px:

| state          | block box            | its padding L/R | its label (Range over contents) | band right − block right |
| -------------- | -------------------- | --------------- | ------------------------------- | -----------------------: |
| resting        | 121.53 × 57 @ 1082.47 | 19.8 / 19.8     | 81.94                           |                       66 |
| stuck (before) | 169.94 × 57 @ 1100.06 | 22 / 66         | 81.94                           |                        0 |
| stuck (after)  | 121.53 × 57 @ 1082.47 | 19.8 / 19.8     | 81.94                           |                       66 |

The label never moved — `pr-gutter` inset it to the same content edge the resting block ends
on. What moved was the block's right edge, out to the band's own 1270 and 48.41px past where
it belongs, so the hairline the design gives this control was drawn around a strip with the
label adrift in it. The owner, against the design: _"the actual add skill button isn't
supposed to take up all of the available space. It's supposed to get smaller."_

**The shape, stated generally: collapsing a container's horizontal padding is never what makes
its fill bleed, and moving that padding into a child is a decision about the CHILD'S BOX.**
Make it when the child's box should grow (a field whose whole border must take the caret);
refuse it when the child is a control whose box is its shape.

### The suite had a test for this control and it could not see it

`sticky-bar.spec.ts` already carried `add-skill trades its fill for a hairline once stuck`,
written for exactly this element and carrying its own note that the treatment had shipped
untested because "the suite asserted only that the button was still VISIBLE while stuck,
which is true of every possible treatment". It asserts `background-color` and `box-shadow`,
in both states, correctly — **and every one of those assertions was green while the box the
hairline was drawn around was 40% wider than its label.** A paint channel says what a control
is painted with and nothing about what it is painted on.

514 e2e tests passed throughout, including the a11y project's audit of `the configure screen
with the filter bar pinned`. The suite's paint assertions and its geometry assertions live in
different files:

```
grep -rn "toHaveCSS" e2e/specs        # 26 hits, in 5 files
grep -rln "toHaveCSS" e2e/specs | xargs grep -ln "boundingBox"
```

Before this row the second command returned `roster.spec.ts` alone — one file of the five
asks both questions, and it was not the one owning the pinned bar.

## Fix Applied

`filter-bar.tsx`, two edits and no change in `packages/ui`:

- the band takes `pr-gutter` unconditionally and swaps only its left side
  (`stuck ? "bg-ink pl-0" : "pl-gutter"`), so the right gutter is air BESIDE the block and
  the fill bleeds under it exactly as it did before;
- the block's `className` is gone entirely. It keeps the `px-[1.125rem]` its `block` variant
  gives it in both states, and its box is now byte-identical across the pin.

**The border was already right and was not touched.** `button.tsx`'s `block` + `onDark`
compound variant has traded `bg-ink` for
`shadow-[inset_0_0_0_1px_var(--color-band-edge)]` since the web monorepo was absorbed, and
`sticky-bar.spec.ts` pins both channels. The block never dissolved into the band; it was
outlined the whole time, around the wrong box.

`transition-[padding] duration-150` came off the block with the rest of its class string, and
that is not a lost animation: the block's geometry no longer changes, and the band's own
150ms still owns the one thing that does (its left gutter, against the `Input`'s left
padding). Sampled every 20ms across the pin, the block reads 121.53 wide with its right edge
at 1204 at every sample — no mid-flight jitter from the band's padding animating while the
block's did not.

### The two tests, red first

```
keeps its width once the bar sticks
  Expected: 121.53125   Received: 169.9375    Received difference: 48.40625

keeps the band running on past it once stuck
  Expected: 66          Received: 0           Received difference: 66
```

Both compare against their own RESTING read rather than against a coordinate, so neither
names 66 or converts a rem by hand — the block ends on the content edge in both states, so
the air beside it is the page's gutter whatever that gutter becomes. The second asserts the
resting clearance is greater than zero first, because a band and a block sharing a right edge
in BOTH states would satisfy a stuck-only assertion for the wrong reason.

**No existing spec moved.** 516 passed, 0 failed (514 before these two). `field-hit-area.spec.ts`'s
`takes the caret from every corner while the bar is stuck` still passes: the field's box still
reaches the bleed edge on the left, which is the half of EDITOR-76's move that had a reason.
The five `leaves the marketplace button clear` specs in `composer.spec.ts` are untouched —
they measure the composer dock against the nav rail's button and never read this bar.
`visual.spec.ts`'s `configure-bar-pinned` capture will legitimately diff on Argos.

## Proposed Standard

**`apps/editor/e2e/README.md`**, as a new paragraph after "A floating control needs a geometry
assertion, not a visibility one" — the section that already reasons about what an assertion
CANNOT see, and whose newest neighbour (a hit area is a press, not a box) is the same shape
one element further in:

> **A treatment assertion is not an extent assertion.** `toHaveCSS("background-color", …)` and
> `toHaveCSS("box-shadow", …)` say what a control is painted with and nothing about the box the
> paint lands on, so a border drawn around a strip twice the control's width satisfies both. The
> two questions live in different files here — `grep -rln "toHaveCSS" specs | xargs grep -ln
> "boundingBox"` — and a control whose SHAPE is part of the design needs one of each: pin the
> paint, and pin the box against a live read of something beside it. `sticky-bar.spec.ts`'s
> add-skill trio is the shape.

**A second rule with no obvious home, offered as a discovery rather than a proposal.** It is a
CSS fact rather than a repo convention, and the only place it could go is a component comment:

> A background paints under its own padding. Collapsing a container's padding is never what
> makes its fill reach an edge — the fill was already there. Padding moved off a container and
> onto a child is a change to the CHILD'S BOX, so make it only when that box should grow.

Cross-checked against both `CLAUDE.md` files and against `apps/editor/e2e/README.md`'s "A
negative is only as good as the channel that would carry it", which the paired resting/stuck
form of both new tests is an instance of rather than a conflict with. It does not conflict with
the sibling finding
`2026-09-05-a-wrapper-that-keeps-the-padding-leaves-the-field-a-sliver-and-every-locator-still-passes`
— that one says a wrapper drawing a border hands its inset to the field inside it, and this one
says why the same move is wrong for a control: the field's box is meant to fill the border, and
the block's box IS the border.
