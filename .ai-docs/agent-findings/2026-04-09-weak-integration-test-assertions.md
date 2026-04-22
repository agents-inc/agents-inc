---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/integration/consumer-stacks-matrix.integration.test.ts
  - src/cli/lib/__tests__/integration/init-flow.integration.test.ts
  - src/cli/lib/__tests__/integration/init-end-to-end.integration.test.ts
  - src/cli/lib/__tests__/integration/compilation-pipeline.test.ts
  - src/cli/lib/__tests__/integration/import-skill.integration.test.ts
  - src/cli/lib/__tests__/integration/source-switching.integration.test.ts
  - src/cli/lib/__tests__/integration/wizard-flow.integration.test.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: 42 toBeDefined + 5 toBeTruthy replaced across 7 integration test files
---

## What Was Wrong

Integration tests used weak assertions that would pass even when values were wrong:

1. **`toBeDefined()`** (42 instances) — passes for any non-undefined value including empty strings, null, zero, or wrong objects. Used both as guard assertions before `!` access and as final value checks.
2. **`toBeTruthy()`** (5 instances) — passes for any truthy value. Used where specific string/path values were knowable.
3. **Duplicate `toBeDefined()`** — one instance had the same variable asserted twice with `toBeDefined()` and no actual value check.
4. **Guard-only assertions** — `toBeDefined()` followed by `!` access, where `toStrictEqual(expect.objectContaining(...))` would simultaneously guard AND verify the shape.

## Fix Applied

Replaced all 42 `toBeDefined()` and 5 `toBeTruthy()` across 7 files:

- **Guard + property access** patterns replaced with `toStrictEqual(expect.objectContaining({...}))` which both guards against undefined AND verifies the expected shape
- **Final assertions** replaced with `typeof` checks, `.toHaveLength()`, `expect.stringMatching()`, or specific value assertions
- **Duplicate assertion** replaced with single `toStrictEqual(expect.objectContaining({...}))` using the known expected description
- **`toHaveBeenCalled()`** replaced with `toHaveBeenCalledTimes(1)` where applicable

All 174 integration tests pass after changes.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` (testing section):

**Integration test assertion rules:**

- NEVER use `toBeDefined()` as a final assertion — always assert the specific expected value or shape
- NEVER use `toBeTruthy()` — use `typeof` checks, `.toBe()`, or `.toContain()` for specific values
- When a `toBeDefined()` guard precedes `!` property access, prefer `toStrictEqual(expect.objectContaining({...}))` which guards AND validates in one assertion
- Use `toHaveBeenCalledTimes(1)` over `toHaveBeenCalled()` for precision
