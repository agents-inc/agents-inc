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
  - reference/wizard/store-map.md
  - reference/wizard/flow.md
  - reference/wizard/component-patterns.md
  - reference/features/configuration.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/guard-pattern.md
  - reference/concepts/scope-system.md
last_validated: 2026-07-23
---

# State Transitions

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

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

**Canonical order** (source of truth: `WIZARD_STEP_ORDER` in `src/cli/stores/wizard-store.ts`; `WIZARD_STEPS` in `src/cli/components/wizard/wizard-tabs.tsx` is derived from it via `.map()`):

| Index | Step        | Label   | Purpose                                           |
| ----- | ----------- | ------- | ------------------------------------------------- |
| 0     | `"stack"`   | Stack   | Select pre-built stack or "Start from scratch"    |
| 1     | `"domains"` | Domains | Select domains to configure (web, api, cli, etc.) |
| 2     | `"build"`   | Skills  | Per-domain skill selection via CategoryGrid       |
| 3     | `"sources"` | Sources | Choose source per skill (eject, marketplace)      |
| 4     | `"agents"`  | Agents  | Select agents to compile                          |
| 5     | `"confirm"` | Confirm | Review and confirm                                |

## Step Sequence Diagram

```
                                +-----------+
                                |   stack   |  (initial step)
                                +-----+-----+
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
                    ENTER (recommended) or               |
                    ENTER (after customize)               |
                              |                          |
                      preselectAgentsFromDomains()       |
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

**Stack-item population detail** (in `stack-selection.tsx` `handleSelect`): after `selectStack(id)` + `setStackAction("customize")`, agents are derived via `preselectAgentsFromStack(typedKeys(stack.skills))` and skills via `populateFromSkillIds(mergedIds, globalPreselections)` (the removed `populateFromStack` no longer exists). The scratch path restores `globalAgentPreselections` and merges `globalPreselections` before toggling `DEFAULT_SCRATCH_DOMAINS`.

**Backward navigation:** Every step uses `goBack()` (ESC key), which pops from `history[]` to return to the previous step.

## Forward Navigation Transitions

| From      | To        | Trigger                                                  | Component/File                           |
| --------- | --------- | -------------------------------------------------------- | ---------------------------------------- |
| `stack`   | `domains` | ENTER on "Start from scratch"                            | `stack-selection.tsx`                    |
| `stack`   | `domains` | ENTER on a stack item                                    | `stack-selection.tsx`                    |
| `domains` | `build`   | ENTER (continue, requires >= 1 domain selected)          | `domain-selection.tsx`                   |
| `build`   | `build`   | ENTER when `nextDomain()` returns true (more domains)    | `use-build-step-props.ts`                |
| `build`   | `sources` | ENTER when `nextDomain()` returns false (last domain)    | `use-build-step-props.ts`                |
| `build`   | `confirm` | `A` hotkey (accept defaults, requires `selectedStackId`) | `wizard.tsx`                             |
| `sources` | `agents`  | ENTER on "Use recommended" or ENTER in customize view    | `wizard.tsx` (via `onContinue` callback) |
| `agents`  | `confirm` | ENTER (continue)                                         | `step-agents.tsx`                        |

## Backward Navigation Transitions

| From      | To (via `goBack()`) | Trigger                                                  | Additional Side Effects                                    |
| --------- | ------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `domains` | `stack`             | ESC                                                      | `setApproach(null)`, `selectStack(null)` before `goBack()` |
| `build`   | `build`             | ESC when `prevDomain()` returns true                     | Decrements `currentDomainIndex`                            |
| `build`   | `domains`           | ESC when `prevDomain()` returns false                    | Pops from `history`                                        |
| `sources` | `build`             | ESC (in choice view or non-choice mode)                  | Pops from `history`                                        |
| `sources` | `sources`           | ESC in customize view (if `FEATURE_FLAGS.SOURCE_CHOICE`) | Returns to choice view, no step change                     |
| `agents`  | `sources`           | ESC                                                      | Pops from `history`                                        |
| `confirm` | `agents`            | ESC                                                      | Pops from `history`                                        |

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
5. If `initialAgents` or `installedAgentConfigs`: stashes into `globalAgentPreselections.agents`/`.configs` (restored via `preselectAgentsFromStack` / the scratch path after `selectStack()` wipes agents)
6. `seedFocusedSkillForActiveDomain()` -- runs at the end of init hydration too (seeds `null` when no domains are selected yet)

> **Note:** Older versions of this doc referenced `src/cli/components/hooks/use-wizard-initialization.ts`. That hook has been removed -- hydration lives in the store itself.

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

| Action                   | State Modified                                                                                                                                                                           | Side Effects                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setApproach(approach)`  | `approach`                                                                                                                                                                               | None                                                                                                                                                                                                                                       |
| `selectStack(stackId)`   | `selectedStackId`, `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `selectedAgents`, `agentConfigs`, `boundSkills`, `currentDomainIndex`, `stackAction` | **Full reset** -- see Reset Matrix. Note: `selectedAgents` and `agentConfigs` are cleared here but repopulated by `preselectAgentsFromStack()` (derives agents from the stack's agent keys) after `stack-selection.tsx` selects the stack. |
| `setStackAction(action)` | `stackAction`                                                                                                                                                                            | None                                                                                                                                                                                                                                       |

### Selection Actions

| Action                                           | State Modified                                                                       | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleDomain(domain)`                           | `selectedDomains`, `domainSelections`, `skillConfigs`                                | **Remove:** drops domain selections + their skill configs. **Add:** restores from `_stackDomainSelections` snapshot if available, creates default skill configs for restored skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `toggleTechnology(domain, cat, tech, exclusive)` | `domainSelections`, `skillConfigs`, `_sessionRebuiltScopePairSkills`, `toastMessage` | **Guard:** if skill is installed globally (active global, or a snapshot tombstone paired with a live active global) and not in global-scope edit or init mode, returns `GLOBAL_SKILLS_LOCKED` toast. Single-skill `exclusive && required` categories block deselection (`ONLY_SKILL_IN_CATEGORY`). Exclusive mode: blocks swap if current selection is globally installed. Uses `reconcileSkillConfigs()` for add/remove (marks global as excluded tombstone, restores tombstoned on re-add). A dual-scope deselect that collapses to a still-active inherited-global entry keeps the skill in the domain selection (`stillActiveAfterRemoval`); a spacebar re-select that rebuilds a `[P][G]` pair records the id in `_sessionRebuiltScopePairSkills`. |
| `toggleAgent(agent)`                             | `selectedAgents`, `agentConfigs`, `_sessionRebuiltScopePairAgents`, `toastMessage`   | **Dual-scope (D-233):** deselecting a `[P][G]` pair collapses it to inherited-global via `collapseDualScopeAgent` (agent stays in `selectedAgents`); re-selecting an inherited-global row rebuilds the pair via `restoreDualScopeAgent` (records id in `_sessionRebuiltScopePairAgents`). **Guard:** an active global agent (or a snapshot tombstone paired with a live active global) not in global-scope edit or init mode returns `GLOBAL_AGENTS_LOCKED` toast. **Tombstone logic:** `applyAgentToggle()` -- toggling off a globally-installed agent sets `excluded: true` (keeps agent in `selectedAgents`); toggling on a tombstoned agent clears `excluded`. Genuinely-new agents are added/removed with `scope: "global"` (see known bug below). |
| `preselectAgentsFromDomains()`                   | `selectedAgents`, `agentConfigs`                                                     | Collects agents from `DOMAIN_AGENTS` for selected domains and rebuilds `agentConfigs` via `buildAgentConfigForName` (prefers a saved project-scoped active entry over global), then re-appends ALL excluded tombstones via `collectTombstones` (D-227). Agents with no saved config default to `scope: "global"` (see known bug below).                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Known bug (OPEN) — newly-toggled agents default to global scope.** `applyAgentToggle`'s else-branch (a genuinely-new agent) and `buildAgentConfigForName`'s fallback (used by `preselectAgentsFromDomains` / `preselectAgentsFromStack` for an agent with no saved config) both default to `scope: "global"`, with no inspection of the surrounding project's scope convention. (`buildAgentConfigForName` DOES now inherit the saved scope for an agent that already has a config.) In an edit flow where existing skills and agents are all project-scoped, a freshly-toggled-on agent lands global-scoped. Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global agents", so the new agent receives zero stack assignments — `buildAgentStack` returns undefined and `stack[newAgent]` is never emitted, breaking the seeding contract asserted by `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts`. Source: `.ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`. Proposed rule (not yet codified): newly-toggled agents inherit scope from the dominant scope of existing non-excluded `agentConfigs` (or from `skillConfigs` if no active agent exists); a fresh init with zero agents continues to default to `"global"`.

### Skill/Agent Config Actions

| Action                              | State Modified                                                   | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleSkillScope(skillId)`         | `skillConfigs`, `_sessionRebuiltScopePairSkills`, `toastMessage` | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. **Guard 1 (persisted pair):** a `[P][G]` pair whose global tombstone is in `installedSkillConfigs` and NOT yet in `_sessionRebuiltScopePairSkills` is a guarded no-op → `INSTALLED_AT_BOTH_SCOPES` toast (space, not `s`, changes the project half). **Guard 2:** project eject → global blocked when global eject already installed → `ALREADY_EJECTED_AT_GLOBAL` toast unless an excluded tombstone allows the undo. **Tombstone management:** G→P adds an excluded global entry (gated on `wasInstalledGlobally`) and records the id in `_sessionRebuiltScopePairSkills`; P→G unconditionally drops any global tombstone. |
| `setSkillSource(skillId, src)`      | `skillConfigs`                                                   | Updates `source` field for matching skill config entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `toggleAgentScope(agentName)`       | `agentConfigs`, `_sessionRebuiltScopePairAgents`                 | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. Mirrors `toggleSkillScope`: persisted-pair guard → `INSTALLED_AT_BOTH_SCOPES` toast; G→P adds the excluded global entry and records the name in `_sessionRebuiltScopePairAgents`; P→G drops it.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setFocusedSkillId(id)`             | `focusedSkillId`                                                 | Sets or clears the focused skill (for `S` hotkey scope toggle in build step). Navigation-driven (CategoryGrid dispatches on move); initial seeding is done synchronously by `seedFocusedSkillForActiveDomain` -- see "Focus Seeding" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `seedFocusedSkillForActiveDomain()` | `focusedSkillId`                                                 | Synchronously sets `focusedSkillId` to the active domain's first grid option (via `buildCategoriesForDomain`), or `null` if the domain has no skills. Called by `setStep("build")`, `nextDomain`, `prevDomain`, `setCurrentDomainIndex`, and both hydration paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `setFocusedAgentId(id)`             | `focusedAgentId`                                                 | Sets or clears the focused agent (for `S` hotkey scope toggle in agents step). Still seeded by a post-mount `useEffect` in `step-agents.tsx` (async — no synchronous store seed on the agent path).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Source Management Actions

| Action                             | State Modified     | Side Effects                                                                                        |
| ---------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `setSourceSelection(skillId, src)` | `skillConfigs`     | Updates `source` field. No-op with warning if `skillId` or `src` is empty.                          |
| `setCustomizeSources(customize)`   | `customizeSources` | None                                                                                                |
| `setEnabledSources(sources)`       | `enabledSources`   | Filters out entries with empty-string keys (with warning).                                          |
| `setAllSourcesEject()`             | `skillConfigs`     | Sets `source: "eject"` for all skill configs.                                                       |
| `setAllSourcesPlugin()`            | `skillConfigs`     | Sets `source` to first non-eject `availableSource` per skill. Falls back to current source if none. |
| `bindSkill(skill)`                 | `boundSkills`      | Appends to array. Silently skips (with warning) if same `id + sourceUrl` already exists.            |

### UI Toggle Actions

| Action                       | State Modified                                           | Side Effects                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleShowLabels()`         | `showLabels`                                             | Boolean toggle                                                                                                                                                       |
| `toggleFilterIncompatible()` | `filterIncompatible`, `domainSelections`, `skillConfigs` | When enabling: finds framework-incompatible web skills (respecting locked), removes them from selections and skill configs. When disabling: just sets flag to false. |
| `toggleSettings()`           | `showSettings`                                           | Boolean toggle (source management overlay)                                                                                                                           |
| `toggleInfo()`               | `showInfo`                                               | Boolean toggle (selected skills/agents overlay)                                                                                                                      |

### Population Actions

| Action                                          | State Modified                                                                                          | Side Effects                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preselectAgentsFromStack(stackAgents)`         | `selectedAgents`, `agentConfigs`                                                                        | Merges the stack's agent keys with `globalAgentPreselections`, building each config via `buildAgentConfigForName` and re-appending excluded tombstones via `collectTombstones` (D-227). Replaces the removed `populateFromStack`; stack SKILL population is done separately by `populateFromSkillIds`.                                                           |
| `populateFromSkillIds(skillIds, savedConfigs?)` | `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `unresolvableSkillIds` | Resolves each skill's category/domain via `resolveSkillForPopulation()`. Unresolvable IDs are collected into `unresolvableSkillIds` (with a warning) rather than dropped silently (D-233 Scenario C). Restores `scope`/`source` from `savedConfigs` and preserves excluded tombstones. Orders domains via `orderDomains`. Snapshots to `_stackDomainSelections`. |

### Reset Action

| Action    | State Modified | Side Effects                                                                          |
| --------- | -------------- | ------------------------------------------------------------------------------------- |
| `reset()` | All fields     | Restores every state field to `createInitialState()` values. See Initial State below. |

---

## Reset Matrix

Which actions trigger which resets:

| Action                         | `domainSelections` | `_stackDomainSelections` | `selectedDomains` | `skillConfigs` | `selectedAgents` | `agentConfigs` | `boundSkills` | `currentDomainIndex` | `stackAction` |
| ------------------------------ | :----------------: | :----------------------: | :---------------: | :------------: | :--------------: | :------------: | :-----------: | :------------------: | :-----------: |
| `selectStack(stackId)`         |       RESET        |          RESET           |       RESET       |     RESET      |      RESET       |     RESET      |     RESET     |        RESET         |     RESET     |
| `reset()`                      |       RESET        |          RESET           |       RESET       |     RESET      |      RESET       |     RESET      |     RESET     |        RESET         |     RESET     |
| `toggleDomain(off)`            |      partial       |            --            |      partial      |    partial     |        --        |       --       |      --       |          --          |      --       |
| `toggleDomain(on)`             |      partial       |            --            |      partial      |    partial     |        --        |       --       |      --       |          --          |      --       |
| `toggleTechnology()`           |      partial       |            --            |        --         |    partial     |        --        |       --       |      --       |          --          |      --       |
| `toggleFilterIncompatible()`   |      partial       |            --            |        --         |    partial     |        --        |       --       |      --       |          --          |      --       |
| `preselectAgentsFromStack()`   |         --         |            --            |        --         |       --       |       SET        |      SET       |      --       |          --          |      --       |
| `populateFromSkillIds()`       |        SET         |           SET            |        SET        |      SET       |        --        |       --       |      --       |          --          |      --       |
| `preselectAgentsFromDomains()` |         --         |            --            |        --         |       --       |       SET        |      SET       |      --       |          --          |      --       |

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
boundSkills = []
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

| Selector                             | Computes From                                                         | Returns                                                        |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `getAllSelectedTechnologies()`       | `domainSelections` (all domains, all categories)                      | `SkillId[]` -- flat array of all selected skill IDs            |
| `getSelectedTechnologiesPerDomain()` | `domainSelections`                                                    | `Partial<Record<Domain, SkillId[]>>`                           |
| `getCurrentDomain()`                 | `selectedDomains`, `currentDomainIndex`                               | `Domain \| null`                                               |
| `getTechnologyCount()`               | Calls `getAllSelectedTechnologies().length`                           | `number`                                                       |
| `getStepProgress()`                  | `step`, `approach`, `selectedStackId`, `stackAction`                  | `{ completedSteps: WizardStep[], skippedSteps: WizardStep[] }` |
| `canGoToNextDomain()`                | `currentDomainIndex`, `selectedDomains.length`                        | `boolean`                                                      |
| `canGoToPreviousDomain()`            | `currentDomainIndex`                                                  | `boolean`                                                      |
| `deriveInstallMode()`                | `skillConfigs` (source values)                                        | `InstallMode` (`"eject" \| "plugin" \| "mixed"`)               |
| `buildSourceRows()`                  | `getAllSelectedTechnologies()`, `skillConfigs`, `boundSkills`, matrix | `{ skillId, options: SourceOption[], scope?, readOnly? }[]`    |

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

**Hotkey registry:** `src/cli/components/wizard/hotkeys.ts`. Exactly nine `HOTKEY_*` constants exist there -- `HOTKEY_INFO`, `HOTKEY_ACCEPT_DEFAULTS`, `HOTKEY_SCOPE`, `HOTKEY_SETTINGS` (the last two deliberately share the `s` key -- context-gated so both are never active at once), `HOTKEY_TOGGLE_LABELS`, `HOTKEY_FILTER_INCOMPATIBLE`, `HOTKEY_SET_ALL_LOCAL`, `HOTKEY_SET_ALL_PLUGIN`, and `HOTKEY_ADD_SOURCE` -- all enumerated in the tables below. No other `HOTKEY_*` constants exist.

### Global Hotkeys (wizard.tsx)

| Hotkey | Key | Active When                              | Action                           | Store Method                                           |
| ------ | --- | ---------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| `A`    | `a` | `step === "build"` + stack selected      | Accept defaults, jump to confirm | `setStackAction("defaults")` then `setStep("confirm")` |
| `S`    | `s` | `step === "build"`                       | Toggle focused skill scope       | `toggleSkillScope(focusedSkillId)`                     |
| `S`    | `s` | `step === "agents"`                      | Toggle focused agent scope       | `toggleAgentScope(focusedAgentId)`                     |
| `S`    | `s` | `step === "sources"`                     | Toggle settings overlay          | `toggleSettings()`                                     |
| `I`    | `i` | Any step (if `FEATURE_FLAGS.INFO_PANEL`) | Toggle info overlay              | `toggleInfo()`                                         |

### Build Step Hotkeys (use-category-grid-input.ts)

| Hotkey | Key | Action                                    | Store Method                 |
| ------ | --- | ----------------------------------------- | ---------------------------- |
| `D`    | `d` | Toggle compatibility labels on skill tags | `toggleShowLabels()`         |
| `F`    | `f` | Filter incompatible skills                | `toggleFilterIncompatible()` |

### Sources Step Hotkeys (step-sources.tsx, customize view)

| Hotkey | Key | Action                               | Store Method            |
| ------ | --- | ------------------------------------ | ----------------------- |
| `L`    | `l` | Set all skill sources to "eject"     | `setAllSourcesEject()`  |
| `P`    | `p` | Set all skill sources to marketplace | `setAllSourcesPlugin()` |

### Settings Step Hotkey (step-settings.tsx)

| Hotkey | Key | Action           | Store Method                |
| ------ | --- | ---------------- | --------------------------- |
| `A`    | `a` | Add a new source | (settings-specific handler) |

### Overlay Blocking

When `showSettings === true`, all input is blocked except `S` (to close settings). When `showInfo === true`, all input is blocked except `ESC` and `I` (to close info).

---

## Initial State

**File:** `wizard-store.ts` (`createInitialState()`)

| Field                            | Initial Value |
| -------------------------------- | ------------- |
| `step`                           | `"stack"`     |
| `approach`                       | `null`        |
| `selectedStackId`                | `null`        |
| `stackAction`                    | `null`        |
| `selectedDomains`                | `[]`          |
| `currentDomainIndex`             | `0`           |
| `domainSelections`               | `{}`          |
| `_stackDomainSelections`         | `null`        |
| `showLabels`                     | `false`       |
| `filterIncompatible`             | `false`       |
| `skillConfigs`                   | `[]`          |
| `focusedSkillId`                 | `null`        |
| `unresolvableSkillIds`           | `[]`          |
| `customizeSources`               | `false`       |
| `showSettings`                   | `false`       |
| `showInfo`                       | `false`       |
| `enabledSources`                 | `{}`          |
| `selectedAgents`                 | `[]`          |
| `agentConfigs`                   | `[]`          |
| `focusedAgentId`                 | `null`        |
| `boundSkills`                    | `[]`          |
| `installedSkillConfigs`          | `null`        |
| `installedAgentConfigs`          | `null`        |
| `_sessionRebuiltScopePairSkills` | `new Set()`   |
| `_sessionRebuiltScopePairAgents` | `new Set()`   |
| `isInitMode`                     | `false`       |
| `isEditingFromGlobalScope`       | `false`       |
| `toastMessage`                   | `null`        |
| `globalPreselections`            | `null`        |
| `globalAgentPreselections`       | `null`        |
| `history`                        | `[]`          |

---

## DOMAIN_AGENTS Preselection Map

**File:** `wizard-store.ts`

| Domain | Preselected Agents                                                                            |
| ------ | --------------------------------------------------------------------------------------------- |
| `web`  | `web-developer`, `web-reviewer`, `web-researcher`, `web-tester`, `web-pm`, `web-architecture` |
| `api`  | `api-developer`, `api-reviewer`, `api-researcher`                                             |
| `cli`  | `cli-developer`, `cli-tester`, `cli-reviewer`                                                 |

Other domains (mobile, shared, ai, infra, meta) have no preselected agents.

## Scratch Mode Default Domains

**File:** `src/cli/consts.ts`

When "Start from scratch" is selected, these domains are pre-toggled:

```typescript
const DEFAULT_SCRATCH_DOMAINS: readonly Domain[] = ["web", "api", "mobile"];
```

## Focus Seeding (Synchronous for Skills, Async for Agents)

**Skill path — synchronous (D-233 "Fix A", finding `2026-07-19-async-post-mount-seed-read-by-sync-input-handler.md`).** `focusedSkillId` IS now set synchronously on build-step entry by the store action `seedFocusedSkillForActiveDomain()`, which derives the active domain's first grid option via `buildCategoriesForDomain` (reused, not re-implemented). It is invoked at every point where the build grid mounts fresh at row 0 / col 0: `hydrateWizardStore` (both paths), `setStep("build")`, and the domain transitions `nextDomain` / `prevDomain` / `setCurrentDomainIndex`. CategoryGrid's former fire-once post-mount seed effect was **deleted**, and the E2E `FOCUS_EFFECT_FLUSH_MS` blind delay with it. The Scenario B `null` race for `focusedSkillId` no longer applies; navigation-driven updates still flow through `setFocusedSkillId` as the user moves.

**Agent path — still async.** `focusedAgentId` is STILL seeded by a post-mount `useEffect` in `step-agents.tsx` (`setFocusedAgentId(focusedId)`), so the agents-step `S` scope hotkey retains the async-seed race the skill path eliminated.

**E2E keypress ordering (general):** independent of focus seeding, E2E tests must call `waitForWizardFooter()` (renamed from `waitForStableRender`, finding `2026-07-20-waitforstablerender-renamed-to-waitforwizardfooter.md`) before any keypress — but only on screens rendered by `WizardLayout`, since it matches the single footer string `"select"` that only `WizardLayout` paints; on a footer-less screen it hangs for the full timeout instead of settling. See `../concepts/guard-pattern.md` "Silent Guards and Race Surfaces".

## Tombstone Lifecycle Transitions

**See:** `../concepts/tombstone-pattern.md` for the full model. Summary of state transitions the wizard drives:

| From state     | Trigger                                                | To state               | Mechanism                                                                                                                                 |
| -------------- | ------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| active-project | `toggleSkillScope` P -> G while global-eject installed | dual-scope             | `skillConfigs` keeps `{scope: "project"}` entry AND gains `{scope: "global", excluded: true}` tombstone (D-223/D-224 allow the undo path) |
| dual-scope     | `toggleSkillScope` G -> P (undo)                       | active-project         | Tombstone entry removed; project entry unchanged                                                                                          |
| active-project | `toggleTechnology` deselect (globally installed)       | global-only            | Project entry removed; `reconcileSkillConfigs` marks `excluded: true` on global entry                                                     |
| global-only    | `toggleTechnology` reselect                            | active-project         | `reconcileSkillConfigs` clears `excluded` on existing global entry (no duplicate row)                                                     |
| active-global  | `toggleSkillScope` G -> P (not global-installed)       | active-project         | Flips `scope` on single entry; no tombstone                                                                                               |
| any            | `toggleFilterIncompatible()` ON                        | unchanged for excluded | Filter skips `excluded: true` entries (protects tombstones)                                                                               |

Agent tombstones follow the identical pattern via `applyAgentToggle()` and `toggleAgentScope()`.

## Diff Projection (Derived View)

**Not a store transition -- a read-only projection.** `SkillAgentSummary` (rendered by `components/wizard/info-panel.tsx`, `components/wizard/step-confirm.tsx`, and the dashboard `commands/list.tsx`) compares the live `skillConfigs` / `agentConfigs` arrays against the `installedSkillConfigs` / `installedAgentConfigs` snapshots captured at hydration time.

The snapshot is the **pre-filter baseline** (includes excluded tombstones) so the diff can render removals, source changes, and scope changes correctly. The projection code is `computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts` (four `DiffRowStatus` classes: `added`/`removed`/`source-changed`/`unchanged`), which `SkillAgentSummary` calls. See `../concepts/tombstone-pattern.md` "Role in the Info-Panel Diff (D-230 / D-232)" for the baseline-drift failure mode (D-230/D-232) -- the standalone `d230-d232-diff-baseline-pre-filter-drift` finding was consolidated into that concept doc.

Because the snapshot is captured once in `hydrateWizardStore`, the diff remains stable across all subsequent store transitions -- it reflects "changes since entry," not "changes since last keystroke."

## Global-Installed Guard Behavior

> **Detailed documentation:** See [../concepts/guard-pattern.md](../concepts/guard-pattern.md) for the unified guard reference, [../concepts/scope-system.md](../concepts/scope-system.md) for the full scope system, and [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md) for tombstone lifecycle.

Guards prevent project-scope edits from modifying globally-installed skills/agents. The guard checks `installedSkillConfigs`/`installedAgentConfigs` against `isEditingFromGlobalScope` and `isInitMode` flags.

**Guard pattern:** If a skill/agent is found in `installedSkillConfigs`/`installedAgentConfigs` with `scope === "global"` and `!excluded`, and the wizard is NOT in global-scope edit mode (`isEditingFromGlobalScope === false`) and NOT in init mode (`isInitMode === false`), the action returns a toast message instead of modifying state.

**Actions with global-installed guards:**

| Action                       | Guard Behavior                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleTechnology()`         | `GLOBAL_SKILLS_LOCKED` toast if skill is installed globally. Also toasts if an exclusive swap would deselect a globally-installed skill.                                                                                                           |
| `toggleFilterIncompatible()` | `GLOBAL_SKILLS_LOCKED` toast (whole op refused) if any incompatible skill to remove is globally installed; also skips `excluded` entries when finding incompatible web skills (protects tombstoned globals).                                       |
| `toggleSkillScope()`         | No-op if `isEditingFromGlobalScope`. `INSTALLED_AT_BOTH_SCOPES` toast on a persisted dual-scope pair (unless session-rebuilt). `ALREADY_EJECTED_AT_GLOBAL` toast if project eject → global and a global eject is already installed (no tombstone). |
| `toggleAgent()`              | `GLOBAL_AGENTS_LOCKED` toast if agent is installed globally (not in global edit or init mode).                                                                                                                                                     |
| `toggleAgentScope()`         | No-op if `isEditingFromGlobalScope`. `INSTALLED_AT_BOTH_SCOPES` toast on a persisted dual-scope pair (unless session-rebuilt).                                                                                                                     |
