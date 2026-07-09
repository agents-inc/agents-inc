---
scope: reference
area: concepts
keywords:
  [
    tombstone,
    excluded,
    applySkillRemoval,
    applyAgentToggle,
    toggleSkillScope,
    toggleAgentScope,
    populateFromSkillIds,
    skill-agent-summary,
    slot-occupancy,
    dual-scope,
    D-223,
    D-224,
    D-230,
    D-232,
    D-233,
  ]
related:
  - reference/concepts/scope-system.md
  - reference/concepts/guard-pattern.md
  - reference/wizard/state-transitions.md
  - reference/config/configuration.md
  - reference/config/scope-split.md
  - reference/config/config-merger.md
  - reference/config/config-writer.md
  - reference/architecture/overview.md
last_validated: 2026-04-21
---

# Excluded Tombstone Pattern

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Cross-cutting concept.** Consolidates tombstone documentation from: `architecture-overview.md` (Section 12), `state-transitions.md` (`applySkillRemoval`, `applyAgentToggle`), `wizard-flow.md` (Scope Toggle Eject Guard), `configuration.md` (excluded entries in config writer), `config-merger.md` (compound-key reconciliation), `scope-split.md` (tombstone routing), and `skill-agent-summary.tsx` (slot-occupancy diff baseline).

## Overview

A **tombstone** is a config entry with shape `{ id, scope: "global", excluded: true }` (or `{ name, scope: "global", excluded: true }` for agents). It is **project-local state** that suppresses or shadows a shared global install without mutating the global config that other projects read.

A tombstone is always:

- At **`scope: "global"`** — project-scoped entries never need tombstones (they are just removed).
- Stored in the **project** config (`<projectDir>/.claude-src/config.ts`), never in `~/.claude-src/config.ts`. See [scope-split.md](../config/scope-split.md).
- A **slot occupant**: it holds the `(id, "global")` or `(name, "global")` slot in the config so the renderer and merger can distinguish "still installed globally, suppressed locally" from "removed entirely".

## Type Definitions

- `SkillConfig.excluded?: boolean` in `src/cli/types/config.ts`
- `AgentScopeConfig.excluded?: boolean` in `src/cli/types/config.ts`

## Dual-Scope Semantics (D-223)

A "dual-scope" shape is the pair:

```
[{ id: X, scope: "project", ... }, { id: X, scope: "global", excluded: true, ... }]
```

It means: **the global install of X is still on disk** (tombstone says so), **and this project overrides it with its own copy at project scope**. The UI renders this as `[P][G]` (primary scope = project; `secondaryScope` = global, computed from the tombstone).

The dual-scope pair is the only legitimate case where the same `id` appears twice in `skillConfigs`. Everywhere else the invariant is **"no active + tombstone at the same (id, scope)"** — enforced by `toggleSkillScope` P→G cleanup (see below).

## Lifecycle

### 1. Creation

| Trigger                                       | Function (`src/cli/stores/wizard-store.ts`) | Effect                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deselect a globally-installed skill           | `applySkillRemoval`                         | Filter keeps the entry iff `scope === "global" && installedIds.has(id)`; map stamps `excluded: true`.                                                     |
| Toggle off a globally-installed agent         | `applyAgentToggle`                          | Map stamps `excluded: true` on the matching global entry; does NOT remove from `selectedAgents`.                                                          |
| Scope toggle G→P on a globally-installed item | `toggleSkillScope` / `toggleAgentScope`     | Flips the existing entry's `scope` to `"project"`, then appends a new `{ scope: "global", excluded: true }` tombstone **only if `wasInstalledGlobally`**. |

**Guard on G→P creation:** The tombstone is gated on `wasInstalledGlobally` (computed from `installedSkillConfigs` / `installedAgentConfigs`). Fresh `cc init` G→P toggles must not create tombstones — there is no global install to shadow.

**Deselect creates only for globals.** `applySkillRemoval` does NOT tombstone project-scoped items — it removes them. `installedIds?.has(sc.id)` is the gate.

### 2. Preservation (D-223)

On wizard reopen, `populateFromSkillIds(skillIds, savedConfigs)` must preserve tombstones that accompany active entries. The function:

1. Resolves each `skillId` into the domain/category grid via `resolveSkillForPopulation`.
2. Builds `skillConfigs` from `savedConfigs` via `buildSkillConfigForId` (**preferring project-scoped entries over global when duplicates exist**).
3. Appends `savedConfigs.filter((sc) => sc.excluded)` to the result.

The final `skillConfigs` therefore carries both halves of every dual-scope pair. Without this preservation step, reopening a project with `[P][G]` state would strip the tombstone and collapse the dual-scope rendering to just `[P]`.

**Invariant:** `populateFromSkillIds` is the only function that reads `savedConfigs` — it is the hydration boundary. Every other store action starts from the already-hydrated `skillConfigs`.

### 3. Cleanup

| Trigger                                | Function                                | Rule                                                                                                                                  |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Re-select a deselected skill           | `reconcileSkillConfigs`                 | Looks for `sc.id === id && sc.excluded`; clears `excluded` flag (restores active state).                                              |
| Re-toggle an excluded agent            | `applyAgentToggle`                      | Same — clears `excluded` on the matching tombstone.                                                                                   |
| Scope toggle P→G (undo an earlier G→P) | `toggleSkillScope` / `toggleAgentScope` | **Unconditionally** filters out any tombstone at the same `(id, "global")` / `(name, "global")`. Not gated on `wasInstalledGlobally`. |
| Restore domain (re-toggle domain on)   | `restoreSkillConfigs`                   | Maps over configs, clears `excluded` on restored ids.                                                                                 |

**D-224 invariant — unconditional P→G cleanup.** The P→G branch in `toggleSkillScope` / `toggleAgentScope` **always** drops any same-key tombstone:

```ts
updatedConfigs = updatedConfigs.filter((sc) => !(sc.id === skillId && sc.excluded));
```

It is **not** gated on `wasInstalledGlobally`. Gating was the D-224 bug: `wasInstalledGlobally` is computed from `installedSkillConfigs` which has `!sc.excluded` filters applied upstream, so after a G→P that produced a tombstone, the next P→G saw `wasInstalledGlobally === false` and left the tombstone in place. The result was an orphan tombstone with no active counterpart — the renderer hid the skill entirely. Unconditional removal heals the active-entry-at-global invariant: an active entry at the scope supersedes any tombstone at the same scope.

## Interaction with the Config Pipeline

Tombstones must survive every hop from wizard-store to disk:

1. **`mergeConfigs` (compound key)** — keys skills by `` `${id}:${scope}${excluded ? ":excluded" : ""}` `` and agents by `` `${name}:${scope}${excluded ? ":excluded" : ""}` ``. Dual-scope pairs land at different keys and both survive. A P→G that drops the tombstone also works here: `newConfig` has `id:global` active but not `id:global:excluded`, so the existing tombstone row is dropped because its name/id is "in new" but its compound key is not. See [config-merger.md](../config/config-merger.md).
2. **`splitConfigByScope`** — routes tombstones to the **project** split (not global). This is why `mergeGlobalConfigs` never sees a tombstone and does not need tombstone-handling logic. See [scope-split.md](../config/scope-split.md) "Tombstone Routing Rationale".
3. **`mergeGlobalConfigs`** — additive, ignores any `excluded` on the incoming side. Tombstones are project-local.
4. **`generateProjectConfigWithInlinedGlobal`** (`config-writer.ts`) — Excluded global entries (tombstones) replace their active global counterparts in the **inlined global section** of the project config. The active project entry appears separately in the project section. Both are preserved in the snapshot (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`.

## Role in the Info-Panel Diff (D-230 / D-232)

`src/cli/components/wizard/skill-agent-summary.tsx` computes a diff between `installedSkillConfigs` / `installedAgentConfigs` (baseline) and the current `skillConfigs` / `agentConfigs`. The rendering uses three classes: `+` (new), `-` (removed), `~` (source changed), `•` (unchanged).

**Tombstones are first-class baseline entries.** The baseline is NOT pre-filtered on `!excluded`:

```ts
const skillDiffBaseline = installedSkillConfigs ?? null;
const prevSkillKeySet = new Set(skillDiffBaseline.map((s) => `${s.id}:${s.scope}`));
```

**Slot-occupancy match for `removedSkills`.** A baseline entry is considered removed only if **nothing** — active OR tombstone — occupies that slot in current:

```ts
const removedSkills = skillDiffBaseline.filter(
  (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
);
```

A current tombstone at the same `(id, scope)` keeps the slot occupied — dual-scope indicator, not a removal.

**Why it matters:**

- **D-230** — G→P toggle on a pre-existing global install emits `[{X, project}, {X, global, excluded: true}]`. Without slot-occupancy, the baseline global slot looked empty (tombstone ignored) and the renderer flagged the global as removed → spurious `- React` in the Global section. With slot-occupancy, the tombstone occupies the slot → correctly rendered as `• React` (unchanged global install, silenced locally).
- **D-232** — On reopen, saved config carries the same dual-scope shape. Without slot-occupancy, `prevSkillKeySet` lacked the `X:global` key (baseline pre-filter stripped the tombstone) → tombstone rendered via `uniqueExcludedGlobalSkills` with `isNew=true` → spurious `+ React` on a long-installed global. With slot-occupancy, baseline keeps the tombstone → key present → no `+`.

**Supporting collections:**

- `prevSourceMap` still filters to **active** baseline entries — tombstones don't track a live install source for `~` diff.
- `inheritedGlobalSkills` filters to active baseline entries — a tombstone in baseline isn't an install.
- `uniqueExcludedGlobalSkills` dedups the current tombstone row against `inheritedGlobalSkills` so the Global section never shows two rows for the same skill.

See finding `.ai-docs/agent-findings/2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md` for the full derivation.

## UI Indicators

When a tombstone coexists with an active entry of a different scope, dual-scope badges are shown:

- **Build step** (`CategoryGrid` / `CategoryOption`): `CategoryOption.secondaryScope` renders a second `[G]` / `[P]` badge next to the primary scope badge.
- **Agents step** (`StepAgents`): Computes `secondaryScope` from excluded entries with different scope from the active agent entry.
- **Confirm step** (`SkillAgentSummary`): renders tombstone as `•` in the Global section alongside the project `+` — the D-223/D-230 dual-scope diff shape.

## `toggleSkillScope` Undo Path

`toggleSkillScope` checks for existing excluded entries to allow undo of prior scope overrides. When an excluded tombstone exists for a skill, the scope-toggle guard bypasses the "project eject → global would overwrite" block (`"Already exists as ejected skill at global scope"`) because the tombstone indicates the toggle is undoing a prior G→P rather than creating a new collision.

## `toggleFilterIncompatible` Interaction

`toggleFilterIncompatible` (removes incompatible web skills when enabling the framework-first filter) operates via `applySkillRemoval`, which preserves globally-installed tombstones. A filter toggle therefore cannot inadvertently clear a tombstone — the global install remains shadowed.

## State Transition Summary

| Operation            | Project-scoped item                                 | Globally-installed item          | Not installed globally         |
| -------------------- | --------------------------------------------------- | -------------------------------- | ------------------------------ |
| Deselect skill       | Remove from configs                                 | Set `excluded: true` (tombstone) | Remove from configs            |
| Toggle agent off     | Remove normally                                     | Set `excluded: true` (tombstone) | Remove from configs            |
| Scope: G→P           | N/A                                                 | Flip to project + add tombstone  | Flip to project (no tombstone) |
| Scope: P→G           | Flip to global + drop any tombstone (unconditional) | Flip to global + drop tombstone  | Flip to global                 |
| Re-select tombstoned | N/A                                                 | Clear `excluded` flag            | N/A                            |

## Known Gap — D-233 (Spacebar on Dual-Scope)

Spacebar on a `[P][G]` skill dispatches `toggleTechnology`, which calls `applySkillRemoval`. With `configs = [{X, project}, {X, global, excluded: true}]` and `removed = {X}`, `applySkillRemoval` drops the active project entry but keeps the tombstone (because `installedIds.has(X)` is true) — producing an orphan tombstone `[{X, global, excluded: true}]`. The user's intent ("drop only the project half, keep global visible") is not expressed in the saved shape; on reopen the row either disappears (if `loadEditContext` filters tombstones) or renders as a pure-global row that cannot be re-added to project scope. See `todo/D-233-dual-scope-spacebar-toggle.md`.

This gap means `applySkillRemoval` does not yet have a "dual-scope branch" — it treats any `installedIds.has(id)` as "tombstone it" regardless of whether a same-id active entry at a different scope already exists.

## Anchors

- `applySkillRemoval`, `applyAgentToggle`, `reconcileSkillConfigs`, `restoreSkillConfigs`, `buildSkillConfigForId`, `populateFromSkillIds`, `toggleSkillScope`, `toggleAgentScope`, `toggleAgent`, `toggleTechnology`, `toggleFilterIncompatible` — `src/cli/stores/wizard-store.ts`.
- `SkillAgentSummary`, `skillDiffBaseline`, `prevSkillKeySet`, `removedSkills`, `uniqueExcludedGlobalSkills`, `inheritedGlobalSkills` — `src/cli/components/wizard/skill-agent-summary.tsx`.
- `mergeConfigs` compound keys — `src/cli/lib/configuration/config-merger.ts`.
- `splitConfigByScope` tombstone routing — `src/cli/lib/configuration/config-generator.ts`.
- `generateProjectConfigWithInlinedGlobal` — `src/cli/lib/configuration/config-writer.ts`.

## Findings That Shaped This Doc

| Finding                                                  | Contribution                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `2026-04-06-excluded-tombstones-block-scope-toggle.md`   | Undo path in `toggleSkillScope`.                               |
| `2026-04-06-agent-merge-key-mismatch-with-skills.md`     | Compound-key alignment between skills and agents.              |
| `2026-04-07-re-scoped-skill-duplicate-rows.md`           | Dual-scope row-collision rules in the renderer.                |
| `2026-04-17-d224-ptog-tombstone-not-cleared.md`          | Empirically established "unconditional P→G cleanup" invariant. |
| `2026-04-17-merger-authoritative-for-names-semantic.md`  | `mergeConfigs` authoritative-on-name semantic.                 |
| `2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md` | Slot-occupancy matching in `skill-agent-summary.tsx`.          |

> **See also:** [concepts/scope-system.md](./scope-system.md) for full scope system documentation; [config/scope-split.md](../config/scope-split.md) for tombstone routing; [config/config-merger.md](../config/config-merger.md) for compound-key reconciliation.
