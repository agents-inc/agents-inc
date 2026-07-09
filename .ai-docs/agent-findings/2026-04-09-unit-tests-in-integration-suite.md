---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/integration/install-mode.integration.test.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: 12 mislabeled unit tests removed from install-mode integration file
---

## What Was Wrong

Two `describe` blocks in `install-mode.integration.test.ts` were pure unit tests mislabeled as integration tests:

1. **"Integration: detectMigrations with Config Data"** (6 tests) -- called `detectMigrations()` pure function with inline data, no file I/O, no multi-step chain. Already covered by `mode-migrator.test.ts`.
2. **"Integration: deriveInstallMode via Wizard Store"** (6 tests) -- called wizard store methods and checked return values, no file I/O, no multi-step chain. Already covered by `wizard-store.test.ts`.

These tests called a single function with mock data and checked the return value -- the definition of a unit test, not an integration test.

## Fix Applied

Removed both `describe` blocks (12 tests) from the integration test file. Also removed now-unused imports (`detectMigrations`, `useWizardStore`, `createMockMatrix`, `createMockMultiSourceSkill`, `createMockSkillSource`) and the `ZUSTAND_SKILL_ID` constant.

The test coverage is not lost -- these scenarios are already covered by unit tests in their respective modules.

## Proposed Standard

Add a rule to `.ai-docs/standards/` or CLAUDE.md:

> **Integration tests MUST chain multiple operations** (e.g., init -> compile -> check files, or load source -> resolve matrix -> verify skills). A test that calls a single function with mock data and checks the return value is a unit test -- put it in the module's co-located test file, not in the integration directory.

Criteria for integration test placement:

- Uses real file I/O (temp dirs, actual file writes/reads)
- Chains 2+ operations from different modules
- Assertions verify END STATE of the chain (files on disk, config shape), not just return values
