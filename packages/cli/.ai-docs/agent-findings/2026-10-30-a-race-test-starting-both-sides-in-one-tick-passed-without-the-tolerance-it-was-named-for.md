---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/shared-source.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-30
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: >-
  The sweep race test starts a sweep every millisecond until the first one finishes, then asserts
  none failed; red 20 of 20 against the mutant, green 20 of 20 against the real code.
---

## What Was Wrong

The test of two runs sweeping one folder started both with `Promise.all([sweep(), sweep()])`, in
one tick. The two moved in step and never met each other's removal, so the test passed with the
ENOENT tolerance it was named for deleted from `sweepAbandonedSharedSources`.

## Fix Applied

CLI-994: `failuresOfSweepsOverlappingOne` in `shared-source.test.ts` keeps starting sweeps until the
first finishes, so later ones meet its removal part-way; "lets a run sweep a folder another run is
part-way through removing" asserts no failures.

## Proposed Standard

A test of a race shows its red against the code it names, and staggers the sides rather than
starting them in one tick.
