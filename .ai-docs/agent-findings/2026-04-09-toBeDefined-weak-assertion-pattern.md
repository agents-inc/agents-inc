---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/config-generator.test.ts
  - src/cli/lib/configuration/config-merger.test.ts
  - src/cli/lib/configuration/__tests__/default-categories.test.ts
  - src/cli/lib/configuration/__tests__/default-rules.test.ts
  - src/cli/lib/configuration/__tests__/default-stacks.test.ts
  - src/cli/lib/configuration/__tests__/config-types-writer.test.ts
  - src/cli/lib/configuration/config-saver.test.ts
  - src/cli/lib/configuration/project-config.test.ts
  - src/cli/lib/__tests__/commands/compile.test.ts
  - src/cli/lib/__tests__/commands/doctor.test.ts
  - src/cli/lib/__tests__/commands/edit.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
  - src/cli/lib/__tests__/commands/help.test.ts
  - src/cli/lib/__tests__/commands/list.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 38+ toBeDefined replaced across 14 config/command test files
---

## What Was Wrong

38+ instances of `toBeDefined()` and weak conditional assertions used across 14 test files (8 configuration + 6 command). This pattern:

1. Only checks a value is not `undefined` or `null` -- does not verify shape, content, or correctness
2. Often paired with non-null assertions (`!`) on the next line to access properties, creating a two-step pattern that could be a single `toStrictEqual()`
3. Masks regressions: a function returning `{}` instead of `{ key: "value" }` still passes `toBeDefined()`

Common weak patterns found:

- `expect(config.stack).toBeDefined()` followed by `config.stack!["agent"]?.["category"]?.[0]?.id`
- `expect(entry).toBeDefined()` followed by `entry!.scope`
- `expect(content).toBeDefined()` before string content assertions

## Fix Applied

Replaced all `toBeDefined()` and weak assertions with stronger alternatives:

- `toStrictEqual({...exactShape})` for objects with known structure
- `toStrictEqual(generated.stack)` for round-trip tests comparing against source data
- `toContain()` for string content that was already validated by subsequent assertions
- `not.toBeNull()` for regex match results
- Removed redundant `toBeDefined()` when subsequent assertions already validate the value
- `toBe(EXIT_CODES.ERROR)` / `toBe(EXIT_CODES.INVALID_ARGS)` for oclif exit codes (command tests)
- `toStrictEqual([...expectedSkillIds])` for domain selection arrays (edit tests)
- `toStrictEqual({ skillId, contentHash, date, source })` with `expect.any(String)` for forkedFrom metadata (eject tests)
- Removed conditional assertion guards (`if (error) { expect... }`) in favor of unconditional assertions
- Replaced `expect(error).toBeUndefined()` with positive output assertions (`toContain`) where appropriate

## Proposed Standard

Add to CLAUDE.md under "NEVER do this > Test Data" section:

```
- NEVER use `toBeDefined()` or `not.toBeUndefined()` as standalone assertions -- use `toStrictEqual()` with exact expected value, or remove the guard when subsequent assertions already validate the value
```

This complements the existing rule "ALWAYS use `toStrictEqual` (not `toEqual`) for object and array comparisons" by also covering the weaker `toBeDefined` pattern.
