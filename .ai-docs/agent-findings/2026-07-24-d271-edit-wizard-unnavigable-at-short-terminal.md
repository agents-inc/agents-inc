---
type: standard-gap
severity: medium
affected_files:
  - e2e/pages/wizards/edit-wizard.ts
  - e2e/interactive/sources-overflow-pending-removal.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-07-24
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

The D-271 RED spec needed to drive `cc edit` at `TERMINAL_SIZE.SHORT` (rows 16) to
reproduce the Sources-step clipping bug. Two undocumented constraints blocked the
usual approach:

1. `EditWizard.launchInProject` hangs at SHORT. The edit wizard opens directly on
   the build step, whose grid renders the FULL available-skills matrix. At 16 rows
   that grid overflows the viewport and the first category header ("Framework", the
   `STEP_TEXT.BUILD` sentinel the launcher waits for) is overdrawn by later rows, so
   it never settles as a stable substring. The launcher burns its full
   `WIZARD_TRANSITION` budget and fails. (`InitWizard` does not hit this — its
   launcher waits for the stack step, which paints cleanly at SHORT.)

2. Build-grid skill navigation is unusable at SHORT. `BuildStep.focusSkill` /
   `selectSkill` call `findSkillGridPosition`, which parses category headers out of
   the rendered frame. The garbled short-viewport frame breaks that parse
   ("no category headers found"). Blind index navigation (`navigateDown` + a
   counted press) is also unreliable because the grid's focus model does not reset
   deterministically across `advanceDomain` calls — a probe meant to deselect the
   2nd-category skill silently toggled a different one.

The only render-independent build-step edit at SHORT is toggling the FIRST-focused
skill (`toggleFocusedSkill` at build entry, before any navigation), because the
focus is seeded synchronously to the first skill of the first domain and the toggle
does not read the frame.

## Fix Applied

- Added `EditWizard.launchInProjectShort` (additive): a `launchInProject` variant
  that skips the third "Framework" settle wait (BUILD_FOOTER + footer still confirm
  the build step is live). Documented that it is ONLY for callers that step through
  the build step blind (Enter to advance domains, toggle the already-focused skill),
  never for `findSkillGridPosition`-based navigation.
- The RED spec builds an all-project fixture with NO stack (so nothing is preloaded
  and the first-focused skill is editable), deselects it with a single
  `toggleFocusedSkill`, and proves the deselection landed by completing the flow and
  asserting the config drop — because at SHORT the clipped Sources viewport cannot
  distinguish "deselected" from "still selected".

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` (or `page-objects.md`) a short note
under a "Short-viewport wizard tests" heading:

- To reach a wizard step at `TERMINAL_SIZE.SHORT`, prefer `InitWizard` (its launcher
  waits for the stack step) or `EditWizard.launchInProjectShort` (skips the build
  category settle). `EditWizard.launchInProject` hangs at SHORT.
- Do NOT use `focusSkill` / `selectSkill` or counted `navigateDown` presses in the
  build step at SHORT — the grid garbles and `findSkillGridPosition` fails / focus
  does not reset per domain. Deselect the FIRST-focused skill with
  `toggleFocusedSkill` at build entry (render-independent), which requires a fixture
  with no preload (no stack) so that first skill is editable.
- At SHORT the Sources viewport clips silently and cannot report selection state;
  prove a deselection by completing the flow and asserting the config drop, not by
  reading the clipped frame.
