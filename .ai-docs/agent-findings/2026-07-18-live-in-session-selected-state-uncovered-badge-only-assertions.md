---
type: standard-gap
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/wizard/build-step-logic.ts
  - e2e/pages/steps/build-step.ts
  - e2e/lifecycle/dual-scope-spacebar-collapse-live-selection.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: "Inverted relative to the enum's documented direction — the CODE/coverage side landed and the DOCS side did not. Landed: `BuildStep.getExclusiveCategorySelectedCount()` exists in `e2e/pages/steps/build-step.ts`, and the red spec went green — it is now `e2e/lifecycle/dual-scope-collapse-live-selection.e2e.test.ts` (renamed when D-260 made spacebar inert and `s` the sole dual-scope toggle), asserting the live Framework counter stays `(1 of 1)` after the collapse, with no `it.fails`. `dual-scope-s-round-trip-space-inert.e2e.test.ts` reads the same counter, so the reader has two consumers. Pending: the proposed standard. Verified 2026-07-30 that `standards/e2e/anti-patterns.md` has no rule about asserting live in-session render state when a keypress mutates both `domainSelections` and `skillConfigs`; its Weak Assertions and Assertion Quality sections do not cover the badge-vs-selection divergence."
---

## What Was Wrong

The dual-scope collapse suites (`dual-scope-spacebar-reselect-restore.e2e.test.ts`,
`tombstone-cleanup-PtoG-restoration.e2e.test.ts`) verify a spacebar collapse two
ways only: the SAVED `config.ts` after the wizard completes, and the scope BADGES
(`P`/`G`) on a freshly RE-OPENED wizard. Neither inspects the grid's SELECTED
state in the same session, immediately after the keypress, before saving.

That left a real bug uncovered: when the project half of a persisted `[P][G]`
skill is dropped with spacebar, `toggleTechnology` collapses `skillConfigs` to a
single active inherited-global entry (correct — the skill is still active) but
separately, unconditionally removes the id from `domainSelections`. The grid
derives `selected` from `domainSelections`, so the row renders as UNSELECTED
in-session even though it is still active via the global install. The scope badge
(sourced from `skillConfigs.scope`) keeps rendering `G`, so a badge-only
assertion cannot detect the divergence — the badge and the selected state
disagree.

Two structural reasons the gap persisted:

1. The E2E harness runs with `NO_COLOR=1` / `FORCE_COLOR=0`, so the teal/dim
   COLOR that visually distinguishes a selected row is stripped from captured
   output. The only text-observable signal of the grid's selected state is the
   exclusive category's `(selected of total)` counter, and no page object read it.
2. Every dual-scope assertion asserted post-save or on badges, never on the live
   pre-save selection counter.

## Fix Applied

Discovery + red test only (no source touched — the store fix belongs to
cli-developer):

- Added `BuildStep.getExclusiveCategorySelectedCount(categoryDisplayName)` to
  `e2e/pages/steps/build-step.ts` — a structural reader for the `(N of M)`
  counter that an exclusive category header renders, mirroring the existing
  `getScopeBadgesForSkill` page-object convention.
- Added `e2e/lifecycle/dual-scope-spacebar-collapse-live-selection.e2e.test.ts`,
  which drives the real wizard, collapses a persisted `[P][G]` react with
  spacebar, and asserts the LIVE `Framework` counter stays `(1 of 1)`. It is RED
  on current code (reads `(0 of 1)`); cli-developer flips it green by keeping a
  still-active-via-global skill in `domainSelections`.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` (assertion-coverage section):

> When a keypress mutates BOTH `domainSelections` (grid selection intent) and
> `skillConfigs` (saved-config shape), assert the LIVE in-session render state
> before saving — not only the saved config and the re-opened badges. The scope
> badge and the selected state come from different stores and can diverge; a
> badge-only or post-save-only assertion will pass while the live grid is wrong.
> Under `NO_COLOR`, the exclusive category `(selected of total)` counter is the
> text-observable proxy for the selected state — use
> `BuildStep.getExclusiveCategorySelectedCount()`.
