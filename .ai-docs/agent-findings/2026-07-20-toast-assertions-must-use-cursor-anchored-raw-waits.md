---
type: missing-standard
severity: medium
affected_files:
  - e2e/pages/steps/build-step.ts
  - e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts
  - e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts
  - e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: 'Fix Applied, both proposed standards, AND the deferred follow-up all landed. Verified 2026-07-30: `BuildStep.toggleFocusedSkillAwaiting(sentinel)` and `selectSkillAwaiting(label, sentinel)` exist in `e2e/pages/steps/build-step.ts` alongside the pattern they mirror. `standards/e2e/assertions.md` gained the rule — "Toasts are always a raw-output assertion" — in an "Assert the Surface That Retains the Value" section that contrasts the processed buffer against the append-only raw surface and names every `*Awaiting` method. `standards/e2e/page-objects.md` gained the pairing rule, listing the `*Awaiting` variants in the BuildStep/AgentsStep/ConfirmStep tables and giving BOTH reasons the pre-press cursor anchor is required (the footer sentinel re-emits every frame; an earlier frame''s residue would satisfy an unanchored match). The "remaining unconverted surface" the finding declined to add speculatively is also closed: `AgentsStep.toggleFocusedAgentAwaiting(sentinel)` now exists and is documented as the toast-asserting counterpart of `toggleAgent`.'
---

## What Was Wrong

Wizard toasts render in an absolutely-positioned row (`<Box position="absolute" marginTop={terminalHeight - 4}>` in `wizard-layout.tsx`). Ink rewrites that row in place, and xterm's PROCESSED buffer is not append-only, so the toast text can be overwritten before a test reads it. Raw PTY output IS append-only, so the toast survives there. `e2e/pages/terminal-screen.ts` already documents this hazard on `waitForTextAfter`.

Four toast assertion sites still read the PROCESSED buffer via `getOutput()`:

- `global-skill-toggle-guard.e2e.test.ts` — both tests, after `selectSkill(...)`
- `dual-scope-in-session-collapse-restore-sequence.e2e.test.ts` — step 2, after `toggleFocusedSkill()`
- `init-dashboard-edit-plugin-install.e2e.test.ts` — the exclusive-swap block, after `selectSkill(...)`

These were not vacuous — a measured probe showed processed=1, raw=1 for the SPACE path — but they were open-loop: they passed only by winning a render race between the toast paint and the synchronous `getOutput()` read. There was no wait tying the read to the key press, so under parallel-suite contention the read can land before the toast paints (false failure) or, on an unanchored raw match, accept an identical toast emitted earlier in the same session (false pass).

`BuildStep.toggleFilterIncompatibleAwaiting(sentinel)` already existed as the correct pattern for the `f` key path, but no equivalent existed for the SPACE/toggle path, so the SPACE sites had nothing to convert to.

## Fix Applied

Added two cursor-anchored affordances to `BuildStep`, mirroring `toggleFilterIncompatibleAwaiting` exactly (stable render → capture `getRawCursor()` → press → `screen.waitForTextAfter(sentinel, cursor, defaultTimeout)`):

- `toggleFocusedSkillAwaiting(sentinel)` — SPACE on the focused skill
- `selectSkillAwaiting(skillLabel, sentinel)` — `focusSkill()` then the anchored SPACE, so only the SPACE press's own output is anchored and the navigation keystrokes are excluded from the cursor window

Converted all four sites. Each conversion is a strengthening, not a weakening: the open-loop `expect(getOutput()).toContain(sentinel)` becomes a closed-loop wait on the append-only surface, anchored to a pre-press cursor, that throws with the sentinel and post-cursor raw tail on timeout. A stale identical toast from earlier in the session can no longer produce a false pass, and a slow paint can no longer produce a false failure.

Non-vacuity proved: with the `isActiveGlobal` guard in `src/cli/stores/wizard-store.ts` temporarily disabled, `should block toggling globally installed skills from project scope` fails at `BuildStep.toggleFocusedSkillAwaiting` via `BuildStep.selectSkillAwaiting` with `timeout waiting for "Global skills cannot be changed from project scope" after raw cursor 1375 within 15000ms`. The guard was restored and the file verified byte-identical by sha256.

## Proposed Standard

Add to `.ai-docs/standards/e2e/assertions.md` (new "Toast assertions" section):

> **Never assert a toast on the processed buffer.** Toasts render in an absolutely-positioned row that Ink rewrites in place; `getOutput()` / `getScreen()` may have lost the text by the time the test reads it. Assert toasts only through a step page-object `...Awaiting(sentinel)` method, which captures `getRawCursor()` before the key press and waits via `screen.waitForTextAfter(sentinel, cursor, timeout)` on the append-only raw surface. The wait IS the assertion — do not add a redundant `expect(...).toContain(sentinel)` after it.

Add to `.ai-docs/standards/e2e/page-objects.md` (key-press rule section):

> Every key-press method whose effect is observable ONLY as a toast needs a paired `...Awaiting(sentinel)` variant. Keep the plain variant for callers that assert on durable frame content, and the `...Awaiting` variant for toast callers. Existing pairs: `toggleFilterIncompatible` / `toggleFilterIncompatibleAwaiting`, `toggleFocusedSkill` / `toggleFocusedSkillAwaiting`, `selectSkill` / `selectSkillAwaiting`, `confirm` / `confirmAwaiting`.

Remaining unconverted surface to audit: `AgentsStep.toggleScopeOnFocusedAgent()` and `AgentsStep.toggleAgent()` have the same toast hazard (`GLOBAL_AGENTS_LOCKED` in `wizard-store.ts`), but no spec file in this work unit asserts on those toasts, so no affordance was added — adding one speculatively would be unused code.
