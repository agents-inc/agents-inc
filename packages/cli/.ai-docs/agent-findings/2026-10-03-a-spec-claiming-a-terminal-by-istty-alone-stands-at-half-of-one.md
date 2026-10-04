---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/init-edit-validation-parity.test.ts
  - src/cli/lib/__tests__/commands/edit.test.ts
  - src/cli/lib/__tests__/commands/edit-ui.test.ts
  - src/cli/lib/__tests__/commands/edit-from.test.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/reference/testing/factories.md
date: 2026-10-03
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The two files whose specs reach a prompt now call `standAtTerminal()` from
  src/cli/lib/__tests__/helpers/terminal-input.ts. edit-ui.test.ts and edit-from.test.ts still set
  `process.stdin.isTTY = true` alone; neither of their specs reaches a prompt today (one opens a
  browser, the other is refused before the question), so they are latent rather than failing.
---

## What Was Wrong

Specs that mean "a person is at a terminal" said so by setting `process.stdin.isTTY = true` on the
worker's own stdin. Vitest forks its workers with stdin on a pipe, so that stream has no
`setRawMode`: the claim was half a terminal. It held only while nothing but an `isTTY` branch ever
read stdin.

`promptValue` in `src/cli/components/common/prompt-confirm.tsx` now puts the terminal into raw mode
before a prompt's first frame (an Enter pressed on that frame was otherwise echoed by the kernel and
read as `enter`, not `return`). Every spec of this kind that reached a prompt then died on
`TypeError: input.setRawMode is not a function` from inside the command: 21 failing specs across
`edit.test.ts` and `init-edit-validation-parity.test.ts` in one run. In `edit.test.ts` the TypeError
was swallowed by `Edit.run(...).catch(() => {})`, so it surfaced only as assertions about work the
command never reached.

Census, at the time of writing (the full output, not a sample):
`grep -rn "stdin.isTTY = true" src e2e scripts --include='*.ts' --include='*.tsx'` returned five
hits in the four files listed in `affected_files`.

## Fix Applied

`standAtTerminal()` in `src/cli/lib/__tests__/helpers/terminal-input.ts`, with its own
`terminal-input.test.ts`. It registers a `beforeEach` that replaces `process.stdin` with a fresh
socket that is a TTY and records the mode it is put in, and an `afterEach` that restores the
runner's own. `edit.test.ts` and `init-edit-validation-parity.test.ts` call it in place of the
`isTTY` assignment and its restore. `run-wizard-session.raw-mode.test.tsx` uses the same helper to
read the mode the wizard's first frame was painted in.

## Proposed Standard

A line in `CLAUDE.md` under "Test Data": a spec that stands at a terminal calls `standAtTerminal()`,
and never sets `process.stdin.isTTY` on its own. Re-derive the worklist with the census command
above. This is a proposal. It does not conflict with any NEVER/ALWAYS rule I checked: the rule
against inline helpers does not apply, because the helper lives in `__tests__/helpers/` with its
own test.
