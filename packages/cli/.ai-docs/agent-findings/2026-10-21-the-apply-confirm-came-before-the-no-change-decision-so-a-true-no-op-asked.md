---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  edit --from measures carried skills with carriedSkillsThatDiffer before asking, decides
  hasAnyChanges first, and only then confirms; a no-op prints "No changes made." and exits 0
  without asking or writing (edit-from-says-what-it-did.test.ts, lifecycle/edit-noop-leaves-compiled-agents-untouched).
---

## What Was Wrong

`edit --from` asked its destructive-apply question before deciding whether anything changed
(`confirmAndWriteCarried` ran above `hasAnyChanges`), because a carried skill's files were only
known to change once written. So re-applying the installed configuration asked "Apply this
configuration?", rewrote every carried skill's files on a yes (new mtimes, same content), and then
said "No changes made." The question was about a write the run had not yet decided to make.

## Fix Applied

The write is measured, not performed, before asking: `carriedSkillsThatDiffer` runs it against
scratch copies. The no-change decision comes first; only carried skills that would change are
written, and a rewrite of an installed one is named under "Will be overwritten:".

## Proposed Standard

`clean-code-standards.md`, beside the confirm rules: a confirm comes after the run has decided it
has something to confirm. Anything the run would write that bears on that decision is measured
before the question, never written to find out.
