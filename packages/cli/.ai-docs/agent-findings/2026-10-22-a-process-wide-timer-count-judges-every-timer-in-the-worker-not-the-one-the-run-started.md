---
type: anti-pattern
severity: low
affected_files:
  - src/cli/base-command.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  base-command.test.ts "leaves no poll running once the terminal is large enough" spies on
  setInterval and clearInterval and asserts each interval the run started was cleared.
---

## What Was Wrong

`base-command.test.ts` judged "the run leaves no poll running" by counting `Timeout` entries in
`process.getActiveResourcesInfo()` before and after the run. That list is every timer in the vitest
worker, so a timer the run does not own that is alive when the spec starts and gone before it ends
(one of vitest's own, or a library's) lowers the count and reddens the spec whether or not the
poll was cleared. The headless unit gate went red once on it (`expected +0 to be 1`); planting one
unrelated 40 ms `setTimeout` per spec in a setup file made it fail every time.

Census of process-wide counts in the CLI's tests:

```
grep -rn -E 'listenerCount\(|getActiveResourcesInfo|_getActiveHandles' src e2e scripts --include='*.ts' --include='*.tsx'
```

On 2026-10-22 it returns only `process.stdout.listenerCount("resize")` in the same file. That
count is process-wide too, but nothing in that worker listens for `resize` except the code under
test and the file's own `afterEach`, so it was left as it is.

## Fix Applied

The spec spies on `setInterval` and `clearInterval` (calls pass through) and asserts that every
interval started while the run was waiting was cleared, and that it started at least one. Red, then
green: the planted-timer config failed the old spec 1 of 1 and passes the new one 6 of 6 runs;
removing the product's `clearInterval` reddens the new spec with the still-running `Timeout`.

## Proposed Standard

For `packages/cli/CLAUDE.md` under "Test Assertions": a spec claiming its subject leaves no timer,
handle or listener behind asserts on the handles the subject created (spy and compare), never on a
process-wide count, which also moves with what the test runner and libraries own. Not checked
against a standard beyond CLAUDE.md, which says nothing on it.
