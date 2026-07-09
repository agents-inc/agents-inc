---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - e2e/interactive/edit-wizard-local.e2e.test.ts
  - e2e/interactive/edit-wizard-plugin-operations.e2e.test.ts
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
  - e2e/lifecycle/unified-config-view.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/test-structure.md
date: 2026-04-13
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: shared expectNoDuplicates + EditWizard.completeFromBuild + ProjectBuilder.dualScopeWithImport
---

## What Was Wrong

Three duplicated patterns across E2E test files:

1. `expectNoDuplicates()` was defined identically in two lifecycle test files.
2. `completeEditFromBuild()` was a local function in two interactive test files and used inline 5 more times in a third.
3. `unified-config-view.e2e.test.ts` had 60+ lines of inline file construction (`mkdir`, `writeFile`) inside the `it()` block, violating the golden rule that tests never touch the filesystem directly.

## Fix Applied

1. Created `e2e/assertions/config-assertions.ts` with the shared `expectNoDuplicates()` function. Updated both lifecycle test files to import from it.
2. Added `completeFromBuild()` method to `EditWizard` class in `e2e/pages/wizards/edit-wizard.ts`. Updated 3 interactive test files (local, plugin-operations, excluded-skills) to use it. Removed all local function definitions.
3. Added `ProjectBuilder.dualScopeWithImport()` to `e2e/fixtures/project-builder.ts` to encapsulate the dual-scope-with-import setup. Rewrote `unified-config-view.e2e.test.ts` to use it, eliminating all inline file operations.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`:

- **Duplicated assertion helpers**: Any assertion function used in 2+ test files must be extracted to `e2e/assertions/`. Name the file after the concern (e.g., `config-assertions.ts`, `scope-assertions.ts`).
- **Duplicated wizard flows**: Common wizard navigation patterns (e.g., "complete edit from build step") must be methods on the wizard page object, not local functions in test files.
- **Inline file construction in `it()` blocks**: All file setup must go through `ProjectBuilder` static methods or `beforeEach` hooks. If `ProjectBuilder` doesn't support the scenario, extend it rather than inlining.
