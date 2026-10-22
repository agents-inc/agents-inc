---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/e2e/specs/agent-switch-toasts.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  agent-switch-toasts.spec.ts: the roster-row case keeps an earlier toast up and asserts it is still
  the only one; "stays on, saying nothing" waits for no toast inside BEFORE_A_TOAST_EXPIRES (2 s).
---

## What Was Wrong

A Playwright wait for no toast, `await expect(toasts.all).toHaveCount(0)`, retries for the default
5 s expect timeout. A Base UI toast lives 5 s (its default `timeout`) and then fades for 200 ms. So a
toast raised by mistake satisfies the wait by expiring, whenever the wait begins more than the fade
after the toast was raised. The outcome turns on load:

- Selecting React raised a toast; waiting 500 ms and then waiting for none passed after 4911 ms.
- The same wait begun at once failed: the toast outlived the window by its fade.
- A spec written to show that pressing a roster row back on raises nothing passed against the code
  that raised a toast there, in 10.2 s, in a run of 8 workers.

Census (`grep -rn "toasts.all).toHaveCount(0)" apps/editor/e2e`), two sites, both in
`agent-switch-toasts.spec.ts`:

- "closes on its ✕": sound. `Toasts.close` hovers the toast first, and a hovered toast's timer
  pauses (hovered for 7 s, it was still up), so a ✕ that did nothing would leave it showing.
- "stays on, saying nothing, when every skill is taken off it": the same shape as the spec that
  passed against the defect.

`2026-10-22-a-toasts-close-button-is-out-of-the-accessibility-tree-until-hovered-and-an-axe-audit-outlasts-the-toast`
is the other direction of the same clock: a check about a toast that is present can finish after
the toast has gone. Here, a check that no toast is present can wait until one has gone.

## Fix Applied

- The roster-row case keeps the "switched off" toast its first press raises, and asserts after the
  second press that it is still the only toast. Against the defect it failed (the toast was
  replaced); with the fix it passes.
- "stays on, saying nothing" waits for no toast inside `BEFORE_A_TOAST_EXPIRES` (2 s). A 2 s wait for
  none over a toast still showing fails.

## Proposed Standard

`apps/editor/e2e/README.md`, Conventions, beside "Prove a negative's channel": a wait for something to
be absent ends before anything wrongly present would leave on its own. A toast leaves after 5 s, so
a wait for no toast either uses a window under that or asserts that an earlier toast is still the
only one. This narrows rather than contradicts "No fixed waits": the window bounds a web-first
assertion and adds no sleep. It belongs in the same bullet as the sibling finding's proposal.
