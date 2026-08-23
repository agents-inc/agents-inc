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
    buildCompileAgents,
    dual-scope,
  ]
related:
  - reference/concepts/scope-system.md
  - reference/concepts/guard-pattern.md
  - reference/wizard/state-transitions.md
  - reference/features/configuration.md
  - reference/config/scope-split.md
  - reference/config/config-merger.md
  - reference/config/config-writer.md
  - reference/architecture-overview.md
  - reference/types/core-types.md
last_validated: 2026-07-30
---

# Excluded Tombstone Pattern

> **Cross-cutting concept.** Consolidates tombstone documentation from: `architecture-overview.md` (Section 12), `state-transitions.md` (`applySkillRemoval`, `applyAgentToggle`), `wizard-flow.md` (Scope Toggle Eject Guard), `configuration.md` (excluded entries in config writer), `config-merger.md` (compound-key reconciliation), `scope-split.md` (tombstone routing), and `scope-diff.ts` / `skill-agent-summary.tsx` (slot-occupancy diff baseline).

## Overview

A **tombstone** is a config entry with shape `{ id, scope: "global", excluded: true }` (or `{ name, scope: "global", excluded: true }` for agents). It is **project-local state** that suppresses or shadows a shared global install without mutating the global config that other projects read.

Exactly two routes emit it, and they emit the same byte-identical shape: the global half of a dual-scope `[P][G]` pair (wizard store, via the `s` scope toggle), or a **derived conflict mask** synthesized at write time. **Deselection is no longer a route.** See [Mask vs. Tombstone](#mask-vs-tombstone--terminology) immediately below for the two senses and the provenance rule — that section is the single place the distinction is defined; do not restate it elsewhere.

A tombstone is always:

- At **`scope: "global"`** — project-scoped entries never need tombstones (they are just removed).
- Stored in the **project** config (`<projectDir>/.claude-src/config.ts`), never in `~/.claude-src/config.ts`. See [scope-split.md](../config/scope-split.md).
- A **slot occupant**: it holds the `(id, "global")` or `(name, "global")` slot in the config so the renderer and merger can distinguish "still installed globally, suppressed locally" from "removed entirely".

## Mask vs. Tombstone — Terminology

Two senses of the same persisted shape. **They are byte-identical on disk.** Use the right word: the docs, the changelog and the source all distinguish them, and a rule written for one is wrong for the other.

| Term                      | What it is                                                                                                      | Who writes it                                                                               | Where it lives      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| **Tombstone** (umbrella)  | The persisted shape `{ id \| name, scope: "global", excluded: true }`. A slot occupant.                         | Either producer below.                                                                      | Project config only |
| **Dual-scope half**       | The global half of a `[P][G]` pair. Always accompanied by an **active project entry of the same id**.           | The wizard store, via the `s` scope toggle (G→P) — `toggleSkillScope` / `toggleAgentScope`. | Project config only |
| **Derived conflict mask** | A hide-this-global directive synthesized at write time because a live global entry collides with project state. | `reconcileProjectSplitAgainstGlobal` in `src/cli/lib/config-gate/propagate.ts`.             | Project config only |

**Neither ever appears in `~/.claude-src/config.ts`.** Masking is applied to the project split only; the global config passed into reconciliation is read, never rewritten.

**Provenance is not recorded on disk — it is _inferred from the collision_.** There is no marker field. What makes the inference sound is a construction argument rather than data:

1. No store path can mint a **bare** tombstone. A project-scope deselect of a globally-installed skill or agent is refused with a toast; `applySkillRemoval` and `applyAgentToggle` no longer stamp `excluded` at all; a domain deselect drops only what the project owns.
2. The one remaining user route (`s`, G→P) **always** pairs the tombstone with an active project entry for the same id — that is, an identity collision.
3. Therefore **every bare tombstone is system-derived by construction**, and a single retention test suffices: keep it iff the collision that would re-derive it still holds.

**Do not narrow the retention rule to `exclusive && required` categories.** That narrowing is only sound while a derived mask and a deliberate user exclusion are indistinguishable on disk, and they no longer are — a bare tombstone is unreachable from the store. Narrowing it back leaves a mask outliving its collision forever in an _optional_ exclusive category.

> **Consequence for tests:** a fixture asserting that an `excluded: true` entry survives a write must set up the thing that justifies it — an active project-scoped entry for the same id/name (identity), or an active project skill in the same matrix-declared `exclusive` category. A bare tombstone with no collision is by definition orphaned and the self-heal drops it.

**Tombstones are only created when editing FROM project scope** (`isEditingFromGlobalScope === false`). Because a tombstone is project-local state that shadows a global install for _this_ project, it is meaningless when the config being edited IS the global config. When editing FROM global scope (`cc edit` at `~/`, `isEditingFromGlobalScope === true`), there is no project overlay, so a deselect is a **genuine removal** — the skill/agent is dropped entirely, never tombstoned. This keeps the invariant "tombstones never appear in `~/.claude-src/config.ts`" true even during a global-context edit. `applySkillRemoval` receives `null` for its installed-configs argument when editing from global scope (via `reconcileSkillConfigs` / `toggleDomain`), which makes every removed id droppable; at project scope the same argument identifies what the project merely inherits and may not touch.

## Type Definitions

- `SkillConfig.excluded?: boolean` in `src/cli/types/config.ts`
- `AgentScopeConfig.excluded?: boolean` in `src/cli/types/config.ts`

## Dual-Scope Semantics

A "dual-scope" shape is the pair:

```
[{ id: X, scope: "project", ... }, { id: X, scope: "global", excluded: true, ... }]
```

It means: **the global install of X is still on disk** (tombstone says so), **and this project overrides it with its own copy at project scope**. The UI renders this as `[P][G]` (primary scope = project; `secondaryScope` = global, computed from the tombstone).

The dual-scope pair is the only legitimate case where the same `id` appears twice in `skillConfigs`. Everywhere else the invariant is **"no active + tombstone at the same (id, scope)"** — enforced by `toggleSkillScope` P→G cleanup (see below) and by the slot test in Preservation below. `reference/concepts/scope-system.md` owns the statement of that invariant across both axes.

## Lifecycle

### 1. Creation

All creation rows below assume the wizard is editing **FROM project scope**. Editing FROM global scope never creates a tombstone (see the Overview and the scope-awareness note below the table).

| Trigger                                       | Function (`src/cli/stores/wizard-store.ts`) | Effect                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope toggle G→P on a globally-installed item | `toggleSkillScope` / `toggleAgentScope`     | Flips the existing entry's `scope` to `"project"`, then appends a new `{ scope: "global", excluded: true }` tombstone **only if `wasInstalledGlobally`**. |

**Guard on G→P creation:** The tombstone is gated on `wasInstalledGlobally` (computed from `installedSkillConfigs` / `installedAgentConfigs`). Fresh `cc init` G→P toggles must not create tombstones — there is no global install to shadow.

**Deselection creates nothing.** The two former creation rows — "Deselect a globally-installed skill" (`applySkillRemoval`) and "Toggle off a globally-installed agent" (`applyAgentToggle`) — no longer exist. A project-scope deselect of a globally-installed item is **refused** by the guards in `toggleTechnology` / `toggleAgent`, and the removal helpers themselves no longer stamp `excluded`:

- `applySkillRemoval` drops what the project **owns** (project-scoped entries, and the project's own global tombstone) and leaves an inherited global-active entry **byte-identical**. It never mints a tombstone.
- `applyAgentToggle`'s deselect branch is now a plain removal — every deselect that reaches it is one the project owns.

So the `s` scope toggle is the only wizard route to a tombstone, and it always pairs it with an active project entry. To keep a global skill out of a project, curate the agents' stacks instead of deselecting it — see the editing-config guide on the documentation site (`apps/www/src/content/docs/docs/guides/editing-config.md`).

### 1b. Creation outside the wizard — derived conflict masks

The wizard-store rows above are no longer the only creation site. `reconcileProjectSplitAgainstGlobal` (`src/cli/lib/config-gate/propagate.ts`) runs immediately before **both** project-config write sites — `propagateGlobalChangesToProjects` and the project branch of `writeScopedFromWizard`, which share the single `writeProjectConfigPair` writer — and synthesizes a tombstone (a **derived conflict mask**) when a live global entry collides with the project's own state:

| Collision                                                                                                                  | Helper                                                    | Effect                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The project owns the **same id** active at project scope (skills and agents)                                               | `maskCollidingGlobalSkills` / `maskCollidingGlobalAgents` | Appends `{ ...globalEntry, excluded: true }` so the pair renders `[P][G]`.                                                                                 |
| The project owns a **different** active skill in the same **exclusive** category (skills only — agents have no categories) | `maskCollidingGlobalSkills`                               | Masks the global entry; the project-owned skill wins locally. This mask has NO active project sibling — it is the one legitimately "bare" tombstone shape. |

**The collision predicate is shared.** `buildProjectCollisionTest(projectOwnedSkills, matrix)` returns an `(id: SkillId) => boolean` used by BOTH the mask producer and the self-heal, so the two can never disagree about what a mask means. It answers true when either:

- **Identity** — `id` is in the set of ids the project holds `isActiveAt(entry, "project")`; or
- **Category** — `categoryOfSkill(id, matrix)` is in the set of categories occupied by an active project-scoped skill AND `isExclusiveCategory(category, matrix)`.

Supporting rules, each verified in `config-gate/propagate.ts`:

| Rule                             | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotent                       | `alreadyTombstoned` set skips any id/name the project already tombstones, so re-running the write is a no-op.                                                                                                                                                                                                                                                                                                                                                                               |
| Exclusivity read from the matrix | `isExclusiveCategory` is `matrix.categories[category]?.exclusive === true` — the **merged** matrix, so a source repo's category overrides win.                                                                                                                                                                                                                                                                                                                                              |
| Absent category never masks      | Strict `=== true`. The wizard's **toggle handler** defaults the same lookup the other way (`matrix.categories[categoryId]?.exclusive ?? true` in `src/cli/components/hooks/use-build-step-props.ts`); masking deliberately does **not**, because a rule that masks **persisted** entries must only fire on a category the data actually carries. An absent FIELD is not a case either one handles — `exclusive` is a non-optional `boolean` at every producer and at both parse boundaries. |
| Never throws on custom skills    | `categoryOfSkill` returns `undefined` for an id the matrix has no entry for, and for the `local` pseudo-category — neither participates in category rules.                                                                                                                                                                                                                                                                                                                                  |
| Mask inherits the global origin  | The mask is `{ ...globalEntry, excluded: true }`, spread from the global entry, so it carries the global install's `origin` (the `SkillConfig` field; `SkillReference.source` is the compiler-side twin).                                                                                                                                                                                                                                                                                   |
| Global config never written      | Masking applies to the project split only; `globalConfig` is a read-only input.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Self-heal ordered first          | `reconcileProjectSplitAgainstGlobal` runs `dropOrphanedDerivedMasks` / `dropOrphanedDerivedAgentMasks` **before** masking on both axes, so a cleared mask is removed rather than immediately re-derived, and `alreadyTombstoned` only sees masks that are still warranted.                                                                                                                                                                                                                  |

**Self-heal (generalised):** `dropOrphanedDerivedMasks` (skills) and `dropOrphanedDerivedAgentMasks` (agents) run **before** masking and drop a mask whose collision has cleared. Both key on the _same_ collision test the mask producer uses — `buildProjectCollisionTest` for skills (identity, or an active project skill in the same exclusive category), active-project-name identity for agents — so producer and self-heal can never disagree about what a mask means. The old `exclusive && required` narrowing is gone: with deselection no longer able to author a bare tombstone (see Creation above), there is no "deliberate exclusion" left to resurrect, so a mask is retained on exactly one test — the collision that would re-derive it.

**What that narrowing bought, and why it stopped being needed.** A derived mask and a user-authored tombstone are byte-identical on disk — both `{ id, scope: "global", excluded: true }` — yet they need opposite treatment on the next write: the tombstone must be preserved for as long as the global install exists, while the mask must not outlive the collision that produced it. A self-heal that cannot tell them apart either resurrects a skill the user deliberately deselected, or leaves a project that removed its own framework skill with no framework at all, permanently. Scoping the self-heal to categories declared BOTH `exclusive` and `required` bought the distinction by category CLASS rather than by a marker on the shape: the only-skill guard refuses to empty such a category, so a lone tombstone there could only be machine-derived. The price was that in an OPTIONAL exclusive category the mask persisted after the collision cleared, and the user had to re-select by hand. Once a bare tombstone became unauthorable, the mask was provably machine-derived in every category and that price stopped being worth paying.

The project-owned-wins rule is deliberately asymmetric with the guard where a user-initiated radio swap refuses to displace a globally-locked skill: a mask is applied when a global install lands on pre-existing project state, where letting the global win would silently uninstall the user's own skill.

### 2. Preservation

On wizard reopen, `populateFromSkillIds(skillIds, savedConfigs)` must preserve tombstones that accompany active entries. The function:

1. Resolves each `skillId` into the domain/category grid via `resolveSkillForPopulation`.
2. Builds `skillConfigs` from `savedConfigs` via `buildSkillConfigForId` (**preferring project-scoped entries over global when duplicates exist**).
3. Appends the saved tombstones whose `(id, scope)` slot the rebuild left free, via `skillTombstonesOutsideRebuild(savedConfigs ?? [], skillConfigs)` — `collectTombstones` (`configs.filter((entry) => entry.excluded)`) narrowed by the slots `skillConfigs` now occupies. A tombstone sitting where the rebuild has just placed an active entry silences nothing and is dropped.

The final `skillConfigs` therefore carries both halves of every dual-scope pair, and never a same-scope pair. Without the preservation step, reopening a project with `[P][G]` state would strip the tombstone and collapse the dual-scope rendering to just `[P]`; without the slot narrowing, a lone global tombstone re-included by preselection would be written alongside the fresh global active entry that replaced it.

**Invariant:** `populateFromSkillIds` is the only function that reads `savedConfigs` — it is the hydration boundary. Every other store action starts from the already-hydrated `skillConfigs`.

### 3. Cleanup

| Trigger                                | Function                                | Rule                                                                                                                                  |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Re-select a deselected skill           | `reconcileSkillConfigs`                 | Looks for `sc.id === id && sc.excluded`; clears `excluded` flag (restores active state).                                              |
| Re-toggle an excluded agent            | `applyAgentToggle`                      | Same — clears `excluded` on the matching tombstone.                                                                                   |
| Scope toggle P→G (undo an earlier G→P) | `toggleSkillScope` / `toggleAgentScope` | **Unconditionally** filters out any tombstone at the same `(id, "global")` / `(name, "global")`. Not gated on `wasInstalledGlobally`. |
| Restore domain (re-toggle domain on)   | `restoreSkillConfigs`                   | Maps over configs, clears `excluded` on restored ids.                                                                                 |

**Invariant — unconditional P→G cleanup.** The P→G branch in `toggleSkillScope` / `toggleAgentScope` **always** drops any same-key tombstone:

```ts
updatedConfigs = updatedConfigs.filter((sc) => !(sc.id === skillId && sc.excluded));
```

**Do not gate it on `wasInstalledGlobally`.** That flag is computed from `installedSkillConfigs`, which has `!sc.excluded` filters applied upstream, so after a G→P that produced a tombstone the next P→G reads `wasInstalledGlobally === false` and leaves the tombstone in place — an orphan tombstone with no active counterpart, which the renderer hides entirely. Unconditional removal holds the invariant: an active entry at a scope supersedes any tombstone at the same scope.

## Interaction with the Config Pipeline

Tombstones must survive every hop from wizard-store to disk:

1. **`mergeConfigs` (compound key)** — keys skills by `` `${id}:${scope}${excluded ? ":excluded" : ""}` `` and agents by `` `${name}:${scope}${excluded ? ":excluded" : ""}` ``. Dual-scope pairs land at different keys and both survive. A P→G that drops the tombstone also works here: `newConfig` has `id:global` active but not `id:global:excluded`, so the existing tombstone row is dropped because its name/id is "in new" but its compound key is not. See [config-merger.md](../config/config-merger.md).
2. **`splitConfigByScope`** — routes tombstones to the **project** split (not global). This is why `mergeGlobalConfigs` never sees a tombstone and does not need tombstone-handling logic. See [scope-split.md](../config/scope-split.md) "Tombstone Routing Rationale".
3. **`mergeGlobalConfigs`** — additive, ignores any `excluded` on the incoming side. Tombstones are project-local.
4. **`generateProjectConfigWithInlinedGlobal`** (`config-writer.ts`) — Excluded global entries (tombstones) replace their active global counterparts in the **inlined global section** of the project config. The active project entry appears separately in the project section. Both are preserved in the snapshot (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`.
5. **`buildCompileAgents`** (`installation/local-installer.ts`) — **A tombstone must already be gone by the time a config reaches this function, and nothing inside it enforces that.** It builds `sourceById`, a `Map<SkillId, string>` from `config.skills` keyed by **id alone**, so a dual-scope pair — active project entry plus global tombstone, each carrying its own `origin` — collapses last-write-wins onto one value, which then decides that skill's compiled reference format through `SkillReference.source` and `pluginRefFor`. The guard is entirely **caller-side**: `recompileAgents` is its only production caller and calls `filterExcludedEntries` first, which is the path every command takes through the operations-layer `compileAgents`. A new caller that assembles a config itself and hands it straight in re-opens the collapse silently. Why the collapse is nonetheless unreachable today, and the ordering that would make it benign even unfiltered, is [`features/compilation-pipeline.md` § Dual-Scope `sourceById` Collapse](../features/compilation-pipeline.md#dual-scope-sourcebyid-collapse----verified-unreachable-in-production) — that section owns the analysis; this entry owns the invariant a tombstone author has to honour.

## Role in the Info-Panel Diff

`computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts` computes a diff between `installedSkillConfigs` / `installedAgentConfigs` (baseline) and the current `skillConfigs` / `agentConfigs`; `skill-agent-summary.tsx` calls it and renders the rows. The diff uses four `DiffRowStatus` classes: `+` (`added`), `-` (`removed`), `~` (`mode-changed`), `•` (`unchanged`).

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

- **G→P toggle on a pre-existing global install** emits `[{X, project}, {X, global, excluded: true}]`. Without slot-occupancy the baseline global slot reads empty (tombstone ignored) and the renderer flags the global as removed → spurious `- React` in the Global section. With it, the tombstone occupies the slot → `• React` (unchanged global install, silenced locally).
- **On reopen**, saved config carries the same dual-scope shape. Without slot-occupancy `prevSkillKeySet` lacks the `X:global` key (a baseline pre-filter strips the tombstone) → the tombstone renders via `uniqueExcludedGlobalSkills` with `isNew=true` → spurious `+ React` on a long-installed global. With it, the baseline keeps the tombstone → key present → no `+`.

**So: never pre-filter the diff baseline on `!excluded`.**

**Supporting collections:**

- `prevSourceMap` still filters to **active** baseline entries — tombstones don't track a live install source for `~` diff.
- `inheritedGlobalSkills` filters to active baseline entries — a tombstone in baseline isn't an install.
- `uniqueExcludedGlobalSkills` dedups the current tombstone row against `inheritedGlobalSkills` so the Global section never shows two rows for the same skill.

## UI Indicators

When a tombstone coexists with an active entry of a different scope, dual-scope badges are shown:

- **Build step** (`CategoryGrid` / `CategoryOption`): `CategoryOption.secondaryScope` renders a second `G` / `P` badge next to the primary scope badge.
- **Agents step** (`StepAgents`): derives the secondary badge via `deriveScopeBadges(agentConfig, excludedConfig)` + `formatScopeTag()` from `src/cli/lib/wizard/scope-diff.ts` — a tombstone at the other scope renders as the secondary badge.
- **Confirm step** (`SkillAgentSummary`): renders tombstone as `•` in the Global section alongside the project `+` — the dual-scope diff shape.
- **Sources step** (`SourceGrid`, rows from `buildSourceRows`): a **collapsed** `[P][G]` pair renders **two rows** for the same skill — the surviving global row (locked when the snapshot holds an active global entry) plus a red pending-removal row under Project for the slot the collapse emptied. Both rows are inert. This holds for both collapse shapes: a persisted project-entry-plus-global-tombstone pair, and an active entry at both scopes. It mirrors the confirm step's `-` at Project / `•` at Global, because both surfaces key removal on the `(id, scope)` slot. A snapshot **tombstone** whose slot is empty never produces a Sources removal row (dropping a mask deletes nothing) — deliberately narrower than `computeScopeDiff`.

## `toggleSkillScope` / `toggleAgentScope` — `s` Is the Sole Dual-Scope Toggle

`s` (scope toggle) is the **only** key that changes a dual-scope `[P][G]` pair, and it round-trips both ways regardless of whether the pair came from the hydration snapshot or was built this session. The persisted-pair guard and its session-rebuilt-pair state tracking no longer exist.

1. **`[P][G]` → `[G]`** — `s` moves the active project entry to global and **unconditionally drops** the excluded global tombstone (`toggleSkillScope` / `toggleAgentScope` P→G branch). The row collapses to a single read-only inherited-global `[G]`.

2. **`[G]` → `[P][G]`** — `s` moves the active global entry back to project and **re-adds** the excluded global tombstone. The tombstone re-appears because `wasInstalledGlobally` counts an existing global entry in `installedSkillConfigs` / `installedAgentConfigs` (active OR tombstone) as "installed globally", so the restored pair is a genuine `[P][G]`, not a bare `[P]` that would lose the still-real global install.

(Verified in `e2e/lifecycle/dual-scope-s-round-trip-space-inert.e2e.test.ts`, `dual-scope-collapse-and-restore-via-s.e2e.test.ts`, and `dual-scope-agent-badge-and-s-collapse.e2e.test.ts`.)

**SPACE on a live dual-scope row: skills drop the project half, agents refuse.** On the SKILL path spacebar (`toggleTechnology`) collapses the pair through `applySkillRemoval` — the project half goes, the inherited global entry it masked surfaces in its place, and the global install is neither uninstalled nor tombstoned. The deselect lock (`isGloballyLockedSkill`) covers global-owned halves only. On the AGENT path spacebar (`toggleAgent`) is still a no-op emitting `GLOBAL_AGENTS_LOCKED`, via the `isDualScopeAgentPair(agentConfigs, agent)` arm (bypassed only in global-scope edit), so `s` remains the only key that changes a dual-scope agent. A radio (exclusive) swap whose current selection is a live `[P][G]` skill pair is still refused (`blocksExclusiveSwap`): dropping the project half sideways would unmask the global install beside the new pick, seating two active skills in a category that permits one.

**Eject-collision undo bypass (separate guard):** the `"Already exists as ejected skill at global scope"` block in `toggleSkillScope` has its own undo path — when an excluded tombstone for the same skill id is present in `skillConfigs`, the guard allows the project-eject→global toggle because the tombstone proves the toggle is undoing a prior G→P rather than creating a new collision.

## State Transition Summary

The "Globally-installed item" column depends on the editing context. From **project** scope a globally-installed item is **immutable**: the removal is refused, and nothing in the config changes. Editing FROM **global** scope (`cc edit` at `~/`, `isEditingFromGlobalScope === true`) has no overlay, so the item is removed outright — never tombstoned. Skills and agents behave identically.

| Operation            | Project-scoped item                                 | Globally-installed item (from project scope)        | Globally-installed item (from global scope) | Not installed globally         |
| -------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| Deselect skill       | Remove from configs                                 | Unchanged — refused, `GLOBAL_SKILLS_LOCKED` toast   | Remove from configs (clean uninstall)       | Remove from configs            |
| Toggle agent off     | Remove normally                                     | Unchanged — refused, `GLOBAL_AGENTS_LOCKED` toast   | Remove from configs (clean uninstall)       | Remove from configs            |
| Deselect domain      | Remove from configs                                 | Unchanged — view filter only, entry survives intact | Remove from configs (clean uninstall)       | Remove from configs            |
| Scope: G→P           | N/A                                                 | Flip to project + add tombstone                     | N/A (scope toggle disabled at global scope) | Flip to project (no tombstone) |
| Scope: P→G           | Flip to global + drop any tombstone (unconditional) | Flip to global + drop tombstone                     | N/A (scope toggle disabled at global scope) | Flip to global                 |
| Re-select tombstoned | N/A                                                 | Clear `excluded` flag (restores the `[P][G]` pair)  | N/A (no tombstone was created)              | N/A                            |

> **Why "Deselect domain" differs from "Deselect skill".** A domain deselect is a **view filter**, not a refusal: it hides the domain and drops the project-scoped entries the project owns there, leaving every inherited global entry untouched. It has no toast because it is not refusing anything — it simply has no authority over the global install. This is a **store invariant**, not a user-visible flow: the DOMAINS step is init-only and unreachable from `cc edit` (which hydrates at `build` with empty history), and a project `cc init` that finds a global install routes to the dashboard → `edit`. So no keypress path exists where a domain deselect can see a globally-installed entry — the guarantee is pinned at unit level in `wizard-store.test.ts`, and an E2E written for it would have to invent a flow no user can perform.

> **Dual-scope `[P][G]` pairs:** the "Scope: G→P" / "Scope: P→G" rows apply uniformly — `s` round-trips a `[P][G]` pair both ways, whether it came from the snapshot or was built this session. SPACE differs by path: on a SKILL row it drops the project half (the same collapsed shape `s` reaches), on an AGENT row it is **inert** and emits the global-locked agent toast. See "`toggleSkillScope` / `toggleAgentScope` — `s` Is the Sole Dual-Scope Toggle" above.
>
> **What the P→G collapse renders:** dropping the project half empties the `(id, project)` slot, so the Sources tab and the confirm step both show the skill **twice** — surviving global row / `•` at Global, plus a pending-removal row / `-` at Project. The skill is not gone; only its project copy is.

## Dual-Scope Spacebar + Scope-Aware Removal

Two related behaviors, now implemented in `applySkillRemoval` / `reconcileSkillConfigs` and their agent equivalents:

1. **Dual-scope removal branch.** `applySkillRemoval` recognises a `[P][G]` pair: with `configs = [{X, project}, {X, global, excluded: true}]` and `removed = {X}`, it drops **both** the active project entry and the stale tombstone, then re-surfaces a single inherited-global entry `{X, global}` so the row collapses to a read-only `[G]`. Every path that routes through `applySkillRemoval` reaches it — domain-deselect (`toggleDomain`) and spacebar on the pair's own row, which the deselect lock no longer refuses. `s` (`toggleSkillScope` dropping the tombstone) reaches the same collapsed shape by its own route. The `reconcileSkillConfigs` restore branch re-creates both the project entry and the tombstone when a globally-tombstoned skill is re-added, restoring `[P][G]`.

2. **Scope-aware removal (no tombstone at global scope).** When editing FROM global scope, `reconcileSkillConfigs` and `toggleDomain` pass `null` for the installed configs into `applySkillRemoval`, so a deselect (or domain-deselect) removes the global skill outright. At project scope the same argument is the ownership test rather than a tombstone trigger: an entry present in the snapshot that the project does not own survives untouched. Either way, tombstones never reach `~/.claude-src/config.ts`.

The merge layer needs no tombstone-specific handling for either behavior: a fully-absent skill is dropped by `mergeConfigs`'s presence/absence + authoritative-scope logic (`"all"` for a global-context edit, `"owned"` for a project-context edit).

## Anchors

- `applySkillRemoval`, `applyAgentToggle`, `reconcileSkillConfigs`, `restoreSkillConfigs`, `buildSkillConfigForId`, `populateFromSkillIds`, `toggleSkillScope`, `toggleAgentScope`, `toggleAgent`, `toggleTechnology` — `src/cli/stores/wizard-store.ts`.
- `computeScopeDiff`, `prevSkillKeySet`, `prevSourceMap`, `removedSkills`, `uniqueExcludedGlobalSkills`, `inheritedGlobalSkills`, `deriveScopeBadges`, `formatScopeTag` — `src/cli/lib/wizard/scope-diff.ts`.
- `SkillAgentSummary` (renders `computeScopeDiff` output) — `src/cli/components/wizard/skill-agent-summary.tsx`.
- `mergeConfigs` compound keys — `src/cli/lib/configuration/config-merger.ts`.
- `splitConfigByScope` tombstone routing — `src/cli/lib/configuration/config-generator.ts`.
- `generateProjectConfigWithInlinedGlobal` — `src/cli/lib/configuration/config-writer.ts`.

> **See also:** [concepts/scope-system.md](./scope-system.md) for full scope system documentation; [config/scope-split.md](../config/scope-split.md) for tombstone routing; [config/config-merger.md](../config/config-merger.md) for compound-key reconciliation.
