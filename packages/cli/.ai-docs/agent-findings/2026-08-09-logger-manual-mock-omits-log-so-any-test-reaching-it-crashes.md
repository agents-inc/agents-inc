---
type: standard-gap
severity: medium
affected_files:
  - src/cli/utils/__mocks__/logger.ts
  - src/cli/utils/logger.ts
standards_docs:
  - .ai-docs/reference/testing/infrastructure.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The missing `log` spy was added, which is what unblocked CLI-465's revalidation spec. The five
  buffering exports (`enableBuffering`, `drainBuffer`, `disableBuffering`, `pushBufferMessage`,
  `setVerbose` is present) are still absent or partial, so the same crash is waiting for the first
  test that mocks the logger and reaches one of them. No standard yet says a manual mock must
  mirror its module's export list.
---

## What Was Wrong

`src/cli/utils/__mocks__/logger.ts` is a manual mock — `vi.mock("../../utils/logger")` with no
factory resolves to it instead of automocking. It declares three of the module's nine exports:

| Exported by `logger.ts` | Present in the manual mock |
| ----------------------- | -------------------------- |
| `verbose`               | yes                        |
| `warn`                  | yes                        |
| `setVerbose`            | yes                        |
| `log`                   | **no** (added by this fix) |
| `enableBuffering`       | **no**                     |
| `drainBuffer`           | **no**                     |
| `disableBuffering`      | **no**                     |
| `pushBufferMessage`     | **no**                     |
| `StartupMessage` (type) | n/a                        |

A module under test that calls a missing one fails with `TypeError: log is not a function` —
inside the code under test, not in the mock — so the failure reads as a product defect. The
sibling assertion fails differently and more confusingly: `expect(log).not.toHaveBeenCalledWith(...)`
reports `undefined is not a spy`.

This was reached the first time production code called `log()` from a module a test mocks the
logger for (`lib/loading/source-fetcher.ts`, CLI-465). Nothing about the mock announces that it is
partial, and nothing checks it against the module.

## Fix Applied

Added `export const log = vi.fn();`. Deliberately not the buffering four: they need decided return
values (`drainBuffer` must return an array, and a `vi.fn()` returning `undefined` swaps one crash
for another), and no test needs them today. Left as the named gap in `partial_note`.

## Proposed Standard

In `.ai-docs/reference/testing/infrastructure.md`, next to the manual-mock inventory: **a manual
mock in `__mocks__/` mirrors its module's full export list, or says in a comment which exports it
deliberately omits and why.** A partial manual mock is not a smaller mock — it is a module that
throws on the exports it left out, at the call site, dressed as a product bug.

Cheapest enforcement if one is wanted: a test in the same directory that imports both the real
module and the mock and asserts `Object.keys` parity, skipping names listed in an explicit
`DELIBERATELY_ABSENT` array. That turns the omission into a decision someone wrote down.
