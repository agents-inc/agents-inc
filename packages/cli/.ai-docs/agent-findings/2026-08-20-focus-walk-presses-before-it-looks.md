---
type: anti-pattern
severity: medium
affected_files:
  - e2e/pages/steps/build-step.ts
  - e2e/pages/base-step.ts
  - e2e/helpers/terminal-session.ts
  - e2e/pages/constants.ts
  - e2e/interactive/build-step-focus-walk-cost.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-20
reporting_agent: orchestrator
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  `focusSkill` reads the focused category before it presses anything, and each Tab is confirmed
  against the screen before the walk moves on, so a lap is always sufficient and the walk ends on
  having observed a category twice rather than on a press budget. Pinned by
  `e2e/interactive/build-step-focus-walk-cost.e2e.test.ts`, which asserts what the helper SPENDS —
  zero Tab presses when the target category is already focused, and one lap when the label is
  nowhere.
---

## What Was Wrong

`BuildStep.focusSkill` drove the build grid by pressing Tab and then reading the screen, inside a
fixed budget of 50 presses. Two defects fell out of that order, and only the second one ever showed
up as a red build.

**It pressed before it looked.** The unconditional first press is deliberate — arriving in a
category via Tab is what resets the grid column to 0, so the RIGHT presses that follow have a known
base. The cost is that the helper walks off a target that is already focused. Against the default
catalogue the web domain paints 33 categories and `web-framework` is category 1 of 33, so a spec
asking for a skill in the first category — the one focused on entry — paid a full 33-press lap to
return to where it started.

**A press was assumed to have landed.** After each Tab the walk waited briefly for a fresh frame
and then read whatever was on screen, tolerating a miss. Under runner contention the repaint
arrives after the read, so the walk looks at the category it just left while standing on the next
one — and passes its own target unseen. The second lap it then needs does not fit in what remains
of the budget, because the first lap consumed 33 of 50.

Neither defect is visible to any other assertion. Every spec that calls `focusSkill` asserts where
focus ENDED, and a walk that arrives by touring the whole grid satisfies all of them.

Observed as CI run 32338714325: `edit-wizard-navigation.e2e.test.ts > should toggle focused skill
scope with S key` failed both of its attempts. The arithmetic in the failure frame is exact — 50
presses from category 1 lands on category 18, and category 18 is `Error Handling`, which is the
highlighted header in the dump, with the visible window being categories 14–18. A re-run of the
same commit (32347127769) passed, with that test still losing its first attempt and winning on
retry, so roughly three attempts in four were failing on the runner. The suite's `retry: 1` is what
had been absorbing it.

Not reproducible locally across every condition tried: the test solo five times, `CI=true`, the
whole file, Node 22 to match the runner's pin, the full 229-file suite pinned to 4 cores (the
runner's core count, so the same `maxWorkers`), the same under eight CPU hogs, and `e2e/interactive`
pinned to 2 cores. All green. Only the runner is slow enough.

## Fix Applied

`focusSkill` now reads the focused category first and walks only when the target is elsewhere. When
it does walk, `advanceCategoryFocus` re-presses until the screen SHOWS a different category focused,
so no category is passed while its repaint is in flight. The walk ends when it observes a category
it has already seen — a real lap, every category looked at exactly once — and raises
`CategoryWalkError` carrying the categories it walked. `MAX_FOCUS_ATTEMPTS` is deleted: the press
budget was never the mechanism, only the thing that ran out.

The column base is now stated rather than assumed — 0 when the walk arrived by Tab, the tracked
`gridCol` when it never moved — and both paths step the column through one `pressRightToColumn`.

`TerminalSession` gained a keystroke ledger and `BaseStep` exposes it, because the cost of a
navigation helper had no observable at all and that is exactly what let this sit.

## Proposed Standard

For `.ai-docs/standards/e2e/page-objects.md`:

**A navigation helper observes before it acts, and confirms each move before the next one.** A
helper that presses and then reads cannot tell "the key did not land" from "the repaint has not
arrived", and it silently walks past what it was sent to find. Wait for the screen to show the
state changed, then decide.

**A press budget is not a search bound.** `for (attempt = 0; attempt < N; attempt++)` over a UI walk
reports the number it gave up at, which says nothing about what it looked at. Terminate on the
structure of the thing being walked — a lap, a repeat, an exhausted list — and raise an error
naming what was observed. A magic N also silently expires: this one was raised from 30 to 50 when
the taxonomy grew to 33 categories, and 50 was already too thin for the two laps a single missed
observation requires.

**What a helper SPENDS is a behaviour worth pinning.** Assertions about where focus ended cannot see
a helper that gets there the long way round, so the regression is invisible until it runs on a
slower machine. This conflicts with nothing in CLAUDE.md; it extends "NEVER add a key-press method
to an E2E step page object without calling `waitForWizardFooter()` first" from _a frame is painted_
to _the frame says the press took effect_.
