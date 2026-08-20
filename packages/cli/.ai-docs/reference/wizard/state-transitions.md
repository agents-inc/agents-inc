---
scope: reference
area: wizard
keywords:
  [
    state-machine,
    transitions,
    actions,
    reset,
    initial-state,
    derived-state,
    hotkeys,
    DOMAIN_AGENTS,
    hydrate,
    focus-seeding,
    scenario-b-race,
    tombstone-lifecycle,
    diff-projection,
  ]
related:
  - reference/store-map.md
  - reference/features/wizard-flow.md
  - reference/component-patterns.md
  - reference/features/configuration.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/guard-pattern.md
  - reference/concepts/scope-system.md
last_validated: 2026-08-18
---

# State Transitions

## Overview

**Purpose:** Complete wizard state machine -- all step transitions, action side effects, and reset behaviors.

**Source of truth:** `src/cli/stores/wizard-store.ts`

**Cross-references:**

- `store-map.md` -- WizardState shape and consumers
- `features/wizard-flow.md` -- Component architecture and UI details
- `component-patterns.md` -- Hotkey registry and Ink patterns

## WizardStep Union

**File:** `src/cli/stores/wizard-store.ts`

```typescript
type WizardStep = "stack" | "domains" | "build" | "sources" | "agents" | "confirm";
```

**Canonical order** (source of truth: `WIZARD_STEP_ORDER` in `src/cli/stores/wizard-store.ts`. The tab bar is drawn from `getActiveStepFlow()` — the steps THIS run has — mapped to labels by `wizardTabsFor()` in `src/cli/components/wizard/wizard-tabs.tsx`; a source that ships no stacks drops `"stack"` from the flow, so no Stack tab is painted at all). Every member of the `WizardStep` union, in order. `scripts/check-enumeration-drift.ts` binds this table to the union **and** to `WIZARD_STEP_ORDER` separately, because `as const satisfies readonly WizardStep[]` constrains what the array may hold and not that it holds everything — a step in the union and in this table but absent from the constant compiles, paints no tab, and would satisfy a row bound to the union alone. `WIZARD_STEP_LABELS` is the third list of the same six and needs no row: `satisfies Record<WizardStep, string>` is total over the union, so `tsc` refuses a step with no label. A seventh step cannot land without a row here:

| Step      | Tab label | Renders                            | Purpose                                                              |
| --------- | --------- | ---------------------------------- | -------------------------------------------------------------------- |
| `stack`   | Stack     | `StepStack` → `StackSelection`     | Select a pre-built stack or "Start from scratch"                     |
| `domains` | Domains   | `DomainSelection` → `CheckboxGrid` | Select which domains to configure                                    |
| `build`   | Skills    | `StepBuild` → `CategoryGrid`       | Per-domain skill selection                                           |
| `sources` | Sources   | `StepSources` → `SourceGrid`       | Per-skill install mode: `Local` (the project's own copy) or `Plugin` |
| `agents`  | Agents    | `StepAgents`                       | Select which agents to compile                                       |
| `confirm` | Confirm   | `StepConfirm` → `SummaryPanel`     | Review and confirm                                                   |

The tab labels are `WIZARD_STEP_LABELS` in `wizard-tabs.tsx` — note `build` is labelled **Skills**, so the step name and the tab caption differ for exactly one step.

## Step Sequence Diagram

```
                                +-----------+
                                |   stack   |  (initial step — skipped entirely
                                +-----+-----+   when the source offers no stacks)
                                      |
                      +----- ENTER ----+---- ENTER ------+
                      |  ("scratch")   |  (stack item)   |
                      v                v                  |
              selectStack(null)   selectStack(id)         |
              setApproach("scratch") setStackAction("customize")
              toggleDomain x3     populateFromSkillIds()  |
                                  setApproach("stack")    |
                      |                |                  |
                      +-------+--------+                  |
                              v                          |
                        +-----------+                    |
                        |  domains  |                    |
                        +-----+-----+                    |
                              |                          |
                         ENTER (continue)                |
                              |                          |
                              v                          |
                        +-----------+                    |
                        |   build   |                    |
                        +-----+-----+                    |
                              |                          |
                    +---------+---------+                 |
                    | nextDomain()      |                 |
                    | returns true?     |                 |
                    | -> stay in build  |                 |
                    | returns false?    |                 |
                    | -> setStep("sources")              |
                    +---------+---------+                 |
                              v                          |
                        +-----------+                    |
                        |  sources  |                    |
                        +-----+-----+                    |
                              |                          |
                         ENTER (continue)                |
                              |                          |
             preselectAgentsFromDomains() — only when     |
             the wizard got no `initialAgents` prop       |
                              |                          |
                              v                          |
                        +-----------+                    |
                        |  agents   |                    |
                        +-----+-----+                    |
                              |                          |
                         ENTER (continue)                |
                              v                          |
                        +-----------+                    |
                        |  confirm  |<-------------------+
                        +-----------+   (A hotkey: "accept defaults"
                                         skips build/sources/agents)
```

**Stack-item population detail** (in `stack-selection.tsx` `handleSelect`): after `selectStack(id)` + `setStackAction("customize")`, agents are derived via `preselectAgentsFromStack(typedKeys(stack.skills))` and skills via `populateFromSkillIds(mergedIds, globalPreselections)` (the removed `populateFromStack` no longer exists). The scratch row calls the `startFromScratch()` STORE action — restore `globalAgentPreselections`, merge `globalPreselections`, toggle `DEFAULT_SCRATCH_DOMAINS` — then `setStep("domains")` itself. The action lives in the store because `hydrateForInit` performs the same preparation when the source offers no stacks and the step never renders.

**The `stack` step is conditional.** It opens the init flow only when `matrix.suggestedStacks` is non-empty. A source that ships no stacks gets no built-in stand-in unless it IS the default public marketplace ([`features/built-in-catalogue.md`](../features/built-in-catalogue.md)), so for a custom stackless marketplace the wizard opens on `domains` with `history: []` — see [Hydration](#hydration-edit-and-init-entry-points).

**Backward navigation:** Every step uses `goBack()` (ESC key), which pops from `history[]` to return to the previous step.

## Forward Navigation Transitions

| From      | To        | Trigger                                                                                                                    | Component/File                           |
| --------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `stack`   | `domains` | ENTER on "Start from scratch"                                                                                              | `stack-selection.tsx`                    |
| `stack`   | `domains` | ENTER on a stack item                                                                                                      | `stack-selection.tsx`                    |
| `domains` | `build`   | ENTER — from ANY focus index, and with zero domains selected. `CheckboxGrid`'s `emptyMessage` is a footer hint, not a gate | `domain-selection.tsx`                   |
| `build`   | `build`   | ENTER when `nextDomain()` returns true (more domains)                                                                      | `use-build-step-props.ts`                |
| `build`   | `sources` | ENTER when `nextDomain()` returns false (last domain)                                                                      | `use-build-step-props.ts`                |
| `build`   | `confirm` | `A` hotkey (accept defaults, requires `selectedStackId`)                                                                   | `wizard.tsx`                             |
| `sources` | `agents`  | ENTER. The step is one grid — there is no "use recommended" choice screen in front of it                                   | `wizard.tsx` (via `onContinue` callback) |
| `agents`  | `confirm` | ENTER (continue)                                                                                                           | `step-agents.tsx`                        |

## Backward Navigation Transitions

| From      | To (via `goBack()`) | Trigger                               | Additional Side Effects                                                                                                                                                                                                            |
| --------- | ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domains` | `stack`             | ESC, when `history` is non-empty      | `setApproach(null)`, `selectStack(null)` before `goBack()`. Inert on an empty `history` — the stackless-source entry point opens HERE, so there is no stack choice to clear and clearing anyway would wipe the selections in place |
| `build`   | `build`             | ESC when `prevDomain()` returns true  | Decrements `currentDomainIndex`                                                                                                                                                                                                    |
| `build`   | `domains`           | ESC when `prevDomain()` returns false | Pops from `history`                                                                                                                                                                                                                |
| `sources` | `build`             | ESC                                   | Pops from `history`                                                                                                                                                                                                                |
| `agents`  | `sources`           | ESC                                   | Pops from `history`                                                                                                                                                                                                                |
| `confirm` | `agents`            | ESC                                   | Pops from `history`                                                                                                                                                                                                                |

**`goBack()` implementation** in `wizard-store.ts`: Pops from `history[]`, sets `step` to the popped value. Returns unchanged (no-op) when `history` is empty — it does NOT fall back to `"stack"` (the edit flow enters mid-wizard with an empty `history`, so `goBack` intentionally does nothing there).

## Accept-Defaults Shortcut

When a stack is selected and the user presses `A` during the build step:

1. `setStackAction("defaults")` -- marks the stack for as-is use
2. `setStep("confirm")` -- jumps directly to confirmation, skipping sources and agents

**Condition:** `store.step === "build" && store.selectedStackId` (checked in `wizard.tsx`)

**`getStepProgress()` response:** marks `build`, `sources`, `agents` as `skipped` (not `completed`)

## Hydration (Edit and Init Entry Points)

**Function:** `hydrateWizardStore(options)` in `src/cli/stores/wizard-store.ts` (delegates to non-exported `hydrateForEdit` / `hydrateForInit`)
**Callers:** `runWizardSession()` in `components/wizard/run-wizard-session.tsx`, invoked by `commands/init.tsx` and `commands/edit.tsx`'s `runEditWizard()`; also called directly by `commands/list.tsx` (dashboard, snapshot-only)

Hydration MUST run synchronously **before** `render(<Wizard />)` so React's first commit captures the intended step. A render-phase hook would flash the default `"stack"` step for one frame before the jump committed.

**On the wizard route it runs inside a logger buffering window.** `runWizardSession()` calls `hydrateIntoStartupBand()` rather than `hydrateWizardStore()` directly; that helper opens buffer mode, hydrates, and returns `[...loadMessages, ...drainBuffer()]` with `disableBuffering()` in a `finally` (buffer mode is process-wide, so a throw during hydration would otherwise swallow every later `warn()` in the run). Edit-mode step 3 below is why: `populateFromSkillIds` warns once per installed skill it cannot resolve, and the load's own buffer was drained before the command reached here. `commands/list.tsx` calls `hydrateWizardStore()` bare and needs no window: it supplies neither `initialStep` nor `installedSkillIds`, so it takes the Init-mode path below, where step 3 records that `populateFromSkillIds` does not run.

**Edit mode** (`initialStep` provided, typically `"build"`):

1. `setState(createInitialState())` -- hard reset
2. `setState({ isInitMode: false })` -- `initialStep` was provided
3. If `installedSkillIds` non-empty: `populateFromSkillIds(installedSkillIds, installedSkillConfigs)` restores selections (derives domains, categories, and skill configs)
4. `setState({ step: initialStep, history: [], approach: "scratch" })` -- jumps to step with **empty `history`** (no prior steps to walk back through)
5. If `initialDomains`: overrides `selectedDomains`, resets `currentDomainIndex` to 0
6. If `initialAgents`: overrides `selectedAgents`
7. If `initialAgents` AND `installedAgentConfigs`: restores `agentConfigs` (preserves scope)
8. If `installedSkillConfigs` or `installedAgentConfigs`: snapshots into `installedSkillConfigs`/`installedAgentConfigs` for guard checks and diff rendering
9. If `isEditingFromGlobalScope`: sets flag (disables scope toggles)
10. `seedFocusedSkillForActiveDomain()` -- synchronously seeds `focusedSkillId` before the first frame

**Init mode** (no `initialStep`):

1. Same hard reset
2. `setState({ isInitMode: true })`
3. **Does NOT call `populateFromSkillIds`** -- stack-selection runs first; user chooses stack or scratch
4. If `installedSkillConfigs`: stashes into `globalPreselections` (merged by `stack-selection.tsx` after stack/scratch choice)
5. If `initialAgents` or `installedAgentConfigs`: stashes into `globalAgentPreselections.agents`/`.configs` (restored via `preselectAgentsFromStack` / `startFromScratch()` after `selectStack()` wipes agents)
6. If `matrix.suggestedStacks` is empty: `startFromScratch()` then `setState({ step: "domains", history: [] })` -- the stack step would hold nothing but its own scratch row, so the wizard opens where that row leads, prepared the same way, with nothing behind it. Steps 4 and 5 are consumed here rather than by `stack-selection.tsx`
7. `seedFocusedSkillForActiveDomain()` -- runs at the end of init hydration too (seeds `null` when no domains are selected yet, and the active domain's first option when step 6 selected the scratch domains)

> **There is no hydration hook.** Hydration is the imperative `hydrateWizardStore(options)` batch in `src/cli/stores/wizard-store.ts`, called before `render(<Wizard />)`. No file under `src/cli/components/hooks/` performs it, and adding one would reintroduce the one-frame flash of the default `"stack"` step that running hydration in a render-phase hook produces.

> **The DOMAINS step is init-only and unreachable from `cc edit`.** Edit hydrates at `initialStep: "build"` with `history: []`, so the build step's ESC handler (`use-build-step-props.ts` `onBack` → `prevDomain()` → `goBack()`) no-ops on empty history and cannot walk backwards into DOMAINS. `cc init` cannot supply the surface either: `showDashboardIfInitialized` → `detectInstallation` falls back to `detectGlobalInstallation`, so any run with a global install present routes to the dashboard → `edit` → build. Consequence for planning and testing: `toggleDomain` (and anything else reachable only from the `domains` / `stack` steps) cannot be exercised by an edit-flow E2E — cover it at unit level instead, and do not settle for an absence-only assertion, which a blocked action satisfies vacuously. The ESC half is already pinned by `e2e/interactive/edit-wizard-navigation.e2e.test.ts` → "should stay on build step when pressing ESC in edit flow with no prior history".

### Cancellation / Exit Transitions

| Trigger          | Path                                                              | Store Effect                                     |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| ESC on `stack`   | `StepStack` calls `onCancel` -> `handleCancel()` in `wizard.tsx`  | None; `exit()` unmounts Ink, command logs cancel |
| Confirm complete | `handleComplete()` builds `WizardResultV2` and calls `onComplete` | Store is not reset; `exit()` unmounts Ink        |
| Ctrl+C (SIGINT)  | Ink's default handler runs `exit()`                               | No store cleanup; process terminates             |

The wizard store is module-level singleton state, so a fresh `hydrateWizardStore()` call on the next command run resets it via `createInitialState()` before use.

---

## Action -> State Change Table

### Navigation Actions

| Action                     | State Modified                         | Side Effects                                                                                                                    |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `setStep(step)`            | `step`, `history`, `focusedSkillId`    | Pushes current `step` onto `history`, sets new `step`. When `step === "build"`, also calls `seedFocusedSkillForActiveDomain()`. |
| `goBack()`                 | `step`, `history`                      | Pops last entry from `history`, sets `step` to that value. No-op if `history` is empty (no fallback to `"stack"`).              |
| `nextDomain()`             | `currentDomainIndex`, `focusedSkillId` | Increments by 1 if not at last domain, then `seedFocusedSkillForActiveDomain()`. Returns `true` if advanced, `false` if at end. |
| `prevDomain()`             | `currentDomainIndex`, `focusedSkillId` | Decrements by 1 if not at first domain, then `seedFocusedSkillForActiveDomain()`. Returns `true` if moved, `false` if at start. |
| `setCurrentDomainIndex(n)` | `currentDomainIndex`, `focusedSkillId` | Sets directly if valid (0 <= n < selectedDomains.length), then `seedFocusedSkillForActiveDomain()`; no-op otherwise             |

### Approach/Stack Actions

| Action                   | State Modified                                                                                                                                                            | Side Effects                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setApproach(approach)`  | `approach`                                                                                                                                                                | None                                                                                                                                                                                                                                       |
| `selectStack(stackId)`   | `selectedStackId`, `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `selectedAgents`, `agentConfigs`, `currentDomainIndex`, `stackAction` | **Full reset** -- see Reset Matrix. Note: `selectedAgents` and `agentConfigs` are cleared here but repopulated by `preselectAgentsFromStack()` (derives agents from the stack's agent keys) after `stack-selection.tsx` selects the stack. |
| `setStackAction(action)` | `stackAction`                                                                                                                                                             | None                                                                                                                                                                                                                                       |

### Selection Actions

| Action                                           | State Modified                                        | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleDomain(domain)`                           | `selectedDomains`, `domainSelections`, `skillConfigs` | **Remove (view filter):** drops the domain's selections and the skill configs the project OWNS in it; an inherited global-active entry survives byte-identical via `applySkillRemoval`. No guard and no toast — a domain deselect has no authority over a global install rather than refusing to touch one. **Add:** restores from `_stackDomainSelections` snapshot if available, creates default skill configs for restored skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `toggleTechnology(domain, cat, tech, exclusive)` | `domainSelections`, `skillConfigs`, `toastMessage`    | **Guard, asymmetric by direction:** on a DESELECT the composite `isGloballyLockedSkill(installed, skillConfigs, tech)` applies (active global in the snapshot, OR a snapshot tombstone paired with a live active global); on a SELECT only `hasGlobalActive(installed, tech)` applies, so the re-select restore path still runs. Either fires `GLOBAL_SKILLS_LOCKED` unless `isEditingFromGlobalScope` — init included. **Dual-scope, and this is where the skill path differs from the agent path:** spacebar on a live `[P][G]` row is NOT inert. `toggleTechnology` calls `isDualScopePair` only through `blocksExclusiveSwap`, so the pair is refused on an EXCLUSIVE swap (dropping the project half sideways would unmask the global install beside the new pick) but a plain checkbox deselect goes through and `applySkillRemoval` collapses the pair to its inherited global entry. Compare `toggleAgent`, which does hold an inert-spacebar branch. Single-skill `exclusive && required` categories block deselection (`ONLY_SKILL_IN_CATEGORY`). Uses `reconcileSkillConfigs()` for add/remove (drops project-owned entries, leaves inherited global installs untouched, restores tombstoned on re-add). When a deselect collapses to a still-active inherited-global entry the skill stays in the domain selection (`stillActiveAfterRemoval`). |
| `toggleAgent(agent)`                             | `selectedAgents`, `agentConfigs`, `toastMessage`      | **Dual-scope:** spacebar on a live `[P][G]` pair is inert — `isDualScopeAgentPair(agentConfigs, agent)` returns `GLOBAL_AGENTS_LOCKED` and leaves the pair intact (only `s`/`toggleAgentScope` changes a dual-scope row); re-selecting an inherited-global row rebuilds the pair via `restoreDualScopeAgent`. **Guard:** an active global agent (or a snapshot tombstone paired with a live active global) not editing from global scope — init included — returns `GLOBAL_AGENTS_LOCKED` toast. **Removal logic:** `applyAgentToggle()` -- every deselect that reaches it is one the project owns, so it drops the agent's entries and its name from `selectedAgents`; it never stamps `excluded` (deleted that branch). Toggling on a tombstoned agent clears `excluded`. Genuinely-new agents are added/removed with `scope: "global"` (see known bug below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `preselectAgentsFromDomains()`                   | `selectedAgents`, `agentConfigs`                      | Collects agents from `DOMAIN_AGENTS` for selected domains and rebuilds the roster in `agentConfigs` via `buildAgentConfigForName` (prefers a saved project-scoped active entry over global), then **merges back** ALL excluded tombstones plus every non-project-owned entry outside the roster, so a globally-installed agent the selected domains do not roster is retained rather than silently uninstalled. Agents with no saved config default to `scope: "global"` (see known bug below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Known bug (OPEN) — newly-toggled agents default to global scope.** `applyAgentToggle`'s else-branch (a genuinely-new agent) and `buildAgentConfigForName`'s fallback (used by `preselectAgentsFromDomains` / `preselectAgentsFromStack` for an agent with no saved config) both default to `scope: "global"`, with no inspection of the surrounding project's scope convention. (`buildAgentConfigForName` DOES now inherit the saved scope for an agent that already has a config.) In an edit flow where existing skills and agents are all project-scoped, a freshly-toggled-on agent lands global-scoped. Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global agents", so the new agent receives zero stack assignments — `buildAgentStack` returns undefined and `stack[newAgent]` is never emitted, breaking the seeding contract asserted by `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts`. Source: `.ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`. Proposed rule (not yet codified): newly-toggled agents inherit scope from the dominant scope of existing non-excluded `agentConfigs` (or from `skillConfigs` if no active agent exists); a fresh init with zero agents continues to default to `"global"`.

### Skill/Agent Config Actions

| Action                              | State Modified                 | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toggleSkillScope(skillId)`         | `skillConfigs`, `toastMessage` | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. The only key that MOVES a skill between scopes: `s` round-trips a pair both ways — `[P][G]` → `[G]` → `[P][G]`. It is not the only key that reaches the collapsed shape, though — a plain spacebar deselect drops the project half and `applySkillRemoval` re-surfaces the inherited global entry. **Guard:** project eject → global blocked when global eject already installed → `ALREADY_EJECTED_AT_GLOBAL` toast unless an excluded tombstone allows the undo. **Tombstone management:** G→P adds an excluded global entry (gated on `wasInstalledGlobally`, which counts an existing global tombstone as installed); P→G unconditionally drops any global tombstone. |
| `toggleAgentScope(agentName)`       | `agentConfigs`                 | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. Mirrors `toggleSkillScope`: the sole dual-scope toggle, `s` round-trips a pair both ways — `[P][G]` → `[G]` → `[P][G]`. G→P adds the excluded global entry (gated on `wasInstalledGlobally`); P→G unconditionally drops it.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `setFocusedSkillId(id)`             | `focusedSkillId`               | Sets or clears the focused skill (for `S` hotkey scope toggle in build step). Dispatched by `CategoryGrid`'s **mount effect** keyed on the drawn cell — it fires on mount and on every change of that cell, including a category reshape that moves it without a keypress. Cooperates with the synchronous store seed `seedFocusedSkillForActiveDomain` -- see "Focus Seeding" below.                                                                                                                                                                                                                                                                                                                                                                              |
| `seedFocusedSkillForActiveDomain()` | `focusedSkillId`               | Synchronously sets `focusedSkillId` to the active domain's first grid option (via `buildCategoriesForDomain`), or `null` if the domain has no skills. Called by `setStep("build")`, `nextDomain`, `prevDomain`, `setCurrentDomainIndex`, and both hydration paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `setFocusedAgentId(id)`             | `focusedAgentId`               | Sets or clears the focused agent (for `S` hotkey scope toggle in agents step). Still seeded by a post-mount `useEffect` in `step-agents.tsx` (async — no synchronous store seed on the agent path).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Source Management Actions

`setInstallMode` is the only one. `setAllSourcesEject` / `setAllSourcesPlugin` were deleted with the bulk hotkeys that were their sole callers.

| Action                                 | State Modified | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setInstallMode(skillId, mode, scope)` | `skillConfigs` | **Scope-keyed**: resolves the mode to an `origin` value and rewrites the `SkillConfig.origin` of the ACTIVE entry at `(skillId, scope)` only, via `withActiveEntryOrigin`. A dual-scope skill's excluded global tombstone keeps its own origin, so a project-side change cannot leak across scopes. **Guarded**: silently returns the current state when `!isEditingFromGlobalScope` and the target `(id, scope)` slot is a global install the hydration snapshot already carried (`isInheritedGlobalSlot`). |

### UI Toggle Actions

| Action               | State Modified | Side Effects                                    |
| -------------------- | -------------- | ----------------------------------------------- |
| `toggleShowLabels()` | `showLabels`   | Boolean toggle                                  |
| `toggleInfo()`       | `showInfo`     | Boolean toggle (selected skills/agents overlay) |

### Population Actions

| Action                                          | State Modified                                                                                          | Side Effects                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `preselectAgentsFromStack(stackAgents)`         | `selectedAgents`, `agentConfigs`                                                                        | Merges the stack's agent keys with `globalAgentPreselections`, building each config via `buildAgentConfigForName` and re-appending excluded tombstones via `collectTombstones`. Replaces the removed `populateFromStack`; stack SKILL population is done separately by `populateFromSkillIds`.                                                               |
| `populateFromSkillIds(skillIds, savedConfigs?)` | `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `unresolvableSkillIds` | Resolves each skill's category/domain via `resolveSkillForPopulation()`. Unresolvable IDs are collected into `unresolvableSkillIds` (with a warning) rather than dropped silently (Scenario C). Restores `scope` / `origin` from `savedConfigs` and preserves excluded tombstones. Orders domains via `orderDomains`. Snapshots to `_stackDomainSelections`. |

### Reset Action

| Action    | State Modified | Side Effects                                                                          |
| --------- | -------------- | ------------------------------------------------------------------------------------- |
| `reset()` | All fields     | Restores every state field to `createInitialState()` values. See Initial State below. |

---

## Reset Matrix

Which actions trigger which resets:

| Action                         | `domainSelections` | `_stackDomainSelections` | `selectedDomains` | `skillConfigs` | `selectedAgents` | `agentConfigs` | `currentDomainIndex` | `stackAction` |
| ------------------------------ | :----------------: | :----------------------: | :---------------: | :------------: | :--------------: | :------------: | :------------------: | :-----------: |
| `selectStack(stackId)`         |       RESET        |          RESET           |       RESET       |     RESET      |      RESET       |     RESET      |        RESET         |     RESET     |
| `reset()`                      |       RESET        |          RESET           |       RESET       |     RESET      |      RESET       |     RESET      |        RESET         |     RESET     |
| `toggleDomain(off)`            |      partial       |            --            |      partial      |    partial     |        --        |       --       |          --          |      --       |
| `toggleDomain(on)`             |      partial       |            --            |      partial      |    partial     |        --        |       --       |          --          |      --       |
| `toggleTechnology()`           |      partial       |            --            |        --         |    partial     |        --        |       --       |          --          |      --       |
| `preselectAgentsFromStack()`   |         --         |            --            |        --         |       --       |       SET        |      SET       |          --          |      --       |
| `populateFromSkillIds()`       |        SET         |           SET            |        SET        |      SET       |        --        |       --       |          --          |      --       |
| `preselectAgentsFromDomains()` |         --         |            --            |        --         |       --       |       SET        |      SET       |          --          |      --       |

**Legend:** RESET = cleared to initial value. SET = replaced with new computed value. partial = specific entries updated (not full clear). `--` = not modified.

### selectStack() Reset Detail

**File:** `wizard-store.ts`

When a new stack is selected (or deselected via `null`), the following fields are reset to empty/initial values:

```
selectedStackId = stackId (the new value)
domainSelections = {}
_stackDomainSelections = null
selectedDomains = []
skillConfigs = []
selectedAgents = []
agentConfigs = []
currentDomainIndex = 0
stackAction = null
```

This is the most aggressive reset in the store -- it clears all downstream selections to prevent stale data from a previously selected stack.

### toggleDomain() Cascading Effects

**Remove a domain:**

1. Removes domain key from `domainSelections`
2. Collects all skill IDs in that domain's selections
3. Removes those skill IDs from `skillConfigs`
4. Removes domain from `selectedDomains`

**Add a domain:**

1. Checks `_stackDomainSelections` for a snapshot of that domain
2. If snapshot exists: restores selections via `structuredClone`, creates default skill configs for restored skills
3. If no snapshot: just adds domain to `selectedDomains` (empty selections)
4. Sorts `selectedDomains` canonically

---

## Derived State (Computed Selectors)

| Selector                             | Computes From                                                                   | Returns                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `getAllSelectedTechnologies()`       | `domainSelections` (all domains, all categories)                                | `SkillId[]` -- flat array of all selected skill IDs                                            |
| `getSelectedTechnologiesPerDomain()` | `domainSelections`                                                              | `Partial<Record<Domain, SkillId[]>>`                                                           |
| `getCurrentDomain()`                 | `selectedDomains`, `currentDomainIndex`                                         | `Domain \| null`                                                                               |
| `getTechnologyCount()`               | Calls `getAllSelectedTechnologies().length`                                     | `number`                                                                                       |
| `getStepProgress()`                  | `step`, `approach`, `selectedStackId`, `stackAction`                            | `{ completedSteps: WizardStep[], skippedSteps: WizardStep[] }`                                 |
| `canGoToNextDomain()`                | `currentDomainIndex`, `selectedDomains.length`                                  | `boolean`                                                                                      |
| `canGoToPreviousDomain()`            | `currentDomainIndex`                                                            | `boolean`                                                                                      |
| `deriveInstallMode()`                | `skillConfigs` (`origin` values)                                                | `InstallMode` (`"eject" \| "plugin" \| "mixed"`)                                               |
| `buildSourceRows()`                  | `getAllSelectedTechnologies()`, `skillConfigs`, `installedSkillConfigs`, matrix | `SourceRow[]` = `{ skillId, options: SourceOption[], scope?, readOnly?, disabled?, added? }[]` |

### getStepProgress() Logic

**File:** `wizard-store.ts`

| Current Step         | Completed Steps                                  | Skipped Steps                |
| -------------------- | ------------------------------------------------ | ---------------------------- |
| `stack`              | (none)                                           | (none)                       |
| `domains`            | `stack`                                          | (none)                       |
| `build`              | `stack`, `domains`                               | (none)                       |
| `sources`            | `stack`, `domains`, `build`                      | (none)                       |
| `agents`             | `stack`, `domains`, `build`, `sources`           | (none)                       |
| `confirm`            | `stack`, `domains`, `build`, `sources`, `agents` | (none)                       |
| `confirm` (defaults) | `stack`, `domains`                               | `build`, `sources`, `agents` |

The "defaults" shortcut case: `approach === "stack" && selectedStackId && stackAction === "defaults"` marks build/sources/agents as `skipped` instead of `completed`.

---

## Hotkey -> Action Mapping

**Hotkey registry:** `src/cli/components/wizard/hotkeys.ts`. Its export list is owned and bound to source by [`component-patterns.md`](../component-patterns.md), "Hotkeys Registry" — read the membership question there, not here. What this section owns is the MAPPING: which binding is live on which step, and which store method it reaches. Every character hotkey the registry holds appears in the tables below; the Sources step binds none, and no step has an `s`-key collision to gate.

### Global Hotkeys (wizard.tsx)

| Hotkey | Key | Active When                                              | Action                           | Store Method                                           |
| ------ | --- | -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| `A`    | `a` | `step === "build"` + stack selected                      | Accept defaults, jump to confirm | `setStackAction("defaults")` then `setStep("confirm")` |
| `S`    | `s` | `step === "build"`                                       | Toggle focused skill scope       | `toggleSkillScope(focusedSkillId)`                     |
| `S`    | `s` | `step === "agents"`                                      | Toggle focused agent scope       | `toggleAgentScope(focusedAgentId)`                     |
| `I`    | `i` | `isInfoPanelAvailable(step)` — i.e. `step !== "confirm"` | Open info overlay                | `toggleInfo()`                                         |

### Build Step Hotkeys (use-category-grid-input.ts)

| Hotkey | Key | Action                                    | Store Method         |
| ------ | --- | ----------------------------------------- | -------------------- |
| `D`    | `d` | Toggle compatibility labels on skill tags | `toggleShowLabels()` |

### Sources Step Hotkeys (step-sources.tsx)

None — and there is no second Sources screen for one to live on; the step renders one grid. `step-sources.tsx`'s `useInput` handles Enter and Escape only. The step's install-mode surface is `SourceGrid`'s per-row `SPACE`, which calls `setInstallMode(skillId, mode, actingScope)` and returns without acting on an inert row.

### Structural keys, by screen

The character hotkeys above are the whole of the `hotkeys.ts` registry, but they are a small
minority of what the wizard binds. Everything else is a structural key claimed by a step's own
`useInput` or by the grid hook it renders, and it is bound **per screen** — there is no shared
navigation layer. Ink fires every mounted `useInput` handler on every keypress, so a step's
handler and `wizard.tsx`'s global one both see the key; they stay on disjoint keys by convention,
not by mechanism.

| Screen          | Handlers                                                               | Keys                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`         | `useKeyboardNavigation`, through `StackSelection`                      | Up/down arrows and `k`/`j` move focus, wrapping. Enter selects the focused stack or the "Start from scratch" row. Escape calls the `onCancel` prop — `handleCancel` in `wizard.tsx`, so this is the one Escape in the wizard that ENDS the session rather than stepping back                                                                                                                        |
| `domains`       | `CheckboxGrid`'s own `useInput`                                        | Up/down arrows and `k`/`j` wrap over `items.length + 1` indices — one more than there are rows, and no row is drawn for the last one, so the pointer vanishes at that index. Space toggles the focused domain and does nothing at that extra index. Enter continues from ANY index. Escape calls `onBack`                                                                                           |
| `build`         | `useCategoryGridInput` for the grid, plus `StepBuild`'s own `useInput` | Grid: left/right/up/down arrows and `h`/`l`/`k`/`j`; Tab jumps to the next category section, wrapping; Shift+Tab and `d` both toggle labels; Space toggles the focused cell. Step: Enter is `onContinue`, Escape is `onBack`                                                                                                                                                                        |
| `sources`       | `SourceGrid`'s `useInput`, plus `StepSources`'s own                    | Grid: arrow keys ONLY — no vim keys here, unlike the build step. Left/right move between the row's two install-mode cells, up/down between rows. Space commits the focused cell and returns immediately on an inert row. Up/down drive the VIEWPORT instead of focus once focus sits on the last focusable row, or when no row is focusable at all. Step: Enter is `onContinue`, Escape is `onBack` |
| `agents`        | `StepAgents`'s own `useInput`                                          | Up/down arrows and `k`/`j` wrap over the agent rows plus a trailing `continue` row, which unlike the domains step IS drawn. Space toggles the focused agent and is skipped on `continue`. Enter goes to `confirm` from any focus position. Escape calls `goBack()`                                                                                                                                  |
| `confirm`       | `usePanelScroll` inside `SummaryPanel`, plus `StepConfirm`'s own       | Up/down scroll the panel one line. Enter completes the wizard, Escape is `onBack`. The two hooks are deliberately on disjoint keys — that is the whole reason `StepConfirm` claims only two                                                                                                                                                                                                         |
| the `I` overlay | `usePanelScroll` inside `SummaryPanel`, plus `wizard.tsx`              | Up/down scroll. `i` or Escape closes. Nothing else reaches anything: `wizard.tsx` returns from its handler while `showInfo` is true, and `WizardLayout` renders the panel INSTEAD of the step, so the step's own handler is unmounted                                                                                                                                                               |

Two consequences worth stating, because neither is visible from any one file:

- **Escape never means the same thing twice.** On `stack` it cancels the run; on `domains` it
  clears the stack choice and steps back, but only when `history` is non-empty; on `build` it walks
  domains before it walks steps; everywhere else it pops one step. `wizard.tsx`'s own `key.escape`
  branch is an explicit no-op that exists to say so.
- **Vim keys are not uniform.** `build`, `domains`, `agents` and `stack` accept them; the Sources
  grid reads `key.leftArrow` / `rightArrow` / `upArrow` / `downArrow` and nothing else, so `h`, `j`,
  `k` and `l` are inert there. Re-derive from `source-grid.tsx`'s `useInput` callback, which is the
  only place the difference is expressed.

### Overlay Blocking

When `showInfo === true`, all input is blocked except `ESC` and `I` (to close info).

**Opening is step-gated; closing is not.** `wizard.tsx` tests `store.showInfo` in a branch that runs BEFORE the `isInfoPanelAvailable(store.step)` check, so an already-open panel always closes on `I`/`ESC` regardless of step. Gating the close would strand an overlay opened on a step that later became disallowed. The confirm step is excluded from OPENING because it already renders the same `SummaryPanel`, and the overlay replaces the step rather than covering it — opening it there unmounted `StepConfirm` along with the only `Enter` handler, leaving no way to complete the wizard.

---

## Initial State

**File:** `wizard-store.ts` (`createInitialState()`)

| Field                      | Initial Value |
| -------------------------- | ------------- |
| `step`                     | `"stack"`     |
| `approach`                 | `null`        |
| `selectedStackId`          | `null`        |
| `stackAction`              | `null`        |
| `selectedDomains`          | `[]`          |
| `currentDomainIndex`       | `0`           |
| `domainSelections`         | `{}`          |
| `_stackDomainSelections`   | `null`        |
| `showLabels`               | `false`       |
| `skillConfigs`             | `[]`          |
| `focusedSkillId`           | `null`        |
| `unresolvableSkillIds`     | `[]`          |
| `showInfo`                 | `false`       |
| `selectedAgents`           | `[]`          |
| `agentConfigs`             | `[]`          |
| `focusedAgentId`           | `null`        |
| `installedSkillConfigs`    | `null`        |
| `installedAgentConfigs`    | `null`        |
| `isInitMode`               | `false`       |
| `isEditingFromGlobalScope` | `false`       |
| `toastMessage`             | `null`        |
| `globalPreselections`      | `null`        |
| `globalAgentPreselections` | `null`        |
| `history`                  | `[]`          |

---

## DOMAIN_AGENTS Preselection Map

**File:** `wizard-store.ts` (module-private const). Every key, bound to `DOMAIN_AGENTS` by `scripts/check-enumeration-drift.ts`:

| Domain | Preselected Agents                                                |
| ------ | ----------------------------------------------------------------- |
| `web`  | `web-developer`, `web-researcher`, `web-tester`, `pm`, `reviewer` |
| `api`  | `api-developer`, `api-researcher`, `api-tester`, `pm`, `reviewer` |
| `cli`  | `cli-developer`, `cli-tester`, `cli-researcher`, `pm`, `reviewer` |
| `ai`   | `ai-developer`, `ai-researcher`, `ai-tester`, `pm`, `reviewer`    |

Every domain rosters the cross-domain `reviewer`; the preselection union dedupes it. Other domains
(desktop, infra, meta, mobile, shared) have no preselected agents.

## Scratch Mode Default Domains

**File:** `src/cli/consts.ts`

When "Start from scratch" is selected, these domains are pre-toggled:

```typescript
const DEFAULT_SCRATCH_DOMAINS: readonly Domain[] = ["web", "api", "mobile"];
```

## Focus Seeding (Synchronous for Skills, Async for Agents)

**Skill path — synchronous seed PLUS a render-side re-dispatch.** Two writers cooperate; neither alone is sufficient, and the older "the mount effect was deleted" account of this doc is obsolete.

1. **Store seed, synchronous ("Fix A", finding `2026-07-19-async-post-mount-seed-read-by-sync-input-handler.md`).** `seedFocusedSkillForActiveDomain()` sets `focusedSkillId` before the frame is rendered, deriving the active domain's first grid option via `buildCategoriesForDomain` (reused, not re-implemented). It runs at every point where the build grid mounts fresh at row 0 / col 0: `hydrateWizardStore` (both paths), `setStep("build")`, and `nextDomain` / `prevDomain` / `setCurrentDomainIndex`. It resolves its domain as `getCurrentDomain() ?? FALLBACK_DOMAIN`, mirroring the build-step renderer's own fallback, so it can never return `null` while a cell is visibly focused — a cold entry with no domain selected would otherwise desync the store from the drawn grid and make `s` a silent no-op.
2. **`CategoryGrid` mount effect.** A `useEffect` keyed on the resolved focused cell calls `onFocusedSkillChange` → `setFocusedSkillId`. It fires **on mount** and on every subsequent change of that cell — including category reshapes that shift the cell with no navigation event. `useFocusedListItem` only fires `onChange` during navigation, so without this effect the initially highlighted cell would never reach the store. The dispatch was deliberately moved OUT of `handleFocusChange` so it is no longer navigation-gated.

Between them, the store's focused skill always matches what is drawn, and `s` works on a cold entry into the step. The Scenario B `null` race no longer applies to `focusedSkillId`. The E2E `FOCUS_EFFECT_FLUSH_MS` blind delay that existed to paper over the old race is gone and has not returned (no occurrences in `e2e/` or `src/`).

**Agent path — still async.** `focusedAgentId` is STILL seeded by a post-mount `useEffect` in `step-agents.tsx` (`setFocusedAgentId(focusedId)`), so the agents-step `S` scope hotkey retains the async-seed race the skill path eliminated.

**E2E keypress ordering (general):** independent of focus seeding, E2E tests must call `waitForWizardFooter()` before any keypress — but only on screens rendered by `WizardLayout`, since it matches the single footer string `"select"` that only `WizardLayout` paints; on a footer-less screen it hangs for the full timeout instead of settling. See `../concepts/guard-pattern.md` "Silent Guards and Race Surfaces".

## Tombstone Lifecycle Transitions

**See:** `../concepts/tombstone-pattern.md` for the full model. Summary of state transitions the wizard drives:

Direction convention below: **G→P** means the active entry moves from global to project scope; **P→G** is the reverse. `s` (`toggleSkillScope`) is the only key that moves an entry between scopes; a spacebar deselect and a domain deselect can still COLLAPSE a pair, by dropping the project half.

| From state                                              | Trigger                                   | To state        | Mechanism                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| active-global (was installed globally)                  | `toggleSkillScope` G→P                    | dual-scope      | Entry flips to `{scope: "project"}` AND a `{scope: "global", excluded: true}` tombstone is appended, gated on `wasInstalledGlobally` — which counts an existing global tombstone as installed, so a collapse→`s` restores a genuine pair                          |
| active-global (NOT installed globally)                  | `toggleSkillScope` G→P                    | active-project  | Flips `scope` on the single entry; **no** tombstone — a fresh init toggle must not mint one                                                                                                                                                                       |
| dual-scope                                              | `toggleSkillScope` P→G (the `s` collapse) | active-global   | Entry flips back to `{scope: "global"}` and any global tombstone for the id is dropped **unconditionally**, upholding "no active + tombstone at the same `(id, scope)`" and healing the case `wasInstalledGlobally` cannot see                                    |
| active-global (inherited)                               | `toggleTechnology` deselect (spacebar)    | — **refused** — | `isGloballyLockedSkill` returns `GLOBAL_SKILLS_LOCKED` and no state changes. A project edit may not uninstall a global install, in any flow, init included                                                                                                        |
| dual-scope                                              | `toggleTechnology` deselect (spacebar)    | active-global   | Allowed on the SKILL path: the project half is the project's own install, so `applySkillRemoval` drops both halves and re-surfaces one inherited `{scope: "global"}` active entry. Refused only when the deselect is an EXCLUSIVE swap, via `blocksExclusiveSwap` |
| dual-scope                                              | `toggleDomain` off                        | active-global   | `applySkillRemoval` drops BOTH halves and re-surfaces one inherited `{scope: "global"}` **active** entry so the `[G]` badge keeps rendering (Scenario B). It never stamps `excluded` — this path collapses a pair, it does not create one                         |
| inherited-global (snapshot tombstone, no project entry) | `toggleTechnology` reselect               | dual-scope      | `reconcileSkillConfigs`'s restore branch rebuilds BOTH `{scope: "project"}` and `{scope: "global", excluded: true}`, taking the source from the snapshot's global entry                                                                                           |
| tombstoned (live excluded entry)                        | `toggleTechnology` reselect               | active          | `reconcileSkillConfigs` clears `excluded` on the existing entry (no duplicate row)                                                                                                                                                                                |

**No store path mints a tombstone from a plain deselect any more.** `applySkillRemoval` removes only what the project OWNS and never stamps `excluded`; every deselect that could have produced one is refused upstream by the guards above. Tombstones now originate from exactly two places: `toggleSkillScope`'s G→P arm and `reconcileSkillConfigs`'s dual-scope restore (plus `toggleAgentScope` / `restoreDualScopeAgent` on the agent side).

Agent tombstones follow the same shape via `toggleAgentScope()`, which mirrors `toggleSkillScope` arm for arm, and `restoreDualScopeAgent()`. `applyAgentToggle()` is **not** a tombstone producer — it has no tombstone branch and no `installedAgentConfigs` parameter, so an agent deselect that reaches it is always a clean removal.

## Diff Projection (Derived View)

**Not a store transition -- a read-only projection.** `SkillAgentSummary` (rendered by `components/wizard/summary-panel.tsx` — which is what BOTH the `I` overlay in `wizard-layout.tsx` and `components/wizard/step-confirm.tsx` render — and by the dashboard `commands/list.tsx`) compares the live `skillConfigs` / `agentConfigs` arrays against the `installedSkillConfigs` / `installedAgentConfigs` snapshots captured at hydration time. The former `components/wizard/info-panel.tsx` is gone; the two wizard surfaces are now literally the same component, so they cannot project differently.

The snapshot is the **pre-filter baseline** (includes excluded tombstones) so the diff can render removals, install-mode changes, and scope changes correctly. The projection code is `computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts`, whose `DiffRowStatus` union has four members — `added`, `mode-changed`, `removed`, `unchanged`; there is no `source-changed` and never has been. `SkillAgentSummary` calls it. The members are enumerated and bound to source in [`features/wizard-flow.md`](../features/wizard-flow.md), which owns that list. See `../concepts/tombstone-pattern.md` "Role in the Info-Panel Diff" for the baseline-drift failure mode.

Because the snapshot is captured once in `hydrateWizardStore`, the diff remains stable across all subsequent store transitions -- it reflects "changes since entry," not "changes since last keystroke."

**There is a SECOND projection over the same baseline: the Sources tab.** `buildSourceRows()` computes its own `added` / pending-removal markers from `installedSkillConfigs`, because it must attach them to source ROWS rather than to diff rows. The two projections are held together by one exported key — `skillSlotKey(id, scope)` in `scope-diff.ts` — which both `classifyDiffRow` and the store's `collectInstalledSkillSlots` / `addedSlotFlag` / `collectRemovedInstalledEntries` call. They previously derived their own keys (confirm per slot, Sources per id) and disagreed on three user-visible shapes. Three rules follow, and all are load-bearing:

- **Key on the `(id, scope)` slot, never on the id alone.** An id legitimately occupies slots at both scopes at once — that is the normal dual-scope shape, not an edge case. Keying on the id is what hid the adoption of a globally-installed skill at project scope (old id, new slot).
- **Never gate a diff detector on `isEditingFromGlobalScope`.** Edit context changes what the store DOES with a change (drop vs. tombstone), never whether the change is reportable. At global scope `reconcileSkillConfigs` passes `null`, so `applySkillRemoval` drops the entry and the snapshot becomes the only surviving record — which makes such a gate self-defeating. `computeScopeDiff` has never had one.
- **A null baseline means "everything is new", on BOTH surfaces.** `installedSkillConfigs` is `null` on a genuine first `init`, and the two projections must read that the same way. `classifyDiffRow` always has: `isNew = prevKeySet === null || !prevKeySet.has(key)`. The Sources tab used to carry a separate `null` branch that flagged nothing, so the confirm step listed every skill with a green `+` while the Sources tab showed no markers at all. The branch is deleted rather than mirrored — `collectInstalledSkillSlots` now returns the EMPTY SET for `null`, and an empty baseline occupies no slot, so `addedSlotFlag` marks every row. A distinct "no baseline" state is not a third answer; it is the same answer as an empty one. (`collectRemovedInstalledEntries` still returns `[]` for `null` — correctly: with no snapshot nothing can have been emptied.)

The two surfaces still diverge deliberately on snapshot tombstones (the Sources tab excludes them as removal candidates; `computeScopeDiff` counts them) — see the Known Limitations table in `../component-patterns.md`, "SkillAgentSummary".

## Global-Installed Guard Behavior

> **Detailed documentation:** See [../concepts/guard-pattern.md](../concepts/guard-pattern.md) for the unified guard reference, [../concepts/scope-system.md](../concepts/scope-system.md) for the full scope system, and [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md) for tombstone lifecycle.

Guards prevent project-scope edits from modifying globally-installed skills/agents. The guard checks `installedSkillConfigs`/`installedAgentConfigs` against the `isEditingFromGlobalScope` flag.

**Guard pattern:** If a skill/agent is found in `installedSkillConfigs`/`installedAgentConfigs` with `scope === "global"` and `!excluded`, and the wizard is NOT in global-scope edit mode (`isEditingFromGlobalScope === false`), the action returns a toast message instead of modifying state. **`isInitMode` is not a bypass** — the lock holds in init too.

**Actions with global-installed guards:**

| Action               | Guard Behavior                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleTechnology()` | `GLOBAL_SKILLS_LOCKED` toast when the skill is globally owned (`isGloballyLockedSkill` on a deselect, `hasGlobalActive` on a select), and when an EXCLUSIVE swap would drop a globally-locked skill or a live `[P][G]` pair (`blocksExclusiveSwap`). A plain checkbox deselect of a live `[P][G]` row is **allowed** and collapses the pair.         |
| `toggleSkillScope()` | No-op if `isEditingFromGlobalScope`. The only scope MOVE — `s` round-trips `[P][G]` → `[G]` → `[P][G]`. `ALREADY_EJECTED_AT_GLOBAL` toast if project eject → global and a global eject is already installed (no tombstone).                                                                                                                          |
| `toggleAgent()`      | `GLOBAL_AGENTS_LOCKED` toast when the agent is globally owned, **and** when spacebar hits a live dual-scope `[P][G]` row — `isDualScopeAgentPair` is checked first and returns before anything else. This inert-spacebar branch exists on the agent path ONLY; the skill path has no counterpart. Both gated on not-editing-from-global-scope alone. |
| `toggleAgentScope()` | No-op if `isEditingFromGlobalScope`. The only scope MOVE on the agent path — `s` round-trips `[P][G]` → `[G]` → `[P][G]`.                                                                                                                                                                                                                            |
