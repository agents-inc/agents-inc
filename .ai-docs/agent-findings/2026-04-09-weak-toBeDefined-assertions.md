---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.test.ts
  - src/cli/lib/loading/multi-source-loader.test.ts
  - src/cli/lib/loading/source-fetcher.test.ts
  - src/cli/lib/loading/loader.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: 81 toBeDefined replaced with strict assertions in loading tests
---

## What Was Wrong

81 `toBeDefined()` assertions across 5 loading-related test files were weak guards that only checked existence without asserting actual values. Common patterns:

1. **Redundant guards**: `expect(x).toBeDefined(); expect(x.prop).toBe("value")` -- the second assertion already fails if `x` is undefined
2. **Missing value checks**: `expect(result).toBeDefined()` followed by `toContain()` -- `toContain` on undefined would fail anyway
3. **Shallow existence checks**: `expect(obj["key"]).toBeDefined()` without asserting the actual shape or values of the object

## Fix Applied

Replaced all 81 `toBeDefined()` with strict assertions:

- `toStrictEqual({...})` for full object shape verification (especially `SkillSource` objects)
- `toBe(exactValue)` for computed paths (e.g., `getGigetCacheDir` results)
- Removed redundant guards where subsequent assertions already cover existence
- `toHaveLength(N)` replaced `toBeDefined()` + `.length` checks on arrays
- `typeof` checks for dynamic integration test values (e.g., `expect(typeof firstSkill.id).toBe("string")`)

## Proposed Standard

Add to CLAUDE.md NEVER section or a testing standards doc:

- NEVER use `toBeDefined()` as a standalone assertion -- always assert the expected value or shape
- NEVER use `toBeDefined()` as a guard before property assertions -- the property assertion itself fails on undefined
- ALWAYS use `toStrictEqual()` for object comparisons per existing project standards
