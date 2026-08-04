---
type: standard-gap
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
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`ConfirmStep.confirm()` bakes two decisions into the page object that a caller
cannot override: which completion sentinel counts as success, and how long to
wait for it.

For `wizardType: "edit"` it waits on the xterm-processed buffer for
`STEP_TEXT.EDIT_SUCCESS` **or** `STEP_TEXT.EDIT_UNCHANGED`, with
`TIMEOUTS.INSTALL` (30s).

Two lifecycle specs deliberately wait differently, because they drive a real
`claude plugin install`:

- `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts`
- `e2e/lifecycle/source-switching-per-skill.e2e.test.ts`

Both wait on **raw PTY output** for `EDIT_SUCCESS` **alone**, with
`TIMEOUTS.PLUGIN_INSTALL` (60s). These are the only two `PLUGIN_INSTALL`
_wait_ sites in the whole suite — everywhere else `PLUGIN_INSTALL` is used as
a vitest test-level timeout, not a sentinel wait.

That makes the two specs unmigratable off the raw `InteractivePrompt` fixture
in a behaviour-preserving way. Phase 1 of Pass 8 Cluster G added
`SourcesStep.moveSourceColumnRight` / `moveSourceColumnLeft` /
`selectFocusedSourceCell` specifically to unblock this migration, and those
three do cover the SourceGrid interactions. But the wizard session is owned
end-to-end by one driver: you cannot traverse the build step with the page
objects (gaining the `retryEnterUntil` dropped-keystroke protection, which is
the entire point of the migration) and then finish on `InteractivePrompt`.
Adopting `confirm.confirm()` would simultaneously **broaden** the accepted
sentinel (adding `EDIT_UNCHANGED`) and **halve** the wait budget. Both are
behaviour changes, so the migration is blocked.

The underlying gap is a general one: page-object methods that hardcode a wait
budget are only reusable by call sites that happen to agree with that budget.
Every other `TIMEOUTS.*` value in the suite is passed in by the caller.

## Fix Applied

None on the infra side — `e2e/pages/**` was frozen for this pass.

In the two owned spec files I:

- Left the `InteractivePrompt`-driven edit phase in place rather than
  migrating it, so no sentinel and no timeout changed.
- Replaced the now-false explanatory comments. Both files previously claimed
  the SourceGrid navigation "is not exposed through the SourcesStep page
  object", which stopped being true when phase 1 landed. They now state the
  real remaining blocker. `mixed-mode-skill-ref-format` additionally claimed
  the toggle used "arrow-left + Space"; the code only presses Space at column
  0, so that was corrected too.
- Applied the rest of the shared-infra adoption (`TERMINAL_SIZE.TALL`,
  `TIMEOUTS.SETUP_DUAL`, `configTsPath`, `completeWithLocalSources`,
  `E2E_SKILL`).

Both files were run serially and pass.

## Proposed Standard

Add a sentinel/timeout-injection rule to `.ai-docs/standards/e2e/README.md`
under the page-object section:

> A page-object method that waits on a completion sentinel must accept the
> sentinel and the timeout from its caller whenever more than one call site
> needs a different budget. Hardcoding either makes the method unusable for
> slower flows (plugin install, real marketplace) and silently changes what a
> migrating test asserts.

Concretely, the unblocking change is a `ConfirmStep` overload along the lines
of:

```ts
async confirmAwaiting(sentinel: string, timeoutMs: number): Promise<WizardResult>
```

that presses Enter and waits for `sentinel` in **raw** output with
`timeoutMs`, leaving `confirm()` as the defaulted convenience wrapper. With
that in place, both specs migrate to `EditWizard` + page objects with
byte-identical sentinels and budgets, and gain the `retryEnterUntil`
protection on the three build-step domain transitions.

Until then, do not "tidy" these two files onto `confirm()` — the 60s
`PLUGIN_INSTALL` budget and the single-sentinel wait are deliberate.
