---
type: anti-pattern
severity: low
affected_files:
  - e2e/interactive/edit-wizard-local.e2e.test.ts
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/patterns.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: fixes applied in two interactive test files
---

## What Was Wrong

Two minor anti-patterns found during methodology audit of all 10 interactive E2E test files:

1. **edit-wizard-local.e2e.test.ts line 72-73**: Used positional navigation (`navigateDown()` + `toggleFocusedSkill()`) instead of by-name navigation (`selectSkill("vitest")`). This is fragile -- adding a skill above vitest would break the test silently. The same file already used `selectSkill("vitest")` correctly on line 110.

2. **edit-wizard-excluded-skills.e2e.test.ts line 319**: Used hardcoded string `"skills"` in `path.join(projectDir, DIRS.CLAUDE, "skills", ...)` instead of using the `DIRS.SKILLS` constant.

## Fix Applied

1. Replaced `navigateDown()` + `toggleFocusedSkill()` with `selectSkill("vitest")` in edit-wizard-local.e2e.test.ts
2. Replaced `"skills"` string literal with `DIRS.SKILLS` constant in edit-wizard-excluded-skills.e2e.test.ts

Both test files continue to pass after the fixes.

## Proposed Standard

No new standard needed -- both violations are already documented:

- Index-based navigation is covered in anti-patterns.md ("Never use counted arrow presses to reach items")
- Hardcoded path segments are covered in anti-patterns.md ("Never use hardcoded path segments")

The existing rules are sufficient; these were just instances that slipped through.
