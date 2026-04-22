---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/components/hooks/use-virtual-scroll.test.ts
  - src/cli/stores/wizard-store.test.ts
  - src/cli/lib/output-validator.test.ts
  - src/cli/lib/__tests__/commands/validate.test.ts
  - src/cli/lib/source-validator.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 12 toBeGreaterThan(0) replaced with exact assertions
---

## What Was Wrong

`toBeGreaterThan(0)` assertions used in unit tests where the exact count is deterministic from the test setup. This pattern hides off-by-one errors and logic bugs -- a test that expects "at least 1" passes whether it gets 1 or 100.

**82 instances found across the codebase.** Of those, ~12 in unit tests could be replaced with exact assertions. The remaining ~70 are in integration tests against real source data where exact counts legitimately vary.

Fixable patterns found:

1. **Computed values treated as opaque** (use-virtual-scroll.test.ts): `hiddenBelow` and `hiddenAbove` are deterministic from input (10 items x height 3, viewport 12). Exact values are 7.
2. **Known mock data counted loosely** (wizard-store.test.ts): `populateFromSkillIds(["react", "hono"])` produces exactly 2 domains -- "web" and "api".
3. **Validator error/warning counts** (output-validator.test.ts): Missing `description` + `tools` produces exactly 2 warnings. Missing `name` produces exactly 1 error.
4. **Single-error conditions** (validate.test.ts, source-validator.test.ts): Non-existent directory, missing skills dir, missing SKILL.md, missing metadata.yaml each produce exactly 1 error.
5. **Known snake_case key count** (validate.test.ts): Metadata with 3 snake_case keys (`cli_name`, `cli_description`, `usage_guidance`) should match exactly 3.

## Fix Applied

Replaced 12 `toBeGreaterThan(0)` assertions with exact values:

- `toBe(7)` for virtual scroll hidden counts
- `toHaveLength(2)` for domain selection keys
- `toHaveLength(2)` for output validator warnings
- `toHaveLength(1)` for output validator errors
- `toBe(1)` for single-error validation conditions (4 instances)
- `toHaveLength(3)` for snake_case issue count

## Proposed Standard

Add to CLAUDE.md testing rules:

**NEVER use `toBeGreaterThan(0)` or `.length > 0` in unit tests where the test controls all input data.** Use exact `toHaveLength(N)` or `toBe(N)` instead. Reserve `toBeGreaterThan(0)` only for integration tests where the data source evolves independently of the test.
