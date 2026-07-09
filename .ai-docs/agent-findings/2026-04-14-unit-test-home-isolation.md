---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/commands/doctor.test.ts
  - src/cli/lib/__tests__/commands/build/plugins.test.ts
  - src/cli/lib/__tests__/commands/build/marketplace.test.ts
  - src/cli/lib/__tests__/commands/new/skill.test.ts
  - src/cli/lib/__tests__/commands/new/agent.test.ts
  - src/cli/lib/__tests__/commands/new/marketplace.test.ts
  - src/cli/lib/__tests__/commands/import/skill.test.ts
standards_docs:
  - CLAUDE.md (Pre-Commit Checklist / Test Data)
date: 2026-04-14
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: setupIsolatedHome helper adopted across all 7 files
---

## What Was Wrong

Seven unit test files that exercise CLI commands did NOT override `process.env.HOME`
in their `beforeEach`. This meant any code path that reads `os.homedir()` or any
`~/.claude*` path (e.g. global config, global skill scope, global plugin install
paths) would read the developer's real `~` during the test run.

This is a correctness/pollution blocker:

- Tests can silently depend on whatever the developer happens to have installed globally.
- Tests can silently write to the developer's real home on CI/dev machines.
- Cross-machine reproducibility breaks — tests can pass locally and fail in CI.

Two existing test files (`validate.test.ts`, `uninstall.test.ts`) already did the
right thing with a `fakeHome` created inside the temp dir and restored in
`afterEach`. The pattern was not replicated across the rest of the command tests.

## Fix Applied

Applied the same `originalHome` + `fakeHome` pattern to all 7 files listed above.
Each `beforeEach`:

- Captures `originalHome = process.env.HOME`
- Creates `fakeHome = path.join(tempDir, "fakehome")` and `mkdir(fakeHome)`
- Sets `process.env.HOME = fakeHome`

Each `afterEach`:

- Restores `process.env.HOME` to `originalHome` (or `delete process.env.HOME`
  when the original was `undefined`, to avoid leaving the literal string
  `"undefined"` in the env)
- Cleans up `tempDir` with `cleanupTempDir`

All 479 command tests continue to pass.

## Proposed Standard

Add to CLAUDE.md under "Test Data" (or a new "Test Isolation" section):

> Unit tests for CLI commands MUST override `process.env.HOME` to a temp-dir
> `fakehome` in `beforeEach`, and restore it (or `delete` it if it was
> originally undefined) in `afterEach`. Any code path the command under test
> can hit that calls `os.homedir()` or reads `~/.claude*` will otherwise
> silently depend on the developer's real machine.
>
> Canonical pattern lives in `validate.test.ts` and `uninstall.test.ts`.

Consider extracting a `setupIsolatedHome()` helper in `__tests__/helpers/`
that returns `{ tempDir, projectDir, fakeHome, cleanup }` so new command test
files can drop it in with one call instead of hand-rolling the beforeEach.
