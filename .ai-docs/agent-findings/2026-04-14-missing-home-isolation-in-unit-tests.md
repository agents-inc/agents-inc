---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/commands/doctor.test.ts
  - src/cli/lib/__tests__/commands/new/skill.test.ts
  - src/cli/lib/__tests__/commands/new/agent.test.ts
  - src/cli/lib/__tests__/commands/new/marketplace.test.ts
  - src/cli/lib/__tests__/commands/import/skill.test.ts
  - src/cli/lib/__tests__/commands/build/plugins.test.ts
  - src/cli/lib/__tests__/commands/build/marketplace.test.ts
standards_docs:
  - CLAUDE.md (Test Data section)
date: 2026-04-14
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: setupIsolatedHome helper created; 7 command tests migrated
---

## What Was Wrong

`validate.test.ts` and `uninstall.test.ts` correctly stub `process.env.HOME`
to a fake directory in `beforeEach`/`afterEach`. The other seven unit tests
in `src/cli/lib/__tests__/commands/` (doctor, new/_, import/_, build/\*)
all `process.chdir(projectDir)` but leave `HOME` pointing at the developer's
real home directory.

Several code paths read `~/.claude/` directly:

- `doctor` walks both project and global skill/agent directories.
- `import:skill` writes to global installation scopes when scope='global'.
- `build:plugins` reads from `~/.claude/plugins/` in some flows.

This means the test suite can pollute (or be polluted by) the developer's
real `~/.claude/` installation. Symptoms include:

- Tests pass locally but fail in CI (different `HOME` contents).
- Tests fail after a local `cc init` because the global config changed.
- Global plugins created by one test leak into later tests in the same run.

## Fix Applied

None — discovery only. Fixing requires adding `originalHome`/`fakeHome`
setup to 7 test files and matching teardown. That's a mechanical change
but outside the scope of the audit task.

## Proposed Standard

1. Add to CLAUDE.md "Test Data" rules (or a new "Test Isolation" section):

   > Every unit test that invokes CLI code (via `runCliCommand` or direct
   > imports) MUST stub `process.env.HOME` to a temp directory in
   > `beforeEach` and restore in `afterEach`. Pattern:
   >
   > ```ts
   > let originalHome: string | undefined;
   > beforeEach(async () => {
   >   originalHome = process.env.HOME;
   >   process.env.HOME = path.join(tempDir, "fakehome");
   >   await mkdir(process.env.HOME, { recursive: true });
   > });
   > afterEach(() => {
   >   process.env.HOME = originalHome;
   > });
   > ```

2. Factor the setup/teardown into a reusable helper in
   `src/cli/lib/__tests__/test-fs-utils.ts` (e.g. `withFakeHome()`) so
   individual test files don't duplicate the boilerplate.
