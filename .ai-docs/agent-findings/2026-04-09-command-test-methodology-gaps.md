---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/compile.test.ts
  - src/cli/lib/__tests__/commands/edit.test.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: compile.test.ts + init.test.ts output verification added
---

## What Was Wrong

Command test files had two methodology issues:

1. **compile.test.ts lacked output verification**: The compile command produces agent `.md` files in `.claude/agents/`, but no test verified that compiled files were actually written. Tests only checked flag acceptance (no "unknown flag" errors) and discovery output. The "should include a skill" test only asserted `output.toContain("1")` -- a vague assertion that could match any "1" in the output.

2. **edit.test.ts mock-wiring sections**: Several test sections (eject-mode skill fallback, detects added agents, copies newly added local skills) only verify that mocked functions were called with expected arguments (`expect(mockFn).toHaveBeenCalledWith(...)`). This tests the mock framework, not command behavior. However, since the edit command launches an interactive Ink wizard that cannot be driven programmatically via `runCliCommand`, these mock-based tests are the pragmatic approach for verifying internal orchestration logic.

3. **init.test.ts weak content assertion**: The "should not modify existing config" test only checked `isFile()` instead of verifying the file content was unchanged.

## Fix Applied

1. **compile.test.ts**: Added "compilation output" describe block with 3 tests that verify actual file system output:
   - Agent `.md` files are created in `.claude/agents/`
   - Agent files contain frontmatter with expected metadata
   - Output messages report discovery and compilation counts

   Strengthened the "Discovered 1 local skill" assertion (was `toContain("1")`). Removed duplicate "verbose mode" section. Replaced vacuous "plugin mode" section with meaningful error message assertion.

2. **init.test.ts**: Changed assertion from `isFile()` to `readFile` + content equality check.

## Proposed Standard

Add to `.ai-docs/standards/` (or CLAUDE.md testing section):

**Command test methodology rule**: Command tests must verify observable outcomes (files written, output produced, exit codes returned). Tests that only check `expect(mockFn).toHaveBeenCalledWith(...)` without also verifying actual command output are acceptable ONLY when the command launches interactive UI that cannot be driven programmatically. Even then, add a comment explaining why mock-wiring is the chosen approach.

**Assertion specificity rule**: Never assert `output.toContain("1")` or similar vague matchers. Use specific expected strings like `output.toContain("Discovered 1 local skill")`.
