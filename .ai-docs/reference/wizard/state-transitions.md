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
last_validated: 2026-04-21
---

# State Transitions

**Last Updated:** 2026-04-21

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

**Canonical order** (from `WIZARD_STEPS` in `src/cli/components/wizard/wizard-tabs.tsx`):

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

**`goBack()` implementation** in `wizard-store.ts`: Pops from `history[]`, sets `step` to the popped value. Falls back to `"stack"` if history is empty.

## Accept-Defaults Shortcut

When a stack is selected and the user presses `A` during the build step:

1. `setStackAction("defaults")` -- marks the stack for as-is use
2. `setStep("confirm")` -- jumps directly to confirmation, skipping sources and agents

**Condition:** `store.step === "build" && store.selectedStackId` (checked in `wizard.tsx`)

**`getStepProgress()` response:** marks `build`, `sources`, `agents` as `skipped` (not `completed`)

## Hydration (Edit and Init Entry Points)

**Function:** `hydrateWizardStore(options)` in `src/cli/stores/wizard-store.ts`
**Callers:** `runEditWizard()` in `commands/edit.tsx`, `runWizard()` in `commands/init.tsx`

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

**Init mode** (no `initialStep`):

1. Same hard reset
2. `setState({ isInitMode: true })`
3. **Does NOT call `populateFromSkillIds`** -- stack-selection runs first; user chooses stack or scratch
4. If `installedSkillConfigs`: stashes into `globalPreselections` (merged by `stack-selection.tsx` after stack/scratch choice)
5. If `initialAgents` or `installedAgentConfigs`: stashes into `globalAgentPreselections.agents`/`.configs` (restored after `selectStack()` wipes agents)

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

| Action                     | State Modified       | Side Effects                                                                          |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `setStep(step)`            | `step`, `history`    | Pushes current `step` onto `history`, sets new `step`                                 |
| `goBack()`                 | `step`, `history`    | Pops last entry from `history`, sets `step` to that value (or `"stack"` if empty)     |
| `nextDomain()`             | `currentDomainIndex` | Increments by 1 if not at last domain. Returns `true` if advanced, `false` if at end. |
| `prevDomain()`             | `currentDomainIndex` | Decrements by 1 if not at first domain. Returns `true` if moved, `false` if at start. |
| `setCurrentDomainIndex(n)` | `currentDomainIndex` | Sets directly if valid (0 <= n < selectedDomains.length), no-op otherwise             |

### Approach/Stack Actions

| Action                   | State Modified                                                                                                                                                                           | Side Effects                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setApproach(approach)`  | `approach`                                                                                                                                                                               | None                                                                                                                                                                                    |
| `selectStack(stackId)`   | `selectedStackId`, `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `selectedAgents`, `agentConfigs`, `boundSkills`, `currentDomainIndex`, `stackAction` | **Full reset** -- see Reset Matrix. Note: `selectedAgents` and `agentConfigs` are cleared here but repopulated by `populateFromStack()` which derives them from the stack's agent keys. |
| `setStackAction(action)` | `stackAction`                                                                                                                                                                            | None                                                                                                                                                                                    |

### Selection Actions

| Action                                           | State Modified                                        | Side Effects                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleDomain(domain)`                           | `selectedDomains`, `domainSelections`, `skillConfigs` | **Remove:** drops domain selections + their skill configs. **Add:** restores from `_stackDomainSelections` snapshot if available, creates default skill configs for restored skills.                                                                                                                                                                                                                                        |
| `toggleTechnology(domain, cat, tech, exclusive)` | `domainSelections`, `skillConfigs`, `toastMessage`    | **Guard:** if skill is installed globally and not in global-scope edit or init mode, returns toast. Single-skill categories block deselection with toast. Exclusive mode: blocks swap if current selection is globally installed. Uses `reconcileSkillConfigs()` for add/remove (marks global as excluded tombstone, restores tombstoned on re-add).                                                                        |
| `toggleAgent(agent)`                             | `selectedAgents`, `agentConfigs`, `toastMessage`      | **Guard:** if agent is installed globally and not in global-scope edit or init mode, returns toast instead of toggling. **Tombstone logic:** uses `applyAgentToggle()` -- toggling off a globally-installed agent sets `excluded: true` (keeps agent in `selectedAgents`); toggling on a tombstoned agent clears `excluded`. Fresh agents are simply added/removed with hard-coded `scope: "global"` (see known bug below). |
| `preselectAgentsFromDomains()`                   | `selectedAgents`, `agentConfigs`                      | Collects agents from `DOMAIN_AGENTS` for selected domains, merges with existing `agentConfigs` (preserves scope, clears `excluded` on matched), preserves excluded entries not in the new list. All new agents scoped as `"global"` (see known bug below).                                                                                                                                                                  |

**Known bug — newly-toggled agents default to global scope.** `applyAgentToggle` (else-branch) and `preselectAgentsFromDomains` both hard-code `scope: "global"` for every new agent, with no inspection of the surrounding project's scope convention. In an edit flow where existing skills and agents are all project-scoped, a freshly-toggled-on agent lands global-scoped. Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global agents", so the new agent receives zero stack assignments — `buildAgentStack` returns undefined and `stack[newAgent]` is never emitted, breaking the seeding contract asserted by `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts`. Source: `.ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`. Proposed rule (not yet codified): newly-toggled agents inherit scope from the dominant scope of existing non-excluded `agentConfigs` (or from `skillConfigs` if no active agent exists); a fresh init with zero agents continues to default to `"global"`.

### Skill/Agent Config Actions

| Action                         | State Modified                 | Side Effects                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleSkillScope(skillId)`    | `skillConfigs`, `toastMessage` | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. **Guard:** project eject to global blocked when global eject already installed -- returns toast unless an excluded tombstone entry exists (allows undo). **Tombstone management:** moving global-installed to project adds excluded global entry; moving back to global removes it. |
| `setSkillSource(skillId, src)` | `skillConfigs`                 | Updates `source` field for matching skill config entry.                                                                                                                                                                                                                                                                                                                      |
| `toggleAgentScope(agentName)`  | `agentConfigs`                 | Toggles `scope` between `"project"` and `"global"`. No-op if `isEditingFromGlobalScope`. **Tombstone management:** moving global-installed to project adds excluded global entry; moving back to global removes it.                                                                                                                                                          |
| `setFocusedSkillId(id)`        | `focusedSkillId`               | Sets or clears the focused skill (for `S` hotkey scope toggle in build step). **Seeded asynchronously** -- see "Focus Seeding" below.                                                                                                                                                                                                                                        |
| `setFocusedAgentId(id)`        | `focusedAgentId`               | Sets or clears the focused agent (for `S` hotkey scope toggle in agents step). Same async seeding pattern as `focusedSkillId`.                                                                                                                                                                                                                                               |

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

| Action                                          | State Modified                                                                                                    | Side Effects                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `populateFromStack(stack)`                      | `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`, `selectedAgents`, `agentConfigs` | Iterates stack agents' skill assignments, builds domain selections, snapshots to `_stackDomainSelections`, creates default skill configs. Derives `selectedAgents` and `agentConfigs` from stack agent keys (`Object.keys(stack.agents).filter(isAgentName)`). Sorts domains canonically. |
| `populateFromSkillIds(skillIds, savedConfigs?)` | `domainSelections`, `_stackDomainSelections`, `selectedDomains`, `skillConfigs`                                   | Resolves each skill's category/domain via `resolveSkillForPopulation()`. Warns for unresolvable skills. Restores `scope`/`source` from `savedConfigs` if provided. Snapshots to `_stackDomainSelections`.                                                                                 |

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
| `populateFromStack()`          |        SET         |           SET            |        SET        |      SET       |       SET        |      SET       |      --       |          --          |      --       |
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

**Hotkey registry:** `src/cli/components/wizard/hotkeys.ts`

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
| `filterIncompatible`       | `false`       |
| `skillConfigs`             | `[]`          |
| `focusedSkillId`           | `null`        |
| `customizeSources`         | `false`       |
| `showSettings`             | `false`       |
| `showInfo`                 | `false`       |
| `enabledSources`           | `{}`          |
| `selectedAgents`           | `[]`          |
| `agentConfigs`             | `[]`          |
| `focusedAgentId`           | `null`        |
| `boundSkills`              | `[]`          |
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

## Focus Seeding (Async Transition)

**`focusedSkillId` is NOT set synchronously on step entry.** When the wizard transitions into `build`, `focusedSkillId` stays at whatever its previous value was (often `null` after hydration). It is seeded by a mount-phase `useEffect` inside `CategoryGrid` that fires `onFocusedSkillChange(firstSkill.id)` on first commit, which dispatches `setFocusedSkillId` through `step-build.tsx`'s `handleFocusedSkillChange` callback.

**Consequence -- the Scenario B race:** a fast `S` keypress that arrives between the `build` step's first commit and the mount effect sees `focusedSkillId === null`. The hotkey dispatcher's `HOTKEY_SCOPE` guard bails silently (no toast), so the keystroke is swallowed. E2E tests must call `waitForStableRender()` before any keypress. See `../concepts/guard-pattern.md` "Silent Guards and Race Surfaces" and findings `2026-04-21-e2e-build-step-keypress-missing-stable-render.md` / `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md`.

A synchronous-seeding fix in `hydrateWizardStore` would eliminate the race class but has not been applied.

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

**Not a store transition -- a read-only projection.** `SkillAgentSummary` (info panel) and `step-confirm` compare the live `skillConfigs` / `agentConfigs` arrays against the `installedSkillConfigs` / `installedAgentConfigs` snapshots captured at hydration time.

The snapshot is the **pre-filter baseline** (includes excluded tombstones) so the diff can render removals, source changes, and scope changes correctly. See finding `2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md` for the baseline-drift failure mode (D-230/D-232) and `components/wizard/skill-agent-summary.tsx` for the projection code.

Because the snapshot is captured once in `hydrateWizardStore`, the diff remains stable across all subsequent store transitions -- it reflects "changes since entry," not "changes since last keystroke."

## Global-Installed Guard Behavior

> **Detailed documentation:** See [../concepts/guard-pattern.md](../concepts/guard-pattern.md) for the unified guard reference, [../concepts/scope-system.md](../concepts/scope-system.md) for the full scope system, and [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md) for tombstone lifecycle.

Guards prevent project-scope edits from modifying globally-installed skills/agents. The guard checks `installedSkillConfigs`/`installedAgentConfigs` against `isEditingFromGlobalScope` and `isInitMode` flags.

**Guard pattern:** If a skill/agent is found in `installedSkillConfigs`/`installedAgentConfigs` with `scope === "global"` and `!excluded`, and the wizard is NOT in global-scope edit mode (`isEditingFromGlobalScope === false`) and NOT in init mode (`isInitMode === false`), the action returns a toast message instead of modifying state.

**Actions with global-installed guards:**

| Action                       | Guard Behavior                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `toggleTechnology()`         | Toast if skill is installed globally. Also toasts if exclusive swap would deselect a globally-installed skill.           |
| `toggleSkillScope()`         | No-op if `isEditingFromGlobalScope`. Toast if project eject to global and global eject already installed (no tombstone). |
| `toggleAgent()`              | Toast if agent is installed globally (not in global edit or init mode).                                                  |
| `toggleAgentScope()`         | No-op if `isEditingFromGlobalScope`.                                                                                     |
| `toggleFilterIncompatible()` | Skips skills with `excluded` flag when finding incompatible web skills (protects tombstoned globals).                    |
