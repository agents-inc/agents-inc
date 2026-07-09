---
type: convention-drift
severity: medium
affected_files:
  - e2e/lifecycle/local-lifecycle.e2e.test.ts
  - e2e/lifecycle/plugin-lifecycle.e2e.test.ts
  - e2e/lifecycle/global-scope-lifecycle.e2e.test.ts
  - e2e/lifecycle/cross-scope-lifecycle.e2e.test.ts
  - e2e/lifecycle/dual-scope-edit-integrity.e2e.test.ts
  - e2e/lifecycle/source-switching-modes.e2e.test.ts
  - e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/source-switching-per-skill.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-04-09
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: constants + matcher migration applied; D-168 audit
---

## What Was Wrong

Lifecycle E2E tests had three recurring methodology violations:

1. **Hardcoded `"Uninstall complete!"`** in 3 files instead of `STEP_TEXT.UNINSTALL_SUCCESS`
2. **Hardcoded `"agents"` / `"skills"` path segments** in `path.join` calls across 6 files instead of `DIRS.AGENTS` / `DIRS.SKILLS`
3. **Direct filesystem access in `it()` blocks** where custom matchers exist (`toHaveCompiledAgentContent`, `toHaveSkillCopied`) -- found in dual-scope-edit-integrity, cross-scope-lifecycle, local-lifecycle, and others

Additionally, 2 files (`re-edit-cycles`, `dual-scope-edit-integrity`) were missing `import "../matchers/setup.js"` which registers custom matchers. The `dual-scope-edit-integrity` file was fixed with the import; `re-edit-cycles` performs detailed duplicate-detection analysis on raw config content which no existing matcher covers.

## Fix Applied

- Replaced `"Uninstall complete!"` with `STEP_TEXT.UNINSTALL_SUCCESS` in 3 files
- Replaced `"agents"` with `DIRS.AGENTS` and `"skills"` with `DIRS.SKILLS` in path.join calls across 6 files
- Replaced `fileExists` + `readTestFile` + manual content assertions in `dual-scope-edit-integrity` test 1 with `toHaveCompiledAgentContent` matcher
- Replaced `fileExists` + `path.join` skill path assertions in `dual-scope-edit-integrity` test 3 with `toHaveSkillCopied` matcher
- Added missing `import "../matchers/setup.js"` to `dual-scope-edit-integrity`

## Proposed Standard

The `DIRS` constants documentation in `e2e/pages/constants.ts` and `.ai-docs/standards/e2e/anti-patterns.md` should explicitly list `DIRS.AGENTS` and `DIRS.SKILLS` as required replacements for `"agents"` and `"skills"` path segments. Currently the anti-patterns doc only mentions `".claude"`, `".claude-src"`, `"config.ts"`, `"SKILL.md"` as examples of hardcoded path segments to avoid, but omits subdirectory names like `"agents"` and `"skills"`.
