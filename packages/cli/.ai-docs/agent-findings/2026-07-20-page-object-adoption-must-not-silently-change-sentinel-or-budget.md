---
type: missing-standard
severity: medium
affected_files:
  - e2e/pages/steps/confirm-step.ts
  - e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
  - e2e/lifecycle/source-switching-per-skill.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: Added ConfirmStep.confirmAwaiting(sentinel, timeoutMs) as a parameterized sibling of confirm(), then migrated both spec files onto the page objects with their original sentinel and budget intact.
---

## What Was Wrong

Two spec files (`mixed-mode-skill-ref-format`, `source-switching-per-skill`) drove the edit
wizard through the raw `InteractivePrompt` fixture instead of the page objects. They were the
last remaining hand-rolled wizard traversals, and they missed the `retryEnterUntil`
dropped-keystroke protection that `BuildStep.pressEnterWaitNewFrame` gives every other
build-step domain transition.

The blocker was not the SourceGrid interactions — `SourcesStep` already covered those. It was
the final step. `ConfirmStep.confirm()` hardcodes two things for an edit wizard:

- the sentinel: `waitForEither(EDIT_SUCCESS, EDIT_UNCHANGED)` on the xterm buffer
- the budget: `TIMEOUTS.INSTALL` (30s)

Both specs needed something narrower and longer: `EDIT_SUCCESS` alone, read from raw PTY
output, on `TIMEOUTS.PLUGIN_INSTALL` (60s) — the budget a real `claude plugin install`
round-trip actually takes. Adopting `confirm()` as-is would have simultaneously **broadened an
assertion** (a run that emitted "No changes made" would have passed) and **halved a wait
budget** (introducing a real flake on the slowest operation in the suite).

Two earlier agents reached this point. The first proposed the swap without noticing. The
second noticed and correctly stopped rather than migrating. Neither outcome is good: the
migration is worth doing, and there was no documented third option.

## Fix Applied

Added `ConfirmStep.confirmAwaiting(sentinel: string, timeoutMs: number)` — identical to
`confirm()` up to and including the Enter press, then waiting for the caller's sentinel in raw
output on the caller's budget. `confirm()` keeps its exact signature and observable behaviour,
so its ~19 existing call sites are untouched.

The shared prefix (wait for CONFIRM → `waitForStableRender()` → Enter) was extracted into a
private `submitConfirmation()` now used by all three of `confirm()`, `confirmAwaiting()`, and
`confirmExpectingExit()`. That is a pure code move — no ordering, sentinel, or budget changed.

Both spec files were then migrated onto `EditWizard` + `build.passThroughAllDomains()` +
`SourcesStep` + `confirmAwaiting(STEP_TEXT.EDIT_SUCCESS, TIMEOUTS.PLUGIN_INSTALL)`. Every
assertion is byte-identical; only the driving mechanism changed. The exit-code wait stayed on
`TIMEOUTS.EXIT_WAIT` because `WizardResult.exitCode` already uses exactly that value.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, under the page-object adoption guidance:

> **Adopting a shared page-object method must not change a test's sentinel or its wait budget.**
> When a spec waits on a narrower sentinel, a different output channel (raw PTY vs xterm
> buffer), or a longer timeout than the shared method bakes in, you have three options and only
> one of them is correct:
>
> 1. ~~Adopt anyway~~ — silently broadens the assertion and/or shortens the wait. Never do this.
> 2. ~~Widen the shared method~~ — weakens it for every other call site. Never do this.
> 3. **Add a parameterized sibling** that takes the sentinel and/or budget from the caller, and
>    leave the defaulted method untouched for its existing call sites. Do this.
>
> The sibling should share the shared method's prefix via a private helper so the two cannot
> drift apart. Name it for the thing the caller now controls (`confirmAwaiting`, not
> `confirmRaw` or `confirm2`).

This is the same shape as the already-sanctioned `INSTALLING_PLUGINS` /
`INSTALLING_PLUGINS_ELLIPSIS` and `UNINSTALL_PREVIEW` /
`UNINSTALL_PREVIEW_HEADING` constant splits: when one shared value would force either a
strengthened or a weakened assertion at some call site, split it rather than picking a loser.
