---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/config-generator.test.ts
  - src/cli/lib/loading/source-loader.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: strict assertions applied in config-generator + source-loader tests
---

## What Was Wrong

Five assertion anti-patterns found in high-value test files after a previous sweep replaced `toBeDefined` with `toStrictEqual`:

1. **Length-only assertions** (config-generator.test.ts): `splitConfigByScope` test checked `toHaveLength(2)` for global skills/agents without verifying which IDs ended up in which partition. An off-by-one routing bug would pass.

2. **Tautological dedup check** (config-generator.test.ts): `const uniqueAgents = new Set(config.agents); expect(config.agents.length).toBe(uniqueAgents.size)` passes even if deduplication logic is completely absent (when input has no duplicates to begin with). The test needs to verify the actual agent list.

3. **Self-referencing sort assertion** (config-generator.test.ts): `const sorted = [...config.agents].sort(); expect(config.agents).toStrictEqual(sorted)` compares output to a re-sorted copy of itself. If the function doesn't sort, this still passes when input happens to be sorted. Should assert a specific expected order.

4. **Structural type checks** (source-loader.test.ts): `typeof firstSkill.id === "string"` and `Array.isArray(firstStack.allSkillIds)` verify shape rather than actual values. These always pass for any valid skill/stack object.

5. **Count-only integration checks** (source-loader.test.ts): `categoryCount > 10` verifies quantity without checking any known category exists. The count assertion provides no signal if the wrong categories are loaded.

## Fix Applied

- Replaced length-only assertions with `.map(s => s.id).toStrictEqual([...])` for exact content verification
- Replaced tautological dedup/sort checks with explicit expected-value assertions using `buildAgentConfigs(["api-developer", "web-developer", "web-reviewer"])`
- Replaced structural type checks with `toStrictEqual(expect.objectContaining({...}))` using known fixture values
- Added specific category ID assertions alongside count checks
- Added stack content verification to "assigns all skills to all selectedAgents" test

## Proposed Standard

Add to CLAUDE.md testing rules:

**NEVER write assertions that can only pass** -- verify these patterns are absent:

- `toHaveLength(N)` without follow-up content checks on the same array
- `const sorted = [...result].sort(); expect(result).toStrictEqual(sorted)` (compare to explicit expected order instead)
- `new Set(result).size === result.length` (verify the actual list content instead)
- `typeof x.field === "string"` (verify actual field value instead)
- `count > N` without at least one specific item assertion
