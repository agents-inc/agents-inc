---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/skills/source-switcher.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-05
reporting_agent: web-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: source-switcher uses directoryExists checks; clean-code-standards rules 3.3/5.5 document the pattern
---

## What Was Wrong

`migrateLocalSkillScope` used a blanket `try/catch` around `copy`/`remove` operations, swallowing all errors including ENOENT when the source directory didn't exist. This masked a real bug: when a skill's scope was toggled project-to-global during `cc edit`, the skill copier had never physically placed files at the project path (because `local: true` with `localPath` pointing to HOME), so the copy failed silently. The user got no feedback that migration didn't happen.

## Fix Applied

Replaced the `try/catch` with explicit `directoryExists()` checks before attempting copy. Three outcomes are now handled distinctly:

1. Source exists: proceed with copy + remove (no catch needed)
2. Source missing but destination exists: log verbose "already at scope" and return
3. Neither exists: warn the user and return

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` a rule: "Do not use blanket `try/catch` to handle expected filesystem states. Use explicit existence checks (`directoryExists`, `fileExists`) before operations. Reserve `try/catch` for genuinely unexpected errors."
