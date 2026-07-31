---
type: missing-standard
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.test.tsx
  - src/cli/components/wizard/source-grid.tsx
  - vitest.setup.ts
standards_docs:
  - .ai-docs/reference/testing/infrastructure.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-29
reporting_agent: cli-tester
category: testing
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: 'Fix Applied and the proposed standard both landed. Verified 2026-07-30: `src/cli/components/wizard/source-grid.test.tsx` declares `TRUECOLOR_CHALK_LEVEL = 3` and saves/restores `chalk.level` around the colour block. `reference/testing/infrastructure.md` gained the "Asserting Colour in Ink Component Tests" subsection carrying every point the finding proposed — that Ink tests see no ANSI by default because chalk auto-disables on vitest''s non-TTY stdout, that a colour assertion failing for that reason is a harness gap and must never be downgraded to a text-only assertion, the save/restore-per-block pattern with the reason not to set it globally in `vitest.setup.ts`, the `chalk.hex`/`chalk.bgHex`-over-`CLI_COLORS` construction with Ink''s foreground-inner/background-outer ordering, and that colour is testable only at the component layer because the E2E harness runs `NO_COLOR`. The doc names `source-grid.test.tsx` as the repo''s only colour-asserting file, so the next author is pointed at the worked example.'
---

## What Was Wrong

Colour is a real part of the wizard's contract — the Sources tab and the confirm
step are specified to render the same diff palette (`rowLabelColor` in
`source-grid.tsx` vs `DIFF_COLOR` in `skill-agent-summary.tsx`) — but **no test
in the repo asserts a colour**, and until now there was no documented way to do
it.

The reason is not obvious: Ink colourises through `chalk`
(`node_modules/ink/build/colorize.js` calls `chalk.hex` / `chalk.bgHex`), and
chalk auto-disables itself on vitest's non-TTY stdout. Verified empirically with
a throwaway probe: rendering `<Text color="#90EE90" backgroundColor="#383838">`
under `ink-testing-library` yields `lastFrame() === "hello"` — every escape
sequence stripped. A naive colour assertion is therefore not merely hard, it is
_unobservable_, and an agent that tries one and sees it fail is one step away
from silently weakening it to a text-only assertion (which is exactly how a
colour regression stays invisible).

E2E cannot cover the gap either: the terminal harness runs with `NO_COLOR`, so
every existing spec explicitly documents "the marker, not the colour, is what
this asserts". Colour is only assertable at the component-test layer.

## Fix Applied

Added a colour assertion to `source-grid.test.tsx` (the "added rows" block) with
the enabling pattern:

- A `TRUECOLOR_CHALK_LEVEL = 3` constant; `beforeEach` saves `chalk.level` and
  sets it to truecolor, `afterEach` restores the saved value. Chalk 5 resolves
  the level per call, so mutating it at runtime is enough — no import-time
  `FORCE_COLOR` plumbing, and no change to `vitest.setup.ts` (the mutation stays
  scoped to the block that needs it).
- The expected value is built with the same primitives Ink itself uses —
  `chalk.bgHex(CLI_COLORS.LABEL_BG)(chalk.hex(CLI_COLORS.SUCCESS)(label))` —
  rather than a hand-rolled `[38;2;R;G;Bm` string. This keeps the
  assertion a plain `toContain` on the frame (per CLAUDE.md: never
  split/loop/regex-scan `lastFrame()`) and means it survives a palette change in
  `consts.ts` without editing.
- Both the positive (label must carry `CLI_COLORS.SUCCESS`) and the negative
  (label must not fall back to `CLI_COLORS.WHITE`) shape are asserted, so a fix
  that drops the focus background instead of fixing the colour cannot pass.

## Proposed Standard

For `.ai-docs/reference/testing/infrastructure.md` (new subsection under the
component-test harness, "Asserting colour in Ink component tests"):

- Ink component tests see **no ANSI at all** by default — chalk disables itself
  on vitest's non-TTY stdout. A colour assertion that "fails" for this reason is
  a harness gap, not a product bug; never downgrade it to a text-only
  assertion.
- To assert colour, save and restore `chalk.level` around the test
  (`beforeEach`/`afterEach`, truecolor = 3). Do not set it globally in
  `vitest.setup.ts`: every existing frame assertion would then have to cope with
  interleaved escape sequences.
- Build the expected string with `chalk.hex(...)` / `chalk.bgHex(...)` over the
  `CLI_COLORS.*` constant, never with a literal escape sequence. Ink applies the
  foreground first and the background outermost, so a `<Text color bg>` renders
  as `bgHex(hex(text))`.
- Colour is only testable at this layer — the E2E harness runs `NO_COLOR`. Any
  contract phrased as "these two surfaces use the same colour" needs a component
  test; an E2E marker assertion alone does not cover it.
