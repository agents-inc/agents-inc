---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-06
reporting_agent: orchestrator
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: toggleSkillScope filters !sc.excluded; tombstone semantics documented in CLAUDE.md
---

## What Was Wrong

`toggleSkillScope` in `wizard-store.ts` had two `.some()` checks on `installedSkillConfigs` that did not filter out excluded tombstone entries (`{ excluded: true }`). After Phase B (init with scope toggle), the project config contains excluded tombstones like `{id: "api-framework-hono", scope: "global", excluded: true}`. When Phase C (edit) loaded this config, these tombstones were treated as real global installations, which:

1. Incorrectly blocked project eject-to-global scope toggles (the guard thought a global eject already existed)
2. Incorrectly treated the skill as "was installed globally", causing unwanted tombstone manipulation logic to run

Additionally, the `dual-scope-edit-integrity.e2e.test.ts` test revealed a separate pre-existing bug: agent cross-contamination where `api-developer` agent includes `web-framework-react` in its skills list. This was previously masked by the ENOENT error that occurred earlier in the test flow.

## Fix Applied

Added `&& !sc.excluded` to both `.some()` predicates in `toggleSkillScope`:

- Line 919: `globalEjectInstalled` check now excludes tombstones
- Line 927: `wasInstalledGlobally` check now excludes tombstones

Updated `dual-scope-edit-scope-changes.e2e.test.ts`:

- Removed stale KNOWN BUG comment block (ENOENT fixed by D-152)
- Changed `it.fails` to `it` for the scope toggle test
- Updated assertion to check for project-scoped entries only (not blanket `not.toContain`)

Updated `dual-scope-edit-integrity.e2e.test.ts`:

- Updated `it.fails` description to reflect actual failure reason (agent cross-contamination, not ENOENT)

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` Scope Awareness section:

- ALWAYS filter out excluded tombstones (`!sc.excluded`) when querying `installedSkillConfigs` for scope or source checks. Tombstones are override markers, not real installations.
