---
scope: reference
area: wizard
keywords: [zustand, wizard-store, state, actions, consumers, initial-state, toast, preselections]
related:
  - reference/wizard/state-transitions.md
  - reference/component-patterns.md
  - reference/features/wizard-flow.md
last_validated: 2026-07-30
---

# Store / State Map

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

## State Management Library

**Library:** Zustand
**Version:** v5
**Pattern:** Single store with `create<WizardState>()`, accessed via `useWizardStore` hook with selectors

## Store

| Store          | File                             | Purpose                  |
| -------------- | -------------------------------- | ------------------------ |
| useWizardStore | `src/cli/stores/wizard-store.ts` | Entire wizard flow state |

There is exactly **one** Zustand store in the codebase.

## WizardState Shape (`src/cli/stores/wizard-store.ts`)

### Navigation State

| Field     | Type           | Purpose                         |
| --------- | -------------- | ------------------------------- |
| `step`    | `WizardStep`   | Current wizard step             |
| `history` | `WizardStep[]` | Step history stack for goBack() |

`WizardStep` = `"stack" | "domains" | "build" | "sources" | "agents" | "confirm"`

Step progression: `stack -> domains -> build -> sources -> agents -> confirm`

### Approach State

| Field             | Type                                | Purpose                           |
| ----------------- | ----------------------------------- | --------------------------------- |
| `approach`        | `"stack" \| "scratch" \| null`      | Stack-based or build-from-scratch |
| `selectedStackId` | `string \| null`                    | Selected stack ID                 |
| `stackAction`     | `"defaults" \| "customize" \| null` | Use stack as-is or customize      |

### Selection State

| Field                    | Type                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectedDomains`        | `Domain[]`                   | Active domains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `currentDomainIndex`     | `number`                     | Currently visible domain in build step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `domainSelections`       | `DomainSelections`           | **Selection intent** — nested `domain → category → SkillId[]`. Represents what the user has ticked in the build step UI. Does NOT carry scope/source/excluded metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `_stackDomainSelections` | `DomainSelections \| null`   | Internal snapshot of domainSelections taken by `populateFromSkillIds` (via `structuredClone`), covering both the edit flow and stack/scratch population in init. Read by `toggleDomain` to re-apply the original per-domain selection when a previously-removed domain is re-enabled. Never cleared except on `selectStack` / `reset`. Leading underscore flags it as internal — do not read from UI components.                                                                                                                                                                                                                                                                                                    |
| `selectedAgents`         | `AgentName[]`                | List of agent names the user has selected. Loosely paired with `agentConfigs`: an agent may appear here while `agentConfigs` has an `excluded: true` entry for the same name — that's the "visually off but globally installed" state (see `toggleAgent`). D-215 note: this field is retained (not removed) because an excluded-tombstone in `agentConfigs` still needs an entry in `selectedAgents` to keep `SelectedAgentName` correct for other projects sharing the global config.                                                                                                                                                                                                                              |
| `agentConfigs`           | `AgentScopeConfig[]`         | Per-agent `{ name, scope, excluded? }`. Source-of-truth for agent scope and tombstones. May contain tombstones for agents not in `selectedAgents` (preserved across `preselectAgentsFromDomains`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `boundSkills`            | `BoundSkill[]`               | Foreign skills bound via search                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `skillConfigs`           | `SkillConfig[]`              | **Saved-config shape** — flat `{ id, scope, source, excluded? }[]` that mirrors what will be written to project/global config. Kept in sync with `domainSelections` via `reconcileSkillConfigs` / `restoreSkillConfigs` / `applySkillRemoval`. May contain excluded tombstones absent from `domainSelections`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `installedSkillConfigs`  | `SkillConfig[] \| null`      | Immutable snapshot of skill configs installed before the wizard opened. Set once by `hydrateWizardStore` and NEVER modified post-hydration. Serves as (a) the diff baseline for `SkillAgentSummary`, (b) the "was-previously-installed" probe that tells `applySkillRemoval` which entries the project merely INHERITS (immutable — D-277) from those it added this session, and that gates tombstone creation in `toggleSkillScope` and the lock in `toggleTechnology`, (c) the source-of-truth for locked global rows in `buildSourceRows`, and (d) the baseline for the Sources tab's own session diff — the added (`+`) and pending-removal (`-`) markers. `null` in pure init mode with no prior installation. |
| `installedAgentConfigs`  | `AgentScopeConfig[] \| null` | Same semantics as `installedSkillConfigs`, but for agents. Drives the global-agent lock in `toggleAgent` and tombstone creation in `toggleAgentScope`. It no longer feeds `applyAgentToggle` — D-277 removed that helper's installed-configs parameter along with its tombstone branch.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `unresolvableSkillIds`   | `SkillId[]`                  | Skill IDs from the saved config that `populateFromSkillIds` could NOT resolve against the currently-loaded matrix (skill removed/renamed). The wizard cannot represent them, so their absence from the result is NOT a deselection — the merge layer must preserve any config entry whose id is in this set (D-233 Scenario C data-loss guard). Reset to `[]` by `createInitialState`.                                                                                                                                                                                                                                                                                                                              |

### UI State

| Field                      | Type                                                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showLabels`               | `boolean`                                                      | Show compatibility labels on skill tags                                                                                                                                                                                                                                                                                                                                                 |
| `filterIncompatible`       | `boolean`                                                      | Filter incompatible skills in build step grid                                                                                                                                                                                                                                                                                                                                           |
| `showSettings`             | `boolean`                                                      | Settings overlay visible                                                                                                                                                                                                                                                                                                                                                                |
| `showInfo`                 | `boolean`                                                      | Info overlay visible (selected skills and agents)                                                                                                                                                                                                                                                                                                                                       |
| `focusedSkillId`           | `SkillId \| null`                                              | Currently focused skill (drives S hotkey → scope toggle and info-panel highlight). Seeded **synchronously** by `seedFocusedSkillForActiveDomain()` at build-step entry and on every domain change (D-233 Fix A); the old CategoryGrid post-mount seed effect was deleted, so the Scenario B `null` race for skills no longer applies. `null` only when the active domain has no skills. |
| `focusedAgentId`           | `AgentName \| null`                                            | Currently focused agent (drives S hotkey in agents step and info-panel). Unlike `focusedSkillId`, this is STILL seeded by a post-mount `useEffect` in `step-agents.tsx` (`setFocusedAgentId`), so the async seed race persists on the agents step's S hotkey.                                                                                                                           |
| `isInitMode`               | `boolean`                                                      | True when running init (first-time setup); false when editing existing installation. **Gates no scope guard** (D-277 removed the bypass) — read only by `computeScopeDiff` (suppresses removed-global rows) and `SkillAgentSummary`.                                                                                                                                                    |
| `isEditingFromGlobalScope` | `boolean`                                                      | When true, scope toggling is disabled (editing from ~/.claude/)                                                                                                                                                                                                                                                                                                                         |
| `toastMessage`             | `string \| null`                                               | Temporary toast message shown in the wizard (auto-cleared after timeout)                                                                                                                                                                                                                                                                                                                |
| `globalPreselections`      | `SkillConfig[] \| null`                                        | Populated by `hydrateWizardStore` only in init flow (no `initialStep`) when existing global configs are found. Read by `stack-selection.tsx` to merge global skills into the fresh selection after the user picks a stack or "scratch". Never modified after hydration.                                                                                                                 |
| `globalAgentPreselections` | `{ agents: AgentName[]; configs: AgentScopeConfig[] } \| null` | Populated by `hydrateWizardStore` only in init flow when existing global agents are found. Read by `preselectAgentsFromStack()` (stack path) and by `stack-selection.tsx`'s scratch path to restore agents/configs after `selectStack()` wipes them. Never modified after hydration.                                                                                                    |

### Source State

| Field              | Type                      | Purpose                       |
| ------------------ | ------------------------- | ----------------------------- |
| `customizeSources` | `boolean`                 | Show per-skill source pickers |
| `enabledSources`   | `Record<string, boolean>` | Source enable/disable state   |

## All Actions

### Navigation

| Action    | Signature                    | Effect                                   |
| --------- | ---------------------------- | ---------------------------------------- |
| `setStep` | `(step: WizardStep) => void` | Navigate, push current to history        |
| `goBack`  | `() => void`                 | Pop from history; no-op if history empty |

### Approach / Stack

| Action           | Signature                                          | Effect                                       |
| ---------------- | -------------------------------------------------- | -------------------------------------------- |
| `setApproach`    | `(approach: "stack" \| "scratch" \| null) => void` | Set wizard approach                          |
| `selectStack`    | `(stackId: string \| null) => void`                | Select/deselect stack; resets all selections |
| `setStackAction` | `(action: "defaults" \| "customize") => void`      | Use stack as-is or customize                 |

### Selection

| Action                  | Signature                                           | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleDomain`          | `(domain: Domain) => void`                          | Add/remove domain, manages selections. Deselect is a **view filter** (D-277): it hides the domain and drops only the project-owned entries in it via `applySkillRemoval`; inherited global entries survive byte-identical. No guard, no toast — it has no authority over a global install rather than refusing one                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `toggleTechnology`      | `(domain, category, technology, exclusive) => void` | Radio (exclusive) or checkbox toggle. Guards (emit `GLOBAL_SKILLS_LOCKED` unless noted): (1) blocks toggling off a globally-installed skill from project scope; (1b) spacebar on a live dual-scope `[P][G]` row is inert — `isSelected && isDualScopePair(skillConfigs, technology)` returns the toast and leaves badges unchanged (only `s`/`toggleSkillScope` changes a dual-scope row); (2) in exclusive mode, blocks selecting a replacement when the current selection is globally installed OR a live `[P][G]` pair (a radio swap must never collapse a dual-scope row); (3) blocks deselecting the last skill in an `exclusive && required` category (`ONLY_SKILL_IN_CATEGORY`). Reconciles `skillConfigs` via `reconcileSkillConfigs`. |
| `toggleAgent`           | `(agent: AgentName) => void`                        | Add/remove agent. Dual-scope aware (D-233/D-260): spacebar on a live `[P][G]` pair is inert — `isDualScopeAgentPair(agentConfigs, agent)` returns the `GLOBAL_AGENTS_LOCKED` toast and leaves badges unchanged (only `s`/`toggleAgentScope` changes a dual-scope row); re-selecting an inherited-global row rebuilds the pair via `restoreDualScopeAgent`. Also guards against toggling globally-installed agents from project scope (`GLOBAL_AGENTS_LOCKED`) in every flow, init included (D-277). A deselect that reaches `applyAgentToggle` is one the project owns, so it is a clean removal — never a tombstone.                                                                                                                          |
| `bindSkill`             | `(skill: BoundSkill) => void`                       | Add foreign skill from search                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `nextDomain`            | `() => boolean`                                     | Advance to next domain, returns success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `prevDomain`            | `() => boolean`                                     | Go to previous domain, returns success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `setCurrentDomainIndex` | `(index: number) => void`                           | Set domain index directly (no-op if out of range)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Scope / Source Per-Skill

| Action                            | Signature                         | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleSkillScope`                | `(skillId: SkillId) => void`      | Toggle skill scope project/global. No-op if `isEditingFromGlobalScope`. The **sole** dual-scope toggle: `s` round-trips a pair both ways — `[P][G]` → `[G]` → `[P][G]` (spacebar is inert on a dual-scope row). Guard: project eject→global blocked when a global eject is already installed → `ALREADY_EJECTED_AT_GLOBAL` toast (unless an excluded tombstone allows the undo). G→P adds an excluded global tombstone (gated on `wasInstalledGlobally`, which counts an existing global tombstone as installed); P→G unconditionally drops any global tombstone. |
| `setFocusedSkillId`               | `(id: SkillId \| null) => void`   | Set focused skill for S hotkey (navigation-driven; CategoryGrid dispatches on move)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `seedFocusedSkillForActiveDomain` | `() => void`                      | Synchronously set `focusedSkillId` to the active domain's first grid option (via `buildCategoriesForDomain`), or `null` if none. Called by `setStep("build")`, `nextDomain`, `prevDomain`, `setCurrentDomainIndex`, and both hydration paths (D-233 Fix A).                                                                                                                                                                                                                                                                                                       |
| `toggleAgentScope`                | `(agentName: AgentName) => void`  | Toggle agent scope project/global. No-op if `isEditingFromGlobalScope`. Mirrors `toggleSkillScope`: the sole dual-scope toggle, `s` round-trips a pair both ways — `[P][G]` → `[G]` → `[P][G]`. G→P adds the excluded global tombstone (gated on `wasInstalledGlobally`, which counts a tombstone as installed); P→G unconditionally drops it.                                                                                                                                                                                                                    |
| `setFocusedAgentId`               | `(id: AgentName \| null) => void` | Set focused agent for S hotkey (seeded by a post-mount effect in `step-agents.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### UI Toggles

| Action                     | Signature                           | Effect                                                                             |
| -------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `toggleShowLabels`         | `() => void`                        | Toggle compatibility labels visibility                                             |
| `toggleFilterIncompatible` | `() => void`                        | Toggle filtering of incompatible skills; removes incompatible web skills on enable |
| `toggleSettings`           | `() => void`                        | Toggle settings overlay                                                            |
| `toggleInfo`               | `() => void`                        | Toggle info overlay (selected skills and agents)                                   |
| `setToastMessage`          | `(message: string \| null) => void` | Set a temporary toast message, or null to clear it                                 |

### Source Management

| Action                | Signature                                      | Effect                           |
| --------------------- | ---------------------------------------------- | -------------------------------- |
| `setSourceSelection`  | `(skillId: SkillId, sourceId: string) => void` | Set source for a specific skill  |
| `setCustomizeSources` | `(customize: boolean) => void`                 | Toggle per-skill source pickers  |
| `setEnabledSources`   | `(sources: Record<string, boolean>) => void`   | Replace enabled/disabled sources |
| `setAllSourcesEject`  | `() => void`                                   | Set all skills to "eject" source |
| `setAllSourcesPlugin` | `() => void`                                   | Set all skills to marketplace    |

### Derived

| Action              | Signature           | Effect                                        |
| ------------------- | ------------------- | --------------------------------------------- |
| `deriveInstallMode` | `() => InstallMode` | Derive install mode from skillConfigs sources |

### Population (Hydrating from Config/Stack)

| Action                       | Signature                                                     | When Used                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `populateFromSkillIds`       | `(skillIds: SkillId[], savedConfigs?: SkillConfig[]) => void` | Restore selections from a flat skill-ID list (edit flow, and both stack and scratch skill population in init). Sets `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `unresolvableSkillIds`.                                              |
| `preselectAgentsFromDomains` | `() => void`                                                  | After domain selection: rebuild `selectedAgents` from `DOMAIN_AGENTS` and **merge** into `agentConfigs` — retains all excluded tombstones (D-227) plus every non-project-owned entry outside the roster, so a globally-installed agent is not silently dropped (D-277 A8) |
| `preselectAgentsFromStack`   | `(stackAgents: AgentName[]) => void`                          | Stack path (from `stack-selection.tsx`): merge stack agent keys with `globalAgentPreselections`, preserving dual-scope tombstones. Replaces the removed `populateFromStack`; stack SKILL population is handled separately by `populateFromSkillIds`.                      |

### Reset

| Action  | Signature    | Effect                                               |
| ------- | ------------ | ---------------------------------------------------- |
| `reset` | `() => void` | Restore all state to `createInitialState()` defaults |

### Computed Getters

| Getter                             | Returns                                                        | Purpose                          |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| `getAllSelectedTechnologies`       | `SkillId[]`                                                    | Flat list of all selected skills |
| `getSelectedTechnologiesPerDomain` | `Partial<Record<Domain, SkillId[]>>`                           | Skills grouped by domain         |
| `getCurrentDomain`                 | `Domain \| null`                                               | Domain at currentDomainIndex     |
| `getTechnologyCount`               | `number`                                                       | Total selected count             |
| `getStepProgress`                  | `{ completedSteps, skippedSteps }`                             | For wizard tab indicators        |
| `canGoToNextDomain`                | `() => boolean`                                                | Has next domain                  |
| `canGoToPreviousDomain`            | `() => boolean`                                                | Has previous domain              |
| `buildSourceRows`                  | `{ skillId, options, scope?, readOnly?, disabled?, added? }[]` | Sources step UI data             |

## Usage Pattern

**In wizard components:**

```typescript
// Select specific state slices (Zustand selectors)
const step = useWizardStore((s) => s.step);
const toggleTechnology = useWizardStore((s) => s.toggleTechnology);
const selectedDomains = useWizardStore((s) => s.selectedDomains);

// Or get the entire store
const store = useWizardStore();
```

**Files using the store (production only):**

- `src/cli/components/wizard/wizard.tsx` - Main wizard orchestrator
- `src/cli/components/wizard/wizard-layout.tsx` - Layout wrapper
- `src/cli/components/wizard/step-build.tsx` - Technology selection step
- `src/cli/components/wizard/step-sources.tsx` - Source selection step
- `src/cli/components/wizard/step-agents.tsx` - Agent selection step
- `src/cli/components/wizard/stack-selection.tsx` - Stack list component
- `src/cli/components/wizard/domain-selection.tsx` - Domain tab selector
- `src/cli/components/wizard/info-panel.tsx` - Info overlay (selected skills/agents)
- `src/cli/components/wizard/skill-agent-summary.tsx` - Skill/agent summary display
- `src/cli/components/wizard/run-wizard-session.tsx` - Session runner; calls `hydrateWizardStore(options.hydrate)` before render
- `src/cli/commands/list.tsx` - Dashboard command; calls `hydrateWizardStore()` directly with installed snapshots

## Internal Helpers

All declared at module scope in `wizard-store.ts`, not exported. Domain ordering is NOT one of them: the former `sortDomainsCanonically` helper was removed and replaced by the imported `orderDomains()` from `src/cli/lib/wizard/domain-order.ts` (which sorts custom domains alphabetically, then built-in domains per `BUILT_IN_DOMAIN_ORDER` in `consts.ts`). It is used wherever a domain list is set (`toggleDomain`, `populateFromSkillIds`).

**Scope predicates (skills):** `hasProjectActive(configs, id)`, `hasGlobalActive(configs, id)`, `hasGlobalTombstone(configs, id)` test for an active project / active global / excluded-global entry. `isDualScopePair(configs, id)` = active project entry + global tombstone (the `[P][G]` shape). Consumed by `toggleTechnology`, `toggleSkillScope`, `toggleFilterIncompatible`, `applySkillRemoval`, `reconcileSkillConfigs`.

**Scope predicates (agents):** `agentHasProjectActive(configs, name)`, `agentHasGlobalActive(configs, name)`, `agentHasGlobalTombstone(configs, name)`, `isDualScopeAgentPair(configs, name)` — the agent-side mirror, consumed by `toggleAgent` and `toggleAgentScope`.

**`createDefaultSkillConfig(id)`**: Returns a fresh `{ id, scope: "global", source: primary-or-default-public }` SkillConfig for a skill that has no saved config.

**`buildSkillConfigForId(id, savedConfigs?)`**: Builds a `SkillConfig` for a skill ID, preferring a project-scoped non-excluded entry from `savedConfigs` over a global one when duplicates exist (D-198 defensive fix). Degrades to `createDefaultSkillConfig`'s output when the snapshot has no entry.

**`applySkillRemoval(configs, removedIds, installedSkillConfigs)`**: Removes only what the project OWNS (D-277) — a project-scoped entry, the project's own global tombstone, or an entry absent from `installedSkillConfigs` (added this session). An INHERITED global-active entry present in the snapshot survives **byte-identical**; the helper never stamps `excluded`, so it is not a tombstone producer. `installedSkillConfigs === null` means "editing FROM global scope": nothing is inherited, so every removed id is dropped (D-233 Scenario C). A dual-scope pair collapses to a single inherited-global entry (D-233 Scenario B). Invoked by `toggleDomain`, `toggleFilterIncompatible`, and `reconcileSkillConfigs`.

**`reconcileSkillConfigs(configs, added, removed, installedSkillConfigs, isEditingFromGlobalScope)`**: Wrapper applied by `toggleTechnology`. Calls `applySkillRemoval` for removed skills (passing `null` for installed when `isEditingFromGlobalScope`, so a removal is a genuine uninstall — D-233 Scenario C; at project scope the snapshot is the ownership test instead), then for each added skill: rebuilds the `[P][G]` pair on a dual-scope restore, un-excludes an existing tombstone, or appends `buildSkillConfigForId(id, installedSkillConfigs)`.

**`restoreSkillConfigs(existingConfigs, restoredIds)`**: Used by `toggleDomain` when a domain is re-enabled and a `_stackDomainSelections` snapshot exists. Clears `excluded` flags on the restored IDs and appends defaults for any newly-introduced IDs.

**Agent config builders/togglers:** `buildAgentConfigForName(name, savedConfigs?)` mirrors `buildSkillConfigForId` on the agent path (preselection). `applyAgentToggle(configs, agent, isSelected)` removes the agent's entries on deselect and restores/adds on select — D-277 dropped its `installedAgentConfigs` parameter with the tombstone branch, so it mirrors `applySkillRemoval` in never minting one. `restoreDualScopeAgent(...)` is the D-233 dual-scope restore used by `toggleAgent` when re-selecting an inherited-global row; the collapse half is now `toggleAgentScope`'s `s` toggle (dropping the tombstone), not a helper (D-260). `collectTombstones(configs)` returns excluded entries (preserved across reconcile/preselect merges — D-223/D-227), used by `populateFromSkillIds` and `preselectAgentsFromStack`; `preselectAgentsFromDomains` inlines the same tombstone retention alongside its D-277 non-project-owned retention in one filter. `nextSelectedAgents(selectedAgents, agent, { isSelected, isInList })` computes the post-toggle name list — its former `isExcludedToggleOff` arm (which kept a tombstoned agent listed) went away with the tombstone branch.

**Selection helpers:** `addToDomainSelections(selections, domain, category, skillId)` adds a skill if absent (`populateFromSkillIds`). `flattenCategorySelections(selections)` / `collectSkillIdsFromSelections(selections)` flatten a domain's category map to skill IDs. `findIncompatibleWebSkills(webSelections, skillConfigs)` / `removeSkillsFromSelections(selections, toRemove)` are the framework-compatibility helpers used by `toggleFilterIncompatible` and `toggleDomain`.

**`resolveSkillForPopulation(skillId)`**: Looks up a skill → `{ domain, subcat, techId }` for `populateFromSkillIds`. Returns `null` with a warning when the skill isn't in the matrix or its category has no domain.

**Source-grid builders (for `buildSourceRows`):** `resolveEffectiveSource(...candidates)` returns the first defined source else `DEFAULT_PUBLIC_SOURCE_NAME`. `primarySourceName(skill)` returns the primary available source name. `getSourceSortTier(source)` returns 1–4 for the fixed tier ordering (local → scoped → public → third-party). `buildBoundSkillOptions(boundSkills, alias, selectedSource)` converts matching `BoundSkill` entries into `SourceOption[]`. `buildSkillSourceOptions(skill, selectedSource, boundSkills)` assembles eject + sorted sources + bound options for one skill. `classifySkillSourceRows(skillId, options, context)` splits one skill into its `SourceRow[]` — a pending-removal row, a locked-global row, a locked-global plus editable-project pair, or a single row — and flags an added row in every shape. `sourceRowSortTier(row)` orders the rows (global readOnly, global editable, project).

**Sources-tab session diff:** `collectRemovedInstalledEntries(installedSkillConfigs, skillConfigs)` returns the snapshot **(id, scope) slots** this session emptied — every ACTIVE snapshot entry whose slot no live `skillConfigs` entry occupies. Each becomes an inert row (`toPendingRemovalRow`) carrying the removal marker and the entry's persisted scope + source, so the user can see what saving removes. It applies at **every** scope — a global-scope edit shows the removal too, matching `computeScopeDiff`, which has no such gate.

Removal is keyed per **slot**, not per id, using the same `skillSlotKey` the confirm step's removal match uses, so one skill can render twice: collapsing a dual-scope `[P][G]` pair to `[G]` (either the persisted project-entry-plus-global-tombstone pair or an active entry at both scopes) keeps the surviving **global** row AND emits a **project** pending-removal row — the same two-row shape the confirm step prints (`-` at Project, `•` at Global). Rows are therefore no longer disjoint per skill; they stay disjoint per slot, enforced by `isSlotAlreadyRendered`, which suppresses a removal row for a slot a live row already renders (the inherited-global case: `[G]` snapshot, `[P]` live with no tombstone, where the locked global row is rendered from the snapshot). Snapshot **tombstones** are deliberately excluded as removal candidates — narrower than `computeScopeDiff`, whose removal filter counts them — because a tombstone is a mask over a global install, not an install: dropping it deletes nothing.

`collectInstalledSkillSlots(installedSkillConfigs)` and `addedSlotFlag(...)` decide the added marker per **(id, scope) slot** rather than per id, using `skillSlotKey` exported from `lib/wizard/scope-diff.ts` — the same key the confirm step's `classifyDiffRow` uses, so the two surfaces cannot drift. Adopting a globally-installed skill at project scope therefore flags the new project row as added, even though the id already existed globally. Tombstones count as occupied slots on both sides, so re-activating a masked global install reads as unchanged rather than added.

## Hydration Entry Point

**`hydrateWizardStore(options: HydrateOptions): void`** — exported from `wizard-store.ts`. MUST be called before `render(<Wizard />)` so React captures the intended initial snapshot on the first frame (running hydration inside a render-phase hook causes a one-frame flash of the default `"stack"` step).

Called through `runWizardSession()` in `components/wizard/run-wizard-session.tsx` (used by `commands/init.tsx` — no `initialStep` → init flow — and `commands/edit.tsx`'s `runEditWizard()` — with `initialStep`, `installedSkillIds`, etc. → edit flow), and directly by `commands/list.tsx` (dashboard view, snapshot-only). It delegates to the non-exported `hydrateForEdit` / `hydrateForInit`.

```typescript
type HydrateOptions = {
  initialStep?: WizardStep; // When absent → init mode (isInitMode=true, stays on "stack")
  initialDomains?: Domain[]; // Overrides domains derived by populateFromSkillIds
  initialAgents?: AgentName[]; // Restores saved selectedAgents
  installedSkillIds?: SkillId[]; // Passed to populateFromSkillIds (edit flow only)
  installedSkillConfigs?: SkillConfig[]; // Snapshot + savedConfigs for populateFromSkillIds
  installedAgentConfigs?: AgentScopeConfig[]; // Snapshot + restored when initialAgents set
  isEditingFromGlobalScope?: boolean; // Disables scope toggling (~/.claude/ edit)
};
```

Sequence:

1. `useWizardStore.setState(createInitialState())` — fresh reset
2. Sets `isInitMode = !initialStep`
3. If edit flow: `populateFromSkillIds(installedSkillIds, installedSkillConfigs)`
4. If `initialStep`: jumps to that step with empty `history`, sets `approach: "scratch"`
5. Overrides `selectedDomains` / `selectedAgents` / `agentConfigs` from saved config if present
6. Seeds `installedSkillConfigs` / `installedAgentConfigs` snapshots (diff baseline)
7. In init flow with existing global configs: seeds `globalPreselections` / `globalAgentPreselections` for `stack-selection.tsx` / `preselectAgentsFromStack` to merge after the user picks stack/scratch
8. Both paths end by calling `seedFocusedSkillForActiveDomain()` so `focusedSkillId` is set before the first frame

## Internal Constants

**Domain-to-agent mapping** in `wizard-store.ts`:

```typescript
DOMAIN_AGENTS = {
  web: [
    "web-developer",
    "web-reviewer",
    "web-researcher",
    "web-tester",
    "web-pm",
    "web-architecture",
  ],
  api: ["api-developer", "api-reviewer", "api-researcher"],
  cli: ["cli-developer", "cli-tester", "cli-reviewer"],
};
```

**Source sort tiers** (`SOURCE_SORT_TIER_LOCAL`/`_SCOPED`/`_PUBLIC`/`_THIRD_PARTY` in `wizard-store.ts`, for source ordering in `buildSourceRows`):

1. eject/global (installed on disk -- type "eject" or installed via plugin)
2. scoped marketplace (primary source from --source flag)
3. default public marketplace (Agents Inc)
4. third-party marketplaces (extra configured sources)

**`TOAST_MESSAGES`** (module const in `wizard-store.ts`; E2E asserts these verbatim):

| Key                         | Message                                              | Emitted by                                                         |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `GLOBAL_SKILLS_LOCKED`      | `Global skills cannot be changed from project scope` | `toggleTechnology`, `toggleFilterIncompatible`                     |
| `ONLY_SKILL_IN_CATEGORY`    | `Cannot deselect the only skill in this category`    | `toggleTechnology` (exclusive+required, 1 skill)                   |
| `ALREADY_EJECTED_AT_GLOBAL` | `Already exists as ejected skill at global scope`    | `toggleSkillScope` (project eject → global)                        |
| `GLOBAL_AGENTS_LOCKED`      | `Global agents cannot be changed from project scope` | `toggleAgent` (active-global guard + live `[P][G]` inert-spacebar) |

## State Reset

`reset()` action restores all state to `createInitialState()` defaults.

`selectStack()` also resets: domainSelections, \_stackDomainSelections, selectedDomains, skillConfigs, selectedAgents, agentConfigs, boundSkills, currentDomainIndex, stackAction.

Initial state:

- `step: "stack"`, `approach: null`, `selectedStackId: null`, `stackAction: null`
- `selectedDomains: []`, `currentDomainIndex: 0`, `domainSelections: {}`, `_stackDomainSelections: null`
- `showLabels: false`, `filterIncompatible: false`, `showSettings: false`, `showInfo: false`
- `skillConfigs: []`, `focusedSkillId: null`, `customizeSources: false`
- `enabledSources: {}`, `selectedAgents: []`, `agentConfigs: []`, `focusedAgentId: null`
- `boundSkills: []`, `installedSkillConfigs: null`, `installedAgentConfigs: null`
- `unresolvableSkillIds: []`
- `isInitMode: false`, `isEditingFromGlobalScope: false`, `toastMessage: null`
- `globalPreselections: null`, `globalAgentPreselections: null`, `history: []`
