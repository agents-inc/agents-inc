---
type: convention-drift
severity: low
affected_files:
  - e2e/pages/steps/agents-step.ts
  - e2e/lifecycle/dual-scope-agent-badge-and-s-inert.e2e.test.ts
  - src/cli/stores/wizard-store.ts
  - .ai-docs/reference/concepts/tombstone-pattern.md
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
superseded_by: 2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code.md
---

## What Was Wrong

A verification request assumed that pressing `s` (scope toggle) on a persisted
dual-scope `[P][G]` AGENT would flip the entry project→global and unconditionally
drop the tombstone, collapsing to a single active `{name, global}` entry (the
"P→G cleanup" documented in `tombstone-pattern.md`).

That is not the actual behavior for a **persisted** dual-scope agent.
`toggleAgentScope` (`src/cli/stores/wizard-store.ts`) has a guard: when the saved
snapshot (`installedAgentConfigs`) already carries a global tombstone AND the
current configs hold both a project-active entry and a global tombstone, `s` is a
guarded no-op that emits the toast `"Installed at both scopes — use space to
change project scope"`. The unconditional P→G tombstone drop only runs for a
within-session G→P→G round-trip (where the saved snapshot has no tombstone yet).
The sanctioned way to collapse a persisted `[P][G]` agent to global is SPACE
(deselect), not `s`. The skill side behaves identically (`toggleSkillScope`).

This intended distinction lived only in scattered inline comments across E2E
tests. There was also no structural E2E assertion that a dual-scope AGENT renders
both `[P]` and `[G]` badges (skills had `getScopeBadgesForSkill`; agents had no
equivalent), and no explicit "`s` is a no-op on a dual-scope agent" assertion
(only the collapse-via-SPACE end-state was covered, in
`agent-scope-toggle-agents-array.e2e.test.ts`).

## Fix Applied

Discovery + coverage (no source changes — verification-only task):

- Added `AgentsStep.getScopeBadgesForAgent()` to `e2e/pages/steps/agents-step.ts`,
  a structural badge reader mirroring `BuildStep.getScopeBadgesForSkill()`.
- Added `e2e/lifecycle/dual-scope-agent-badge-and-s-inert.e2e.test.ts` proving,
  via real `cc edit` runs + `loadProjectConfigFromDir`: (1) the dual-scope config
  shape, (2) both `[P][G]` badges render on re-open, (3) `s` on the persisted
  dual-scope agent is a guarded no-op (badges and on-disk config byte-identical
  after the toggle).

## Proposed Standard

`tombstone-pattern.md` already documents the unconditional P→G cleanup at the
store level, but its "State Transition Summary" table does not call out that,
for a **persisted** dual-scope pair reopened for edit, the `s` key is a guarded
no-op and SPACE is the collapse path. Add a short note to the "Scope: P→G" row
(or a dedicated subsection) making the persisted-vs-within-session distinction
explicit, so future tasks don't assume `s` collapses a persisted `[P][G]` agent.
