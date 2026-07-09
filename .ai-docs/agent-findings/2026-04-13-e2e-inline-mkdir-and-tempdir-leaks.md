---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/init-global-preselection-confirm.e2e.test.ts
  - e2e/lifecycle/global-scope-lifecycle.e2e.test.ts
  - e2e/interactive/init-wizard-interactions.e2e.test.ts
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
  - e2e/lifecycle/scope-aware-local-copy.e2e.test.ts
  - e2e/interactive/init-wizard-existing.e2e.test.ts
  - e2e/interactive/update.e2e.test.ts
  - e2e/interactive/edit-wizard-launch.e2e.test.ts
  - e2e/interactive/edit-wizard-local.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-04-13
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: createTestEnvironment() adopted; tempDir capture pattern applied
---

## What Was Wrong

Two related anti-patterns across 9 E2E test files:

1. **Inline mkdir + createPermissionsFile instead of createTestEnvironment()**: Multiple test files duplicated the 6-8 line pattern of creating `fakeHome` + `projectDir` directories with permissions files, when `createTestEnvironment()` from `dual-scope-helpers.ts` already encapsulates this exact pattern. One file (`init-global-preselection-confirm`) was missing the `createPermissionsFile` call entirely, risking flaky hangs.

2. **Temp dir leaks from ProjectBuilder.editable()**: `ProjectBuilder.editable()` internally calls `createTempDir()` and creates a `project` subdirectory. Many tests stored `project.dir` but never captured the parent temp dir for cleanup, causing temp directories to accumulate in `/tmp` across test runs. The pattern `tempDir = path.dirname(project.dir)` was already used in some tests but not applied consistently.

## Fix Applied

- Replaced inline `mkdir` + `createPermissionsFile` blocks with `createTestEnvironment()` in 5 lifecycle/interactive test files
- Added `tempDir = path.dirname(project.dir)` after `ProjectBuilder.editable()` calls in `edit-wizard-launch`, `edit-wizard-local`, and `init-wizard-existing` test files
- Removed leaked `createTempDir()` call in `update.e2e.test.ts` where the result was immediately overwritten
- Cleaned up unused imports (`mkdir`, `writeFile`, `createTempDir`, `createPermissionsFile`, `path`) where no longer needed
- Replaced inline `writeFile` for `.claude/settings.json` with `createPermissionsFile()` in `init-wizard-existing`
- Removed redundant constant alias `EDIT_TEST_TIMEOUT_MS = TIMEOUTS.PLUGIN_INSTALL` (per CLAUDE.md: "NEVER reassign constants to other constants")
- Removed redundant local `completeEditFromBuild()` helper that duplicated `EditWizard.completeFromBuild()`

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md` under a "Test Environment Setup" section:

1. **Always use `createTestEnvironment()` from `dual-scope-helpers.ts`** when a test needs `fakeHome` + `projectDir` with permissions files. Never inline `mkdir` + `createPermissionsFile`.
2. **Always capture the parent temp dir from `ProjectBuilder` methods**: After `ProjectBuilder.editable()`, `ProjectBuilder.minimal()`, etc., set `tempDir = path.dirname(project.dir)` and clean it up in `afterEach`.
3. **Never call `createTempDir()` if the result will be overwritten** by a subsequent assignment to the same variable.
