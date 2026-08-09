---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/e2e/pages/steps/build-step.ts
  - packages/cli/e2e/interactive/edit-wizard-launch.e2e.test.ts
  - packages/matrix/src/contract/selection-scenarios.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Adding twelve categories and retiring one — no behaviour change, no new component, no rule edit —
broke three tests in three different ways, all the same underlying shape: **a test that reads the
real catalogue had a hard limit tuned to the catalogue's size at the time it was written, and
nothing tied the limit back to the thing it was measuring.**

1. **A bound counted in keystrokes.** `MAX_FOCUS_ATTEMPTS = 30` bounds the Tab-walk in
   `BuildStep.focusSkill`. Its comment said "30 covers any realistic per-domain category count
   (real-marketplace domains included)". Web went from 26 categories to 33, so 30 stopped covering
   one full wrap of the cycle, and the walk began failing on a category it had _not reached yet_
   with the message "was not focused after 30 Tab presses" — which reads exactly like the skill
   being absent. Nothing connects the constant to the count it is derived from; the comment is the
   only record that a count is what it means.

2. **A viewport assumed to fit.** Two `edit-wizard-launch` specs launched at `TERMINAL_SIZE.TALL`
   (60 rows) and asserted on the `Testing` section from the first frame. Three new categories now
   sit above `web-testing`, so the section moved below the fold and the assertions failed with
   `expected '┌───…' to contain 'Testing'`. The specs were not asserting anything about scrolling —
   they simply happened to fit.

3. **A golden whose exemplar the taxonomy dissolved.** The scenario
   `a-conflict-inside-a-shared-category-disables` used shadcn/ui against MUI, Chakra, Mantine and
   Ant Design, and its `why` explained: "UI components is not a pick-one category, so a conflict
   there is a real dead end rather than a swap." Once the kits moved into the exclusive
   `web-ui-kit`, that sentence was false and the expectation inverted. This is the second instance
   of the class recorded in
   `2026-08-07-a-selection-golden-exemplar-was-carried-by-a-rule-another-wave-deleted.md`, which
   proposed recording each exemplar's carrier in its `why`. That proposal was never adopted, and
   this scenario named its carrier in prose without anyone treating the prose as a dependency.

## Fix Applied

1. `MAX_FOCUS_ATTEMPTS` raised to 50, with the comment rewritten to say _which_ count drives it
   (web, 33) and to record the failure mode it had — a walk that ran out before it wrapped, not one
   that could not find the target.
2. Both specs now call `build.focusSkill("Vitest")` before asserting, which Tab-walks the grid to
   the category rather than assuming it renders. The assertion is stronger than before — it holds
   at any viewport and any catalogue size — and the comment says so.
3. The scenario was deleted rather than re-pointed: after this pass **no conflict group in the
   catalogue spans an open category**, so the shape it pinned has no exemplar left at all. The
   mechanism is still covered by `selection-semantics.test.ts`, which exercises it against a
   synthetic matrix. Its lineage is recorded in the `why` of
   `two-selections-satisfy-a-split-requirement`, the surviving scenario that names MUI, so a reader
   arriving at the kits finds out what used to be asserted about them.

## Proposed Standard

For `.ai-docs/standards/e2e/anti-patterns.md`:

- **A numeric bound in a page object that stands for a catalogue count must name the count in its
  comment and state the domain it was measured against.** "30 covers any realistic count" ages
  silently; "50, against web's 33" is a grep target for the next taxonomy edit and tells the reader
  what to re-measure.
- **An assertion about a category the wizard renders below the first screen must navigate to it.**
  Launching tall enough to fit is a coincidence, not an assertion, and the failure it produces —
  "output does not contain 'Testing'" — names the wrong cause. `focusSkill` exists for this.

And, adopting the earlier finding's unadopted proposal with one addition: **a scenario's `why` must
name the mechanism carrying each `outOfReach` entry — a `requires` rule, a conflict group, or a
category radio — and a scenario whose mechanism the catalogue no longer instantiates should be
deleted with its lineage recorded on a surviving neighbour, not re-pointed at whatever still
happens to be red.** Re-pointing is how a golden ends up asserting something nobody decided.
