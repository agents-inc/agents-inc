---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/user-journeys/compile-flow.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: compile-flow tests restructured to use recompileAgents()
---

## What Was Wrong

Three tests in `compile-flow.test.ts` used an early-return-on-error pattern that silently passed without asserting anything:

```typescript
if (error?.oclif?.exit && error.oclif.exit !== 0) {
  // "acceptable" error — skip all file assertions
  return;
}
```

The compile command always returned exit code 1 in these test fixtures (skill resolution failed against test skill IDs), so the tests ALWAYS hit the early return and NEVER executed their file assertions. All 3 tests appeared green in CI but verified nothing.

Additionally, `user-journeys.integration.test.ts` contained ~14 Zustand store unit tests (scope toggling, exclusion logic, config splitting) mislabeled as user journeys — they manipulate store state without any file I/O or multi-command workflows.

## Fix Applied

1. Restructured the 3 broken compile flow tests to use `recompileAgents()` directly (matching `edit-recompile.test.ts` pattern) instead of `runCliCommand(["compile"])`, so compilation actually succeeds and file assertions execute.
2. Added annotation comment in `user-journeys.integration.test.ts` noting the store unit tests should be moved to a dedicated file in a future cleanup.

## Proposed Standard

Add to test methodology standards (`.ai-docs/standards/` or CLAUDE.md test section):

**NEVER use early-return-on-error patterns in tests.** If a command might fail in a test fixture, either:

- Fix the fixture so the command succeeds, OR
- Write the test to assert the error behavior explicitly

A test that conditionally skips its assertions based on runtime state is worse than no test — it provides false confidence.

**User journey tests must chain multiple operations with intermediate state verification.** Tests that call a single function and check return values are unit tests, not user journeys, regardless of which directory they live in.
