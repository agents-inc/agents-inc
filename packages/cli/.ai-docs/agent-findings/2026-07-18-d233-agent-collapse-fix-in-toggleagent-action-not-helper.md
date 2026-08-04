---
type: convention-drift
severity: low
affected_files:
  - src/cli/stores/wizard-store.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - e2e/lifecycle/dual-scope-agent-badge-and-s-inert.e2e.test.ts
standards_docs:
  - .ai-docs/reference/wizard/store-map.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: "Both proposed doc touch-ups landed. (1) `reference/store-map.md` -> Internal Helpers now describes `applyAgentToggle` as the leaf add/remove helper that never mints a tombstone, names `restoreDualScopeAgent` as `toggleAgent`'s restore half, and records that the collapse half moved to `toggleAgentScope`'s `s` toggle rather than a helper (D-260); the `toggleAgent` action row documents its guards. `reference/wizard/store-map.md` is a pointer stub to that file. (2) `reference/concepts/tombstone-pattern.md` cross-links the guards and states that neither `applySkillRemoval` nor `applyAgentToggle` stamps `excluded` (D-277). The wrong-layer misdiagnosis this finding warned about can no longer be reached from either doc. Note the finding's quoted `toggleAgent` guard is itself now stale: D-260 made spacebar inert on a live `[P][G]` pair (GLOBAL_AGENTS_LOCKED toast) instead of collapsing it — which strengthens rather than weakens the finding's conclusion that the behaviour never lived in the helper."
supersedes: 2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code.md
---

## What Was Wrong

A verification request asserted that the D-233 AGENT-side dual-scope collapse was
"still broken" because `applyAgentToggle` (the private helper in
`src/cli/stores/wizard-store.ts`, ~lines 211-233) has no dual-scope branch — no
"project active AND global tombstone both present → drop both, re-surface as
inherited-global" logic. The reasoning examined `applyAgentToggle` in isolation
and concluded that SPACE / toggle-off on a persisted `[P][G]` agent must produce
an orphan tombstone.

That conclusion is false for the current tree. The dual-scope collapse for agents
does not live in the `applyAgentToggle` helper — it lives one layer up in the
`toggleAgent` **action**, which short-circuits BEFORE `applyAgentToggle` is ever
reached:

```
// toggleAgent action, guard evaluated first:
if (!state.isEditingFromGlobalScope &&
    agentHasProjectActive(state.agentConfigs, agent) &&
    agentHasGlobalTombstone(state.agentConfigs, agent)) {
  return { selectedAgents: ...filter(agent),
           agentConfigs: [...filter(agent), { name: agent, scope: "global" }] };
}
```

This mirrors the skill path's layering exactly: on the skill side the collapse is
also driven above the leaf helper (the reconcile/`applySkillRemoval` path), not
inside a single toggle helper. So `applyAgentToggle` correctly has no dual-scope
branch — by design that case never reaches it. Examining the helper alone gives a
false "still broken" signal; the fix is at the action boundary.

Empirically confirmed (no source changes; verification-only) by running the exact
repro against a freshly built binary:

- `agent-scope-toggle-agents-array.e2e.test.ts` Scenario A — sets up a persisted
  dual-scope `[P][G]` api-developer, deselects it via SPACE (`toggleAgent`), and
  asserts the config collapses to a single `{ name: "api-developer", scope:
"global" }` with NO project row, NO global tombstone, and NO duplicate
  `(name, scope)` pairs. PASS (3/3 in the file).
- `dual-scope-agent-badge-and-s-inert.e2e.test.ts` Checks 1+2 — persisted
  `[P][G]` structural shape via `loadProjectConfigFromDir` and both `[P][G]`
  badges rendering on re-open. PASS (2/2 in the file).

No orphan tombstone is produced. The D-233 agent-side symptom is not reproducible.

## Fix Applied

None — discovery only (verification-only task; no source, test, or docs edited).
No new `it.fails` test was written: the behavior is correct, so an `it.fails`
would misrepresent reality and would itself fail (the assertions pass). Coverage
already exists and passes (the two files above), so no redundant test was added.

## Proposed Standard

Two doc touch-ups would prevent this recurring "wrong-layer" misdiagnosis:

1. In `.ai-docs/reference/wizard/store-map.md` Internal Helpers, add an explicit
   note on `applyAgentToggle`: it is the leaf add/remove helper and intentionally
   has NO dual-scope collapse branch — the `[P][G] → [G]` collapse and the
   inherited-global `[G] → [P][G]` restore are handled by the `toggleAgent`
   ACTION's two D-233 guards, which run before `applyAgentToggle`. Mirror the same
   note for `applySkillRemoval` vs the skill toggle action, so the two paths read
   as symmetric.

2. Cross-link both guard predicates (`agentHasProjectActive(agentConfigs) &&
agentHasGlobalTombstone(agentConfigs)` for collapse; the `agentHasGlobalActive
&& !agentHasProjectActive && !selectedAgents.includes && agentHasGlobalTombstone
(installed)` for restore) from `tombstone-pattern.md` so a reader tracing "where
   does dual-scope collapse happen for agents" lands on the action, not the helper.
