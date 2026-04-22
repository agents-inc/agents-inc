---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/commands/edit.md
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: reference/commands/edit.md rewritten to follow run() private-method decomposition; Invariants + Writer Selection sections added; last_validated: 2026-04-21 confirmed
---

## What Was Wrong

`reference/commands/edit.md` described the edit flow as a flat list of operations (`detectProject`, `loadSource`, `discoverAllPluginSkills`, ...) while the actual `run()` method in `edit.tsx` orchestrates private methods (`loadContext`, `runEditWizard`, `applyMigrations`, `applyScopeChanges`, `applySourceChanges`, `applyPluginChanges`, `copyNewLocalSkills`, `writeConfigAndCompile`, `cleanupStaleAgentFiles`, `logCompletionSummary`).

Concretely drifted:

- Missing the **no-change exit path** guarded by `hasAnyChanges(changes)`. This path skips `writeConfigAndCompile`, so tests that complete a wizard with no changes see stale or absent `config.ts` -- the observed Scenario B ENOENT race.
- Missing the **D-229 hard-error interrupt** after `applyPluginChanges` when `pluginResult.failed.length > 0`. Doc was silent on the "no orphan config" invariant.
- Missing the **writer selection split** inside `writeScopedConfigs`: project context routes through `regenerateConfigTypes` (emits global-aware project types), home context uses `writeStandaloneConfigTypes` directly (D-228).
- Step ordering was wrong (migrations before scope changes; cleanup after compile, not before).
- `copyLocalSkills` referenced as the private method name; actual private method is `copyNewLocalSkills`.

## Fix Applied

Rewrote the Flow section to follow `run()`'s exact order (15 steps keyed to the private methods it calls), added a dedicated Invariants section covering orphan-config-on-failure, plugin install intent, no-change exit, and once-only excluded filtering. Added a "Writer Selection Inside `writeProjectConfig`" subsection distinguishing home-context vs project-context branches. Bumped `last_validated` and the staleness dashboard entry.

## Proposed Standard

Add to `standards/documentation-bible.md` under command-reference docs:

> Command reference docs MUST follow the `run()` method's private-method decomposition when one exists. Describe each private method in the order `run()` calls it. Name the private method, summarize its side effects, and note any hard-error interrupts or early-return guards. Operations (from `lib/operations/index.ts`) are called out as "Operation: `opName()`" inline within the private method that invokes them -- not as top-level flow steps.

Also add an "Invariants" section as a required heading for any command reference doc that has hard-error paths, early returns, or failure modes that affect persisted state -- so drift like "doc doesn't say what happens when plugin install fails" is caught in review.
