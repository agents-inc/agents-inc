---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/init-and-edit-from-warn-when-a-codex-plugin-stays-switched-on.test.ts
  - src/cli/lib/__tests__/commands/edit-from-plugins-says-what-it-did.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`captureOutput` from `@oclif/test` (`lib/index.js`, `mock`) calls a write callback only when it
arrives third, `write(chunk, encoding, cb)`. With `print: false` (the default), a callback passed
second, `write(chunk, cb)`, is never called. `edit --from`, run from source at a terminal, waits on
such a callback, so every `edit` case in a spec capturing through it hung until Vitest's 10s timeout,
while `init --from` in the same spec passed. With `print: true` the original `write` answers the
callback and the hang goes away, which makes it look like a timing problem.

`runCliCommand` (`helpers/cli-runner.ts`, `makeCapturingWrite`) answers either position, but drives
`./dist` and so cannot see a `vi.mock` of `child_process`. `edit-from-plugins-says-what-it-did.test.ts`
already works around it with its own `stdout` spy that finds the callback in any position.

Census of `captureOutput` users (`grep -rln "captureOutput" src e2e scripts`, 2026-10-31, 10 files):
none of the others drives `edit` at a terminal, so none is known to hang today.

## Fix Applied

The new spec captures `stdout` and `stderr` with a `vi.spyOn` that answers the callback in whichever
position it arrives, as `edit-from-plugins-says-what-it-did.test.ts` does for `stdout`.

## Proposed Standard

A shared capture helper in `src/cli/lib/__tests__/helpers/` for a source-imported command that
answers write callbacks in either position and captures both streams, plus one line in
`clean-code-standards.md` § 6: a spec that runs a command from source at a terminal does not use
`captureOutput`.
Proposal only; not checked against any existing rule beyond the census above.
