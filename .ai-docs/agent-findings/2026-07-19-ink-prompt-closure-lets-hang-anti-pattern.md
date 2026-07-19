---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/update.tsx
  - src/cli/commands/new/agent.tsx
  - src/cli/components/common/prompt-confirm.tsx
standards_docs: []
date: 2026-07-19
reporting_agent: main-session (expressive-typescript refactor loop)
category: complexity
domain: cli
root_cause: missing-rule
status: resolved
---

# Ink prompt results read from closure-mutated lets after waitUntilExit

## What happened

`Update.confirmUpdate` rendered `<UpdateConfirm>` whose callbacks only mutated
closure `let confirmed/cancelled` flags, then did `await waitUntilExit()` before
inspecting them. Nothing in that component tree ever called `useApp().exit()` or
`unmount()`, so after pressing `y` the app never exited and the command **hung**
— a real, documented product bug (`it.fails` marker with a BUG comment in
`e2e/interactive/update.e2e.test.ts`). The pattern hid the bug because the code
_reads_ as if the prompt completes: the flags-then-await shape gives no signal
about who is responsible for ending the Ink app.

## The anti-pattern

Closure-mutated lets inspected after `waitUntilExit()` couples three things
invisibly: callback firing, app exit responsibility, and result interpretation.
When the exit half is missing (or lives in a different component), the prompt
compiles, renders, and deadlocks.

## The fix

Resolve a promise (with a discriminated outcome) directly from the callbacks and
own the unmount in one place:

- `components/common/prompt-confirm.tsx` — `promptConfirm(build)` returns
  `'confirmed' | 'cancelled'`, unmounts on either callback, maps render failure
  to cancelled. Adopted by `update` (fixing the hang; `it.fails` flipped to a
  passing `it`) and `uninstall`.
- `new/agent.tsx` `promptForPurpose` — resolves a `{status}` union first-wins
  from callbacks, with `waitUntilExit().then(cancel, cancel)` covering clean
  exit without a callback.

## Rule to extract

When a command needs an answer from an Ink prompt, resolve a promise from the
component's callbacks (discriminated union for >2 outcomes) and unmount at the
resolution site — never read closure-mutated flags after `waitUntilExit()`.
