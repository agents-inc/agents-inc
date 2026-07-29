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
    D-227,
    D-230,
    D-232,
    D-233,
    D-260,
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
last_validated: 2026-07-24
---

# Excluded Tombstone Pattern

**Last Updated:** 2026-07-24
**Last Validated:** 2026-07-24

> **Cross-cutting concept.** Consolidates tombstone documentation from: `architecture-overview.md` (Section 12), `state-transitions.md` (`applySkillRemoval`, `applyAgentToggle`), `wizard-flow.md` (Scope Toggle Eject Guard), `configuration.md` (excluded entries in config writer), `config-merger.md` (compound-key reconciliation), `scope-split.md` (tombstone routing), and `scope-diff.ts` / `skill-agent-summary.tsx` (slot-occupancy diff baseline).

## Overview

A **tombstone** is a config entry with shape `{ id, scope: "global", excluded: true }` (or `{ name, scope: "global", excluded: true }` for agents). It is **project-local state** that suppresses or shadows a shared global install without mutating the global config that other projects read.

A tombstone is always:

- At **`scope: "global"`** — project-scoped entries never need tombstones (they are just removed).
- Stored in the **project** config (`<projectDir>/.claude-src/config.ts`), never in `~/.claude-src/config.ts`. See [scope-split.md](../config/scope-split.md).
- A **slot occupant**: it holds the `(id, "global")` or `(name, "global")` slot in the config so the renderer and merger can distinguish "still installed globally, suppressed locally" from "removed entirely".

**Tombstones are only created when editing FROM project scope** (`isEditingFromGlobalScope === false`). Because a tombstone is project-local state that shadows a global install for _this_ project, it is meaningless when the config being edited IS the global config. When editing FROM global scope (`cc edit` at `~/`, `isEditingFromGlobalScope === true`), there is no project overlay, so a deselect is a **genuine removal** — the skill/agent is dropped entirely, never tombstoned. This keeps the invariant "tombstones never appear in `~/.claude-src/config.ts`" true even during a global-context edit (D-233). Skills and agents behave symmetrically here: `applySkillRemoval` receives `null` for its installed-configs argument when editing from global scope (via `reconcileSkillConfigs` / `toggleDomain` / `toggleFilterIncompatible`), exactly as `toggleAgent` nulls `effectiveInstalledConfigs`.

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

> **Known limitation (D-227, open):** preselection can transiently break the same-scope half of this invariant. When the ONLY saved entry for a name/id is a global-scope excluded tombstone and it is then re-included by preselection, `buildSkillConfigForId` / `buildAgentConfigForName` emit a fresh `{ scope: "global" }` **active** entry while `collectTombstones` also preserves the `{ scope: "global", excluded: true }` tombstone — a same-scope active + tombstone pair. `mergeConfigs`'s compound key keys them distinctly, so both survive to `config.ts`. Not yet collapsed downstream. See `.ai-docs/agent-findings/2026-07-17-d227-same-scope-active-tombstone-duplicate.md`.

## Lifecycle

### 1. Creation

All creation rows below assume the wizard is editing **FROM project scope**. Editing FROM global scope never creates a tombstone (see the Overview and the scope-awareness note below the table).

| Trigger                                       | Function (`src/cli/stores/wizard-store.ts`) | Effect                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deselect a globally-installed skill           | `applySkillRemoval`                         | Filter keeps the entry iff `scope === "global" && installedIds.has(id)`; map stamps `excluded: true`.                                                     |
| Toggle off a globally-installed agent         | `applyAgentToggle`                          | Map stamps `excluded: true` on the matching global entry; does NOT remove from `selectedAgents`.                                                          |
| Scope toggle G→P on a globally-installed item | `toggleSkillScope` / `toggleAgentScope`     | Flips the existing entry's `scope` to `"project"`, then appends a new `{ scope: "global", excluded: true }` tombstone **only if `wasInstalledGlobally`**. |

**Guard on G→P creation:** The tombstone is gated on `wasInstalledGlobally` (computed from `installedSkillConfigs` / `installedAgentConfigs`). Fresh `cc init` G→P toggles must not create tombstones — there is no global install to shadow.

**Deselect creates only for globals, and only from project-scope edits.** `applySkillRemoval` does NOT tombstone project-scoped items — it removes them. `installedIds?.has(sc.id)` is the gate. When editing FROM global scope, `installedIds` is `null` (the caller passes `null` for the installed configs), so no branch tombstones — the skill is removed outright (D-233). The same holds for `applyAgentToggle`, which receives `null` for `effectiveInstalledConfigs` in a global-scope edit.

### 2. Preservation (D-223)

On wizard reopen, `populateFromSkillIds(skillIds, savedConfigs)` must preserve tombstones that accompany active entries. The function:

1. Resolves each `skillId` into the domain/category grid via `resolveSkillForPopulation`.
2. Builds `skillConfigs` from `savedConfigs` via `buildSkillConfigForId` (**preferring project-scoped entries over global when duplicates exist**).
3. Appends every excluded tombstone via `collectTombstones(savedConfigs ?? [])` (`configs.filter((entry) => entry.excluded)`) to the result.

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

`computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts` computes a diff between `installedSkillConfigs` / `installedAgentConfigs` (baseline) and the current `skillConfigs` / `agentConfigs`; `skill-agent-summary.tsx` calls it and renders the rows. The diff uses four `DiffRowStatus` classes: `+` (`added`), `-` (`removed`), `~` (`source-changed`), `•` (`unchanged`).

**Tombstones are first-class baseline entries.** The baseline (`installedSkillConfigs`) is NOT pre-filtered on `!excluded` when building the previous-key set:

```ts
const prevSkillKeySet = installedSkillConfigs
  ? new Set(installedSkillConfigs.map((s) => `${s.id}:${s.scope}`))
  : null;
```

**Slot-occupancy match for `removedSkills`.** A baseline entry is considered removed only if **nothing** — active OR tombstone — occupies that slot in current:

```ts
const removedSkills = installedSkillConfigs
  ? installedSkillConfigs.filter(
      (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
    )
  : [];
```

A current tombstone at the same `(id, scope)` keeps the slot occupied — dual-scope indicator, not a removal.

**Why it matters:**

- **D-230** — G→P toggle on a pre-existing global install emits `[{X, project}, {X, global, excluded: true}]`. Without slot-occupancy, the baseline global slot looked empty (tombstone ignored) and the renderer flagged the global as removed → spurious `- React` in the Global section. With slot-occupancy, the tombstone occupies the slot → correctly rendered as `• React` (unchanged global install, silenced locally).
- **D-232** — On reopen, saved config carries the same dual-scope shape. Without slot-occupancy, `prevSkillKeySet` lacked the `X:global` key (baseline pre-filter stripped the tombstone) → tombstone rendered via `uniqueExcludedGlobalSkills` with `isNew=true` → spurious `+ React` on a long-installed global. With slot-occupancy, baseline keeps the tombstone → key present → no `+`.

**Supporting collections:**

- `prevSourceMap` still filters to **active** baseline entries — tombstones don't track a live install source for `~` diff.
- `inheritedGlobalSkills` filters to active baseline entries — a tombstone in baseline isn't an install.
- `uniqueExcludedGlobalSkills` dedups the current tombstone row against `inheritedGlobalSkills` so the Global section never shows two rows for the same skill.

The standalone D-230/D-232 finding file was removed in a findings cleanup; its derivation is retained in this section and mirrored in [`component-patterns.md`](../component-patterns.md) (the "Diff baseline (D-230 / D-232)" and "Slot-occupancy removal match" notes). `reference/findings-impact-report.md` carries only the aggregate rollup for the surrounding tombstone finding cluster, not the derivation.

## UI Indicators

When a tombstone coexists with an active entry of a different scope, dual-scope badges are shown:

- **Build step** (`CategoryGrid` / `CategoryOption`): `CategoryOption.secondaryScope` renders a second `G` / `P` badge next to the primary scope badge.
- **Agents step** (`StepAgents`): derives the secondary badge via `deriveScopeBadges(agentConfig, excludedConfig)` + `formatScopeTag()` from `src/cli/lib/wizard/scope-diff.ts` — a tombstone at the other scope renders as the secondary badge.
- **Confirm step** (`SkillAgentSummary`): renders tombstone as `•` in the Global section alongside the project `+` — the D-223/D-230 dual-scope diff shape.

## `toggleSkillScope` / `toggleAgentScope` — `s` Is the Sole Dual-Scope Toggle

`s` (scope toggle) is the **only** key that changes a dual-scope `[P][G]` pair, and it round-trips both ways regardless of whether the pair came from the hydration snapshot or was built this session (D-260). The pre-D-260 persisted-pair guard and its session-rebuilt-pair state tracking no longer exist.

1. **`[P][G]` → `[G]`** — `s` moves the active project entry to global and **unconditionally drops** the excluded global tombstone (`toggleSkillScope` / `toggleAgentScope` P→G branch). The row collapses to a single read-only inherited-global `[G]`.

2. **`[G]` → `[P][G]`** — `s` moves the active global entry back to project and **re-adds** the excluded global tombstone. The tombstone re-appears because `wasInstalledGlobally` counts an existing global entry in `installedSkillConfigs` / `installedAgentConfigs` (active OR tombstone) as "installed globally", so the restored pair is a genuine `[P][G]`, not a bare `[P]` that would lose the still-real global install (D-224).

(Verified in `e2e/lifecycle/dual-scope-s-round-trip-space-inert.e2e.test.ts`, `dual-scope-collapse-and-restore-via-s.e2e.test.ts`, and `dual-scope-agent-badge-and-s-collapse.e2e.test.ts`.)

**SPACE is inert on a live dual-scope row (D-260).** Spacebar (`toggleTechnology` / `toggleAgent`) on a live `[P][G]` pair is a no-op that emits the global-locked toast — `GLOBAL_SKILLS_LOCKED` for skills, `GLOBAL_AGENTS_LOCKED` for agents — and leaves the badges unchanged. The dual-scope arm is `isSelected && isDualScopePair(skillConfigs, id)` on the skill path (bypassed in init and global-scope edit) and `isDualScopeAgentPair(agentConfigs, agent)` on the agent path (bypassed only in global-scope edit). A radio (exclusive) swap whose current selection is a live `[P][G]` pair is refused the same way, so a swap can never collapse a dual-scope row.

**Eject-collision undo bypass (separate guard):** the `"Already exists as ejected skill at global scope"` block in `toggleSkillScope` has its own undo path — when an excluded tombstone for the same skill id is present in `skillConfigs`, the guard allows the project-eject→global toggle because the tombstone proves the toggle is undoing a prior G→P rather than creating a new collision.

## `toggleFilterIncompatible` Interaction

`toggleFilterIncompatible` (removes incompatible web skills when enabling the framework-first filter) operates via `applySkillRemoval`. When editing FROM project scope it preserves globally-installed skills as tombstones, so a filter toggle cannot inadvertently drop a shadowed global install. When editing FROM global scope it passes `null` for the installed configs, so incompatible global skills are removed outright (no tombstone), consistent with all other removal paths (D-233).

## State Transition Summary

The "Globally-installed item" column depends on the editing context. Editing FROM **project** scope shadows the shared global install with a tombstone; editing FROM **global** scope (`cc edit` at `~/`, `isEditingFromGlobalScope === true`) has no overlay, so the item is removed outright — never tombstoned (D-233). Skills and agents behave identically.

| Operation            | Project-scoped item                                 | Globally-installed item (from project scope) | Globally-installed item (from global scope) | Not installed globally         |
| -------------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------ |
| Deselect skill       | Remove from configs                                 | Set `excluded: true` (tombstone)             | Remove from configs (clean uninstall)       | Remove from configs            |
| Toggle agent off     | Remove normally                                     | Set `excluded: true` (tombstone)             | Remove from configs (clean uninstall)       | Remove from configs            |
| Deselect domain      | Remove from configs                                 | Set `excluded: true` (tombstone)             | Remove from configs (clean uninstall)       | Remove from configs            |
| Scope: G→P           | N/A                                                 | Flip to project + add tombstone              | N/A (scope toggle disabled at global scope) | Flip to project (no tombstone) |
| Scope: P→G           | Flip to global + drop any tombstone (unconditional) | Flip to global + drop tombstone              | N/A (scope toggle disabled at global scope) | Flip to global                 |
| Re-select tombstoned | N/A                                                 | Clear `excluded` flag                        | N/A (no tombstone was created)              | N/A                            |

> **Dual-scope `[P][G]` pairs:** the "Scope: G→P" / "Scope: P→G" rows apply uniformly — `s` round-trips a `[P][G]` pair both ways (D-260), whether it came from the snapshot or was built this session. SPACE (deselect) is **inert** on a live `[P][G]` row (emits the global-locked toast), so `s` is the only key that changes the project half. See "`toggleSkillScope` / `toggleAgentScope` — `s` Is the Sole Dual-Scope Toggle" above. Skills and agents behave identically.

## D-233 — Dual-Scope Spacebar + Scope-Aware Removal (Resolved)

Two related behaviors, now implemented in `applySkillRemoval` / `reconcileSkillConfigs` and their agent equivalents:

1. **Dual-scope removal branch.** `applySkillRemoval` recognises a `[P][G]` pair: with `configs = [{X, project}, {X, global, excluded: true}]` and `removed = {X}`, it drops **both** the active project entry and the stale tombstone, then re-surfaces a single inherited-global entry `{X, global}` so the row collapses to a read-only `[G]`. This fires on the paths that route through `applySkillRemoval` — domain-deselect (`toggleDomain`) and incompatible-filter (`toggleFilterIncompatible`). **Spacebar no longer triggers this branch** for a live `[P][G]` row: `toggleTechnology`'s dual-scope arm makes spacebar inert (D-260), and the sanctioned collapse is `s` (`toggleSkillScope` dropping the tombstone), not `applySkillRemoval`. The `reconcileSkillConfigs` restore branch still re-creates both the project entry and the tombstone when a globally-tombstoned skill is re-added, restoring `[P][G]`. This is the D-223 dual-scope pair's mirror on the removal path.

2. **Scope-aware removal (no tombstone at global scope).** When editing FROM global scope, `reconcileSkillConfigs`, `toggleDomain`, and `toggleFilterIncompatible` pass `null` for the installed configs into `applySkillRemoval`, so a deselect (or domain-deselect, or incompatible-filter) removes the global skill outright instead of tombstoning it. This mirrors `toggleAgent`'s `effectiveInstalledConfigs = null` handling and preserves the invariant that tombstones never reach `~/.claude-src/config.ts`.

The merge layer needs no tombstone-specific handling for either behavior: a fully-absent skill is dropped by `mergeConfigs`'s presence/absence + authoritative-scope logic (`"all"` for a global-context edit, `"owned"` for a project-context edit). See `todo/D-233-dual-scope-spacebar-toggle.md`.

## Anchors

- `applySkillRemoval`, `applyAgentToggle`, `reconcileSkillConfigs`, `restoreSkillConfigs`, `buildSkillConfigForId`, `populateFromSkillIds`, `toggleSkillScope`, `toggleAgentScope`, `toggleAgent`, `toggleTechnology`, `toggleFilterIncompatible` — `src/cli/stores/wizard-store.ts`.
- `computeScopeDiff`, `prevSkillKeySet`, `prevSourceMap`, `removedSkills`, `uniqueExcludedGlobalSkills`, `inheritedGlobalSkills`, `deriveScopeBadges`, `formatScopeTag` — `src/cli/lib/wizard/scope-diff.ts`.
- `SkillAgentSummary` (renders `computeScopeDiff` output) — `src/cli/components/wizard/skill-agent-summary.tsx`.
- `mergeConfigs` compound keys — `src/cli/lib/configuration/config-merger.ts`.
- `splitConfigByScope` tombstone routing — `src/cli/lib/configuration/config-generator.ts`.
- `generateProjectConfigWithInlinedGlobal` — `src/cli/lib/configuration/config-writer.ts`.

## Findings That Shaped This Doc

The pre-2026-07 finding files below were removed in a findings cleanup and consolidated into `reference/findings-impact-report.md`; they are listed here for provenance only (the standalone paths no longer resolve). The 2026-07 findings are still standalone files.

| Finding                                                                  | Contribution                                                                                                                                           | Status        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `2026-04-06-excluded-tombstones-block-scope-toggle.md`                   | Undo path in `toggleSkillScope`.                                                                                                                       | consolidated  |
| `2026-04-06-agent-merge-key-mismatch-with-skills.md`                     | Compound-key alignment between skills and agents.                                                                                                      | consolidated  |
| `2026-04-07-re-scoped-skill-duplicate-rows.md`                           | Dual-scope row-collision rules in the renderer.                                                                                                        | consolidated  |
| `2026-04-17-d224-ptog-tombstone-not-cleared.md`                          | Empirically established "unconditional P→G cleanup" invariant.                                                                                         | consolidated  |
| `2026-04-17-merger-authoritative-for-names-semantic.md`                  | `mergeConfigs` authoritative-on-name semantic.                                                                                                         | consolidated  |
| `2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md`                 | Slot-occupancy matching in `skill-agent-summary.tsx`.                                                                                                  | consolidated  |
| `2026-07-17-d227-same-scope-active-tombstone-duplicate.md`               | Same-scope active + tombstone preselection duplicate (known limitation).                                                                               | open file     |
| `2026-07-18-scope-guards-read-stale-hydration-snapshot.md`               | Live-config tombstone arm on blanket guards; `wasInstalledGlobally` counts tombstones. (Its session-rebuilt-pair tracking was later removed by D-260.) | resolved file |
| `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code.md`           | Documented the (now-removed) persisted-pair `s` no-op; **superseded by D-260**, which made `s` the sole dual-scope toggle and spacebar inert.          | superseded    |
| `2026-07-18-d233-agent-collapse-fix-in-toggleagent-action-not-helper.md` | Agent dual-scope collapse/restore lives in the `toggleAgent` action, not `applyAgentToggle`.                                                           | drift file    |

> **See also:** [concepts/scope-system.md](./scope-system.md) for full scope system documentation; [config/scope-split.md](../config/scope-split.md) for tombstone routing; [config/config-merger.md](../config/config-merger.md) for compound-key reconciliation.
