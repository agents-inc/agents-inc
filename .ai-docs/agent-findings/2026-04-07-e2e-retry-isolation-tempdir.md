---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/init-global-preselection-confirm.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-07
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: temp dirs moved into it() + afterEach cleanup applied
---

## What Was Wrong

The test created temp directories (fakeHome, projectDir) in `beforeAll` and cleaned up in `afterAll`. Since the E2E vitest config has `retry: 2`, failed tests retry the `it()` block without re-running `beforeAll`/`afterAll`. This means retries reuse the same temp directory containing stale config files from Phase 1 of the first run, causing Phase 2 to detect an existing installation and show the dashboard instead of the wizard.

Additionally, the test had an overly strict assertion (`expect(output).not.toContain("web-framework-react")`) that failed because the confirm step legitimately shows excluded global skills (dimmed) -- just without a removal marker. The removal-marker check was already correct.

## Fix Applied

1. Moved temp dir creation into the `it()` block so each retry gets fresh directories.
2. Changed cleanup from `afterAll` to `afterEach` (source stays in `afterAll` since it's read-only).
3. Removed the overly strict assertion -- the removal-marker check at lines 89-92 is the correct D-182 validation.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`:

**Anti-pattern: Creating per-test temp dirs in `beforeAll`**

With `retry: 2` in the E2E vitest config, `beforeAll` runs once while `it()` may run up to 3 times. Temp directories created in `beforeAll` retain stale files across retries, causing multi-phase tests to fail on retry (e.g., Phase 2 sees config from Phase 1's first run).

Rule: Create temp dirs inside the `it()` block, clean up in `afterEach`. Only put expensive shared fixtures (E2E source creation) in `beforeAll`/`afterAll`.
