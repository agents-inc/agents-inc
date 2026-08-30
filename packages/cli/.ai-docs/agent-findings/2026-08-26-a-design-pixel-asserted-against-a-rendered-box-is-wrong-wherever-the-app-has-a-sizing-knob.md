---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/e2e/specs/output-preview.spec.ts
  - packages/ui/src/styles/globals.css
  - packages/ui/src/components/dialog.tsx
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-26
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  The SPEC half landed, in the form this body proposed as the better one. Both literal comparisons
  in `apps/editor/e2e/specs/output-preview.spec.ts` now read
  `TREE_PANE_RENDERED_PX = (TREE_PANE_DESIGN_PX * ROOT_FONT_SCALE_PERCENT) / 100`, so 250 and 110
  are both named and 275 is derived rather than measured off a failing run — integer arithmetic
  rather than the `Math.round(250 * 1.1)` sketched below, because 250 times 1.1 is
  275.00000000000006 in IEEE doubles and would not satisfy `toBe`. The product keeps
  `w-[15.625rem]`, as this finding asked. The full e2e suite is green at 380 passed, up from 379
  passed and 1 failed. The ENFORCEMENT half is not landed: the proposed rule for
  `.ai-docs/standards/e2e/assertions.md` is still unwritten, so nothing but this file's own prose
  would stop the next absolute-geometry assertion being written against a design pixel — and the
  body already declines a checker, for a reason that has not changed.
---

## What Was Wrong

`packages/ui/src/styles/globals.css` sets `font-size: 110%` on the root and calls it **THE SIZING
KNOB**, in a docblock that is explicit about what it governs:

> Every dimension in the app is expressed in `rem`, so this one percentage scales the whole design
> uniformly — type, padding, gaps, **column widths**, the 60px gutter and the sticky offsets all
> move together. 100% is the design's native size; 110% is the current setting.
>
> Two things deliberately do NOT scale, and must stay in px: borders and the 1px lattice hairlines
> … and viewport units.

So a design measured at 250px is written `w-[15.625rem]` — design px ÷ 16 — and RENDERS at 275
CSS px. That conversion is the shipped convention: `DialogContent`'s `wide` is `w-[38.75rem]` for a
620px design, `SkillContentsDialog` passes `w-[46rem]` for 736px, `DialogPane side="right"` is
`w-[12.25rem]` for 196px. Not one of them renders at the number it was named for.

`apps/editor/e2e/specs/output-preview.spec.ts` asserts an absolute design pixel against a rendered
box:

```ts
const TREE_PANE_WIDTH = 250
...
expect(tree?.width).toBe(TREE_PANE_WIDTH)
```

`boundingBox()` returns CSS pixels, so the correct rendered value is 275 and the spec fails. There
are only two ways to satisfy it, and both are wrong in a way nothing would report: pin the column
in `px` and it stops scaling with everything inside it — its own row height, font, padding and
indent all still do, so the designed proportion is lost and the docblock's "column widths" clause
is silently untrue; or leave the test red.

**The convention is real but written nowhere a test author reads.** Every other geometry assertion
in the editor's e2e suite is RELATIVE and therefore immune — `inkStartOf` in `roster.spec.ts`
compares two boxes to each other, `save-stack.spec.ts` compares Save against Share,
`marketplace.spec.ts` compares the button against the rail. This is a census of `boundingBox` in
`apps/editor/e2e/specs/`, run as `grep -rn "boundingBox" e2e/specs/*.ts`: fifteen hits across six
files, and the two in `output-preview.spec.ts` are the only ones that compare a box to a literal.

Two things nearby show how the assumption travels. The spec's own comment says "the number is
asserted on the rendered box", so the author knew which side they were measuring and not that the
two sides differ. And `phase-b-spec.md` §B3.4 makes the same conversion in the other direction —
"760px. `DialogContent`'s `wide` is 620px, so pass `className="w-[47.5rem]"`" — which is the ÷16
convention applied correctly and described as if the result were 760 rendered pixels.

## Fix Applied

**None — discovery only, and deliberately.** The product keeps `w-[15.625rem]`, which is the
convention and preserves the designed proportion (250/760 of the design's dialog is 32.9%, and
275/836 of the rendered one is the same 32.9%; a 250px column inside the rendered 836px sheet would
be 29.9%). The spec is another lane's file and the rule here is that the verifier is never the
fixer, so the assertion is reported rather than edited and the product is not bent to satisfy it.

The one-line correction is `TREE_PANE_WIDTH = 275`, with a comment naming the knob — or, better,
`Math.round(250 * 1.1)` written out so the two halves of the conversion are both visible.

## Proposed Standard

**For `.ai-docs/standards/e2e/assertions.md`** — a rule about absolute geometry, phrased as the
question rather than as the number, because the knob's value is allowed to move:

> **Never assert a design pixel against a rendered box.** The app's root font size is a deliberate
> scaling knob (`packages/ui/src/styles/globals.css`), so every `rem` dimension renders larger than
> the design number it was converted from, and `boundingBox()` reports the rendered value. Prefer a
> RELATIVE assertion — one box against another, which is what every other geometry spec in this
> suite does and what makes them survive a change to the knob. Where an absolute number is genuinely
> the subject, derive it from the design value and the knob in the spec so both are visible, and say
> which one the design file gave you.

**It does not conflict with `packages/cli/CLAUDE.md`.** The nearest neighbour is its rule against
binding a rendering assertion to the constant the product renders, which is about COPY and pulls
the other way — it says keep the literal. This one says a literal is fine and a design literal is
not the rendered one, so the two live together: mirror the product's strings, convert the product's
numbers.

**A checker is not proposed and the reason is that it would have to be a renderer.** Deciding
whether a given literal is a design pixel or a rendered one needs the class the element carries and
the knob in force, which is a browser. The suite's own convention — relative assertions — is the
enforcement, and it is enforced by being what every other spec already does.

**The count above is a census** of `boundingBox` in `apps/editor/e2e/specs/`, not a sample; the
command is in the paragraph that reports it.
