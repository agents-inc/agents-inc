---
type: anti-pattern
severity: high
affected_files:
  - src/cli/components/wizard/step-agents.tsx
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-22
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: D-277 (0.146.0) removed the precondition. `applyAgentToggle` now returns a clean removal on deselect instead of minting an `{ excluded: true }` tombstone, and `toggleAgent` refuses a globally-installed agent at project scope with the GLOBAL_AGENTS_LOCKED toast — so the "checkbox stays [✓] while the config gets a tombstone, with no toast" state is unreachable. Verified 2026-07-30 against `wizard-store.ts` (`applyAgentToggle`, `toggleAgent`, `nextSelectedAgents`, `buildAgentConfigForName`): no path leaves an agent in `selectedAgents` whose every `agentConfigs` entry is excluded. NOT adopted: the proposed shared `effectivelySelected` selector. `step-agents.tsx` still reads `selectedAgents.includes(...)` raw for the checkbox and `selectedAgents.length` for the continue count, while `toggleAgent` computes its own `isInList && !hasExcludedTombstone` — one rule, two implementations (Pattern O). Harmless only while the divergent state stays unreachable.
---

## What Was Wrong

In the edit wizard at the agents step, pressing space on a globally-installed agent (e.g. `web-architecture`) appeared to do nothing visually — the `[✓]` checkbox stayed checked, no highlight change, no toast. But the underlying config was correctly updated with an excluded tombstone, so on apply the agent really did uninstall.

Root cause: the `[✓]` checkbox render derives its state from `selectedAgents` alone:

```ts
// step-agents.tsx:259
const isSelected = selectedAgents.includes(row.agent.id);
const checkbox = isSelected ? "[✓]" : "[ ]";
```

But `toggleAgent` in `wizard-store.ts` (lines 1109-1124) deliberately preserves the agent in `selectedAgents` when toggling off a globally-installed agent — the exclusion is expressed as an `{ excluded: true }` tombstone in `agentConfigs`, not by removing from `selectedAgents`:

```ts
const isExcludedToggleOff = isSelected && wasInstalledGlobal;
return {
  selectedAgents: isExcludedToggleOff
    ? state.selectedAgents            // kept in list
    : ...filter/push logic,
  agentConfigs: updatedAgentConfigs,  // tombstone lives here
};
```

The render layer checks `selectedAgents` but the store stores the "effective selected" state across BOTH `selectedAgents` AND `agentConfigs.excluded`. The two representations are out of sync from the view's perspective.

This does not manifest in init mode because `effectiveInstalledConfigs` is nulled out for init (line 1097-1100), so `isExcludedToggleOff=false` and `selectedAgents` is actually filtered — the checkbox flips normally. The divergence exists only in edit mode when editing a global-scope install (i.e. `isEditingFromGlobalScope` users, or any edit with populated `installedAgentConfigs`).

Sibling rendering is already tombstone-aware: `step-agents.tsx:262-267` fetches `agentConfig` and `excludedConfig` for the scope badge. Only the `[✓]` / highlight pipeline ignores the tombstone.

The same hazard likely exists at line 258 for `isFocused` coloring and the "Continue with N agent(s)" counter at line 227-229 — `selectedCount = selectedAgents.length` also counts excluded tombstones as selected.

## Fix Applied

None — discovery only.

### Proposed code change

In `step-agents.tsx`, compute an `effectivelySelected` set that accounts for excluded tombstones, and use it for the checkbox and selected count:

```ts
const excludedAgentNames = new Set(agentConfigs.filter((ac) => ac.excluded).map((ac) => ac.name));
const effectivelySelectedAgents = selectedAgents.filter((a) => !excludedAgentNames.has(a));

// For each agent row:
const isSelected = selectedAgents.includes(row.agent.id) && !excludedAgentNames.has(row.agent.id);

// For the continue label:
const selectedCount = effectivelySelectedAgents.length;
```

Alternative: add a store selector `isAgentEffectivelySelected(name)` that encapsulates `selectedAgents.includes(name) && !agentConfigs.some(ac => ac.name === name && ac.excluded)` so every consumer stays in sync.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md` (or the tombstone semantics section referenced by finding `2026-04-06-excluded-tombstones-block-scope-toggle.md`):

- When `selectedAgents` / `selectedSkills` and `agentConfigs` / `skillConfigs` can disagree (an item appears in the selected list but has an `excluded: true` tombstone in the configs list because it is a globally-installed item being toggled off), the UI render layer MUST treat the tombstone as "not selected". Derive a single `effectivelySelected` set from both data sources and use it for every checkbox, highlight, count, and label. Do not read `selectedAgents.includes(...)` directly in a view.
- Consider exposing this as a Zustand selector (`isAgentEffectivelySelected`, `effectivelySelectedAgents`) so there is exactly one implementation of the rule.
