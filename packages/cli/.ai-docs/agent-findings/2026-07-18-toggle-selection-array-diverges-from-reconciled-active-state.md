---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-07-18
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "toggleTechnology now derives newSelections from the post-reconcileSkillConfigs active state; toggleAgent collapse branch keeps the still-active agent in selectedAgents. Unit + E2E suites green."
---

## What Was Wrong

Two wizard-store toggle actions computed their UI selection array (`domainSelections`
for skills, `selectedAgents` for agents) **independently of and before** the reconciled
config state (`skillConfigs` / `agentConfigs`). On a deselect that collapses a persisted
dual-scope `[P][G]` entry, `reconcileSkillConfigs` / the agent collapse branch correctly
keep the skill/agent active via a single inherited-global entry — but the selection array
had already unconditionally dropped the id.

Because the grid derives a skill's `selected` flag from `domainSelections`
(`buildCategoriesForDomain` → `skill.selected`) and an agent's checkbox from
`selectedAgents` (`step-agents.tsx`, `isSelected = selectedAgents.includes(id)`), the
still-active row rendered as **unselected** in the same session — while its scope badge
(sourced from the config) kept rendering `G`. The two signals disagreed. The bug was
invisible after a save-and-reopen (hydration re-derives the selection from the saved
config), so it only manifested live, mid-edit, right after the keypress. The same
disconnect existed symmetrically on the skill and agent paths.

## Fix Applied

- `toggleTechnology`: compute `skillConfigs` (via `reconcileSkillConfigs`) first, then
  derive the final selection — if the deselected `technology` still has an active
  (non-excluded) project or global entry in the reconciled result, keep it in the
  selection array instead of dropping it. Genuine full removals (no surviving active
  entry) still drop normally. Reused the existing `hasProjectActive` / `hasGlobalActive`
  helpers.
- `toggleAgent`: the dual-scope collapse branch now keeps the still-active agent in
  `selectedAgents` (it leaves an active inherited-global entry in `agentConfigs`), mirroring
  the skill fix.
- Updated the four unit tests in `wizard-store.test.ts` that encoded the old (buggy)
  live-selection outcome. The two "round-trip" unit tests were rewritten to model the real
  supported flow (spacebar collapse → save-and-reopen → `s` scope-toggle restore), which is
  what `dual-scope-spacebar-reselect-restore.e2e.test.ts` exercises end-to-end; the old
  in-session double-spacebar "restore" only worked _because_ of the bug (the collapsed row
  appeared unselected, so a second spacebar was read as a re-select).

## Proposed Standard

When a toggle action both (a) maintains a derived UI selection array and (b) reconciles a
richer config/state structure, the selection array must be derived FROM the reconciled
result, not computed in parallel from pre-mutation state. Parallel computation lets the two
representations drift, producing render states where "selected" and the config-derived badge
disagree. Consider documenting this under a wizard-store section in the CLI docs
(`.ai-docs/DOCUMENTATION_MAP.md` → wizard/store state) so future toggle-style actions follow
the "reconcile first, then derive the view state" ordering.
