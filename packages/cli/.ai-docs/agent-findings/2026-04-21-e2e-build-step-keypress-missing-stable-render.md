---
type: convention-drift
severity: medium
affected_files:
  - e2e/pages/steps/build-step.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-04-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Landed — the CLAUDE.md rule (Test Assertions section), all 7 `build-step.ts` methods, and the
  sibling sweep across `base-step.ts` and the six other step files
  (agents/confirm/domain/search-modal/sources/stack), every one of which now guards its key
  presses with the wizard-footer wait (`waitForWizardFooter`, the renamed
  `waitForStableRender`). Pending — three sync `abort()`/`escape()`/`ctrlC()` wizard methods
  that cannot be guarded without changing their signature to async, carved out and recorded in
  `2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout.md`.
---

## What Was Wrong

CLAUDE.md and `.ai-docs/standards/e2e/README.md` both codify the "page object key-press rule": every step page-object method that sends a key press MUST call `await this.waitForStableRender()` before the press, so React effects settle before the keystroke arrives and the `useInput` handler is actually mounted.

Seven methods in `BuildStep` (`e2e/pages/steps/build-step.ts`) violated this rule by issuing a session keystroke with no preceding stability wait:

| Method                     | Keystroke               | Prior wait?             |
| -------------------------- | ----------------------- | ----------------------- |
| `focusSkill`               | arrow down / right loop | none before first arrow |
| `toggleFocusedSkill`       | Space                   | none                    |
| `navigateToNextCategory`   | Tab                     | only AFTER the press    |
| `toggleLabels`             | "d"                     | none                    |
| `openSearch`               | "/"                     | none                    |
| `toggleFilterIncompatible` | "f"                     | only AFTER the press    |
| `goBack`                   | Escape                  | none                    |

`toggleScopeOnFocusedSkill` (the method named in the original investigation) already had the wait — it was the adjacent code that didn't.

Under parallel E2E suite load, any unwaited keypress can race with React's effect queue and silently no-op: the PTY write lands between commit and `useEffect`, so the handler registered by the new frame isn't listening yet. In isolation the race is invisible because there's slack in the event loop; under contention it surfaces as flake on whatever scenario happens to lose the race first.

## Fix Applied

Added `await this.waitForStableRender()` at the start of all seven methods listed above, matching the pattern already used by `advanceDomain`, `toggleScopeOnFocusedSkill`, and `toggleInfoPanel` in the same file. No behavioral changes beyond the wait — same keystrokes, same return values, same post-press waits retained.

Verified by running `e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts` (3 scenarios, ~72s total, all green).

## Proposed Standard

Tighten the page-object key-press rule in `.ai-docs/standards/e2e/README.md` (section "Critical Rules") to drop the qualifier "if it's the first interaction after a wizard launch or step transition". The qualifier is what lets drift slip in — every keypress needs the wait under load, not just the first one. Suggested replacement:

> **Page object key-press rule.** Every step page-object method that sends a key press MUST call `await this.waitForStableRender()` _before_ the press. Post-press waits don't substitute — the race is between commit and `useEffect`, so the guard has to sit upstream of the keystroke. Callers cannot be trusted to have left the screen stable, because the previous method may itself have been a keypress-before-settle.

Also worth adding to `.ai-docs/standards/e2e/page-objects.md` (section listing `BaseStep` helpers) a one-line reminder: "Never call `pressKey` / `pressSpace` / `pressEnter` / `pressEscape` / `pressArrowX` / `session.*` directly without a preceding `waitForStableRender()` in the same method."
