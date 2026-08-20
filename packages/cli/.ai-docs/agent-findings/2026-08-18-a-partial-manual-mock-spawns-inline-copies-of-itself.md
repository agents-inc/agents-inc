---
type: standard-gap
severity: low
affected_files:
  - src/cli/utils/__mocks__/logger.ts
  - src/cli/lib/operations/source/load-source.test.ts
  - src/cli/lib/operations/source/ensure-marketplace.test.ts
standards_docs:
  - .ai-docs/reference/testing/infrastructure.md
date: 2026-08-18
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The four buffering spies are now in the manual mock and the spec that needed them uses it. The
  export-parity spec was parked as a separate piece of work by the owner and has since landed as
  `src/cli/lib/__tests__/manual-mock-parity.test.ts`; installing it found the sibling mock in the
  same directory short by two exports, which is
  `2026-08-19-a-second-partial-manual-mock-survived-because-nothing-compared-it.md`. Still open, and
  it is the half the parity spec cannot reach - one inline copy of the mock survives in
  `src/cli/lib/operations/source/ensure-marketplace.test.ts`, and a spec that never imports the mock
  cannot be measured against it.
---

## What Was Wrong

`src/cli/utils/__mocks__/logger.ts` declared four spies against the module's eight value exports.
The four buffering functions were absent, so `vi.mock("../../utils/logger")` handed a module under
test `undefined` where it expected a function.

The crash was never the whole cost. A partial manual mock is not simply smaller — **it quietly
teaches every author who trips over it to write their own**, and two specs under
`lib/operations/source/` did exactly that:

| Spec                         | What it wrote                                                    |
| ---------------------------- | ---------------------------------------------------------------- |
| `load-source.test.ts`        | An inline factory listing all eight exports — the mock, restated |
| `ensure-marketplace.test.ts` | An inline factory listing four — the mock, duplicated exactly    |

Neither file explains why it does not use the manual mock, because from inside the spec there is
nothing to explain: the author needed `enableBuffering`, the mock had no such export, and an inline
factory is the shortest way out. The gap therefore hides in the one place nobody greps — a spec that
works.

`loadSource` is the only module in `src/cli/` that calls the buffering pair, which is why the
absence survived from the day it was noticed: the sole spec that could have caught it had already
routed around it.

## Fix Applied

The four buffering exports are in the manual mock, with `drainBuffer` returning an array rather
than `undefined` — a spy answering `undefined` moves the crash one line later, into the caller
that spreads the result. `load-source.test.ts` now takes the manual mock and its inline factory is
gone; the file's remaining `vi.mocked(...)` handles are unchanged, so the conversion is visible in
the diff as a deletion.

`ensure-marketplace.test.ts` is left alone deliberately: its factory names four exports the manual
mock also has, so it is redundant rather than wrong, and its module under test reaches no buffering
function. It is the surviving example of the copy this gap produces.

## Proposed Standard

A manual mock in `__mocks__/` mirrors its module's full export list, or carries a comment naming
what it deliberately omits and why. The mock file now says that in a header comment, which is where
the next author looks.

The runnable half — a spec asserting `Object.keys` parity between the real module and its mock,
skipping names in an explicit `DELIBERATELY_ABSENT` array — is **parked by the owner as a new
feature rather than part of this correction**. It is the only mechanism that would have caught the
original omission, and it would also flag the inline copy above, since a spec that never imports the
mock cannot be measured against it.
