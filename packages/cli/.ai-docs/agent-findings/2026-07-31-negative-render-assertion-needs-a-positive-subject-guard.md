---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/wizard-overflow-affordance.e2e.test.ts
  - e2e/interactive/confirm-step-info-panel-parity.e2e.test.ts
  - e2e/pages/steps/confirm-step.ts
  - src/cli/components/wizard/summary-panel.tsx
  - src/cli/components/hooks/use-panel-scroll.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-07-31
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
supersedes: 2026-07-31-confirm-step-viewport-is-zero-rows-at-short-so-overflow-spec-is-vacuous.md
---

## What Was Wrong

Two assertions about the confirm step's clipped summary passed for a reason other than the one they
claimed, both because of where in the scroll range the frame was captured.

**The geometry, re-measured at the raised 20-row gate.** `TERMINAL_SIZE.SHORT` is now 20 rows (it was
16 when the superseded finding was written), and the confirm viewport measures **five** rows, not
zero. The panel's content is 17 rows, so the scroll range is 12. What the two specs missed is that
those five rows at offset 0 are consumed **entirely by the marketplace/stack header** — `Marketplace`,
`Stack`, a padding row, the divider, a margin row. The first summary row does not appear until
offset 6. Scrolled to the end of the range the panel paints real rows (`+ web-developer` … `+
web-tester`).

1. **`wizard-overflow-affordance.e2e.test.ts` → "keeps the confirm summary inside its box border".**
   `expect(screen).not.toContain("─+ ")` is a good bleed signature — a border run and an added row
   are adjacent on one line only when the summary paints over the border it should be clipped
   inside. But the frame was captured at offset 0, where no `+ ` row is painted at all, so the
   string could not appear whether or not the bleed existed.

2. **`confirm-step-info-panel-parity.e2e.test.ts` → the scroll spec.** "Arrowing down reveals content
   that was hidden" was asserted only through the affordance counters (`more below` → `more above`).
   The counters are the panel's own bookkeeping; they move whether or not the content does.

The second one is the sharper lesson: a counter and the thing it counts are different subjects, and
asserting the counter is not evidence about the content.

## Fix Applied

Both assertions now run at a geometry where their subject renders, and both were mutation-verified
against the real binary — the point being that a "fixed" vacuous assertion nobody has watched go red
is indistinguishable from the vacuum it replaced.

- New `ConfirmStep.scrollSummaryToBottom()` (`e2e/pages/steps/confirm-step.ts`) runs the viewport to
  the end of its range **closed-loop** — pressing down while the frame still reports clipped content
  below, and throwing rather than returning short. Not a fixed press count: the summary's height
  depends on how many skills and agents the run selected.
- The overflow spec scrolls to the bottom, then asserts a **positive guard** (`+ web-developer` is on
  screen) immediately before the `not.toContain("─+ ")`, so the negative is known to be about a
  painted subject.
- The parity spec's `KNOWN GAP` comment is deleted and replaced by the direct assertion on the
  `atBottom` frame that the comment described.

Mutation evidence, each applied to `src/` alone, built, run, then reverted:

| Assertion                                    | Mutation                                                              | Result                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `not.toContain("─+ ")`                       | Drop `overflow="hidden"` from the viewport box in `summary-panel.tsx` | RED. Frame shows `┌──+ api-framework-hono──────…──+ web-architecture─────┐` — rows painted straight over the panel's top border     |
| `toContain("+ web-developer")` on `atBottom` | Pin `contentMarginTop` to `0` in `use-panel-scroll.ts`                | RED — **and the two counter assertions above it still passed.** The frame reads `12 more above` while showing the unscrolled header |

That second row is the whole argument for the new assertion: the mutation is invisible to every
assertion the spec had before.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the "Weak Assertions" group (this restates the
superseded finding's proposal, now with mutation evidence behind it, and adds the counter clause):

> **Never assert a rendering invariant at a geometry or scroll offset where the subject does not
> render.** A `not.toContain("<bug shape>")` on a clipped viewport passes for free when the frame
> under test paints none of the rows the bug shape is made of. Before writing a negative rendering
> assertion, pair it with a positive assertion that the subject IS on screen in the very frame you
> captured — the same proof-of-execution rule the bible already applies to conditional code paths.
> A viewport that clears the minimum-size gate is not evidence its content is visible: at
> `TERMINAL_SIZE.SHORT` the confirm panel's five rows are filled by its header, and the first
> summary row only appears six presses into the scroll range.
>
> **A counter is not its content.** Asserting that a scroll affordance's "N more above / below"
> numbers moved does not establish that anything scrolled. Assert a row that the movement revealed.

Cross-reference from `.ai-docs/standards/e2e/assertions.md` → "Assert the Surface That Retains the
Value", which today distinguishes WHICH surface holds a value but not whether the value was ever
painted onto any of them.

Also worth recording in `.ai-docs/reference/testing/e2e-infrastructure.md` beside the `TERMINAL_SIZE`
table: at `SHORT`, the confirm step's summary viewport is five rows and the panel header fills all
five, so a spec that needs a summary row on screen must scroll first. One sentence there is what
would have stopped both specs being written as they were.
