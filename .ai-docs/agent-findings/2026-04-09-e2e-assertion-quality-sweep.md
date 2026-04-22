---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/update.e2e.test.ts
  - e2e/smoke/plugin-install.smoke.test.ts
  - e2e/smoke/home-isolation.smoke.test.ts
  - e2e/lifecycle/source-switching-per-skill.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/cross-scope-lifecycle.e2e.test.ts
  - e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - e2e/lifecycle/local-lifecycle.e2e.test.ts
  - e2e/lifecycle/plugin-lifecycle.e2e.test.ts
  - e2e/commands/uninstall-preservation.e2e.test.ts
  - e2e/commands/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/interactive/init-wizard-existing.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: D-168 E2E anti-pattern audit (0.125.0)
---

## What Was Wrong

Three categories of assertion quality issues across 12 E2E test files:

1. **Weak assertions:** `toBeDefined()` (1 instance) and `toBeTruthy()` (5 instances) used where specific value assertions were possible. `toBeDefined()` on an exit code is meaningless since the value is always defined; `toBeTruthy()` on combined stdout+stderr doesn't verify anything meaningful when a more specific `toContain` or length check would be clearer.

2. **Hardcoded `"config.ts"` string:** 7 instances across 5 lifecycle files used `"config.ts"` in `path.join()` calls instead of `FILES.CONFIG_TS` from `e2e/pages/constants.ts`.

3. **Hardcoded `"settings.json"` string:** 10 instances across 5 files used `"settings.json"` in `path.join()` calls instead of `FILES.SETTINGS_JSON` from `e2e/pages/constants.ts`.

## Fix Applied

- `toBeDefined()` on exit code replaced with `expect([EXIT_CODES.SUCCESS, EXIT_CODES.ERROR]).toContain(exitCode)` matching the documented acceptable values.
- `toBeTruthy()` on string output replaced with `expect(str.length).toBeGreaterThan(0)` or removed when redundant (a subsequent `toContain` already implies non-empty).
- All `"config.ts"` path segments replaced with `FILES.CONFIG_TS` (imports added where missing).
- All `"settings.json"` path segments replaced with `FILES.SETTINGS_JSON` (imports added where missing).

## Proposed Standard

The existing rules in `assertions.md` ("Use `toStrictEqual` for object comparisons") and `anti-patterns.md` ("Never use hardcoded path segments") already cover these cases. The gap is enforcement -- no automated lint rule catches `toBeTruthy()` misuse or hardcoded file name strings in path constructions.

Suggestion: Add a `no-restricted-syntax` ESLint rule targeting `.toBeTruthy()` and `.toBeDefined()` in E2E test files, with a comment explaining the preference for specific assertions. Also consider a custom lint rule or grep check for hardcoded `"config.ts"`, `"settings.json"`, `"SKILL.md"` strings in E2E test files that should use `FILES.*` constants.
