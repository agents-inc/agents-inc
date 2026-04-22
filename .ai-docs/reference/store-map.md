---
scope: reference
area: wizard
keywords: [zustand, wizard-store, state, actions, consumers, initial-state, toast, preselections]
related:
  - reference/wizard/state-transitions.md
  - reference/component-patterns.md
  - reference/features/wizard-flow.md
last_validated: 2026-04-21
---

# Store / State Map

**Last Updated:** 2026-04-21

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

| Field                    | Type                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectedDomains`        | `Domain[]`                   | Active domains                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `currentDomainIndex`     | `number`                     | Currently visible domain in build step                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `domainSelections`       | `DomainSelections`           | **Selection intent** — nested `domain → category → SkillId[]`. Represents what the user has ticked in the build step UI. Does NOT carry scope/source/excluded metadata.                                                                                                                                                                                                                                                                                                                |
| `_stackDomainSelections` | `DomainSelections \| null`   | Internal snapshot of domainSelections at hydration time (from either `populateFromStack` or `populateFromSkillIds`). Read by `toggleDomain` to re-apply the original per-domain selection when a previously-removed domain is re-enabled. Never cleared except on `selectStack` / `reset`. Leading underscore flags it as internal — do not read from UI components.                                                                                                                   |
| `selectedAgents`         | `AgentName[]`                | List of agent names the user has selected. Loosely paired with `agentConfigs`: an agent may appear here while `agentConfigs` has an `excluded: true` entry for the same name — that's the "visually off but globally installed" state (see `toggleAgent`). D-215 note: this field is retained (not removed) because an excluded-tombstone in `agentConfigs` still needs an entry in `selectedAgents` to keep `SelectedAgentName` correct for other projects sharing the global config. |
| `agentConfigs`           | `AgentScopeConfig[]`         | Per-agent `{ name, scope, excluded? }`. Source-of-truth for agent scope and tombstones. May contain tombstones for agents not in `selectedAgents` (preserved across `preselectAgentsFromDomains`).                                                                                                                                                                                                                                                                                     |
| `boundSkills`            | `BoundSkill[]`               | Foreign skills bound via search                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `skillConfigs`           | `SkillConfig[]`              | **Saved-config shape** — flat `{ id, scope, source, excluded? }[]` that mirrors what will be written to project/global config. Kept in sync with `domainSelections` via `reconcileSkillConfigs` / `restoreSkillConfigs` / `applySkillRemoval`. May contain excluded tombstones absent from `domainSelections`.                                                                                                                                                                         |
| `installedSkillConfigs`  | `SkillConfig[] \| null`      | Immutable snapshot of skill configs installed before the wizard opened. Set once by `hydrateWizardStore` and NEVER modified post-hydration. Serves as (a) the diff baseline for `SkillAgentSummary`, (b) the "was-previously-installed" probe for tombstone decisions in `applySkillRemoval` / `toggleSkillScope` / `toggleTechnology`, and (c) the source-of-truth for locked global rows in `buildSourceRows`. `null` in pure init mode with no prior installation.                  |
| `installedAgentConfigs`  | `AgentScopeConfig[] \| null` | Same semantics as `installedSkillConfigs`, but for agents. Drives tombstone creation in `toggleAgent`/`toggleAgentScope` and is what `effectiveInstalledConfigs` in `toggleAgent` is derived from.                                                                                                                                                                                                                                                                                     |

### UI State

| Field                      | Type                                                           | Purpose                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showLabels`               | `boolean`                                                      | Show compatibility labels on skill tags                                                                                                                                                                                                                                                                          |
| `filterIncompatible`       | `boolean`                                                      | Filter incompatible skills in build step grid                                                                                                                                                                                                                                                                    |
| `showSettings`             | `boolean`                                                      | Settings overlay visible                                                                                                                                                                                                                                                                                         |
| `showInfo`                 | `boolean`                                                      | Info overlay visible (selected skills and agents)                                                                                                                                                                                                                                                                |
| `focusedSkillId`           | `SkillId \| null`                                              | Currently focused skill (drives S hotkey → source-grid target and info-panel highlight). `null` is the default; components must tolerate `null` during the post-mount render window before any focus seeding effect fires (Scenario B race — the value may only become non-null after the first useEffect tick). |
| `focusedAgentId`           | `AgentName \| null`                                            | Currently focused agent (same semantics as `focusedSkillId`; drives S hotkey in agents step and info-panel)                                                                                                                                                                                                      |
| `isInitMode`               | `boolean`                                                      | True when running init (first-time setup); false when editing existing installation                                                                                                                                                                                                                              |
| `isEditingFromGlobalScope` | `boolean`                                                      | When true, scope toggling is disabled (editing from ~/.claude/)                                                                                                                                                                                                                                                  |
| `toastMessage`             | `string \| null`                                               | Temporary toast message shown in the wizard (auto-cleared after timeout)                                                                                                                                                                                                                                         |
| `globalPreselections`      | `SkillConfig[] \| null`                                        | Populated by `hydrateWizardStore` only in init flow (no `initialStep`) when existing global configs are found. Read by `stack-selection.tsx` to merge global skills into the fresh selection after the user picks a stack or "scratch". Never modified after hydration.                                          |
| `globalAgentPreselections` | `{ agents: AgentName[]; configs: AgentScopeConfig[] } \| null` | Populated by `hydrateWizardStore` only in init flow when existing global agents are found. Read by `stack-selection.tsx` to restore agents/configs after `selectStack()` wipes them. Never modified after hydration.                                                                                             |

### Source State

| Field              | Type                      | Purpose                       |
| ------------------ | ------------------------- | ----------------------------- |
| `customizeSources` | `boolean`                 | Show per-skill source pickers |
| `enabledSources`   | `Record<string, boolean>` | Source enable/disable state   |

## All Actions

### Navigation

| Action    | Signature                    | Effect                                |
| --------- | ---------------------------- | ------------------------------------- |
| `setStep` | `(step: WizardStep) => void` | Navigate, push current to history     |
| `goBack`  | `() => void`                 | Pop from history, fallback to "stack" |

### Approach / Stack

| Action           | Signature                                          | Effect                                       |
| ---------------- | -------------------------------------------------- | -------------------------------------------- |
| `setApproach`    | `(approach: "stack" \| "scratch" \| null) => void` | Set wizard approach                          |
| `selectStack`    | `(stackId: string \| null) => void`                | Select/deselect stack; resets all selections |
| `setStackAction` | `(action: "defaults" \| "customize") => void`      | Use stack as-is or customize                 |

### Selection

| Action                  | Signature                                           | Effect                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleDomain`          | `(domain: Domain) => void`                          | Add/remove domain, manages selections                                                                                                                                                                                                                                                                                                                                            |
| `toggleTechnology`      | `(domain, category, technology, exclusive) => void` | Radio (exclusive) or checkbox toggle. Guards: (1) blocks toggling off a globally-installed skill from project scope (toast); (2) in exclusive mode, blocks selecting a replacement when the currently-selected skill is globally installed; (3) blocks deselecting the last skill in an `exclusive && required` category. Reconciles `skillConfigs` via `reconcileSkillConfigs`. |
| `toggleAgent`           | `(agent: AgentName) => void`                        | Add/remove agent; guards against toggling globally-installed agents from project scope (shows toast); tombstone-aware toggle logic                                                                                                                                                                                                                                               |
| `bindSkill`             | `(skill: BoundSkill) => void`                       | Add foreign skill from search                                                                                                                                                                                                                                                                                                                                                    |
| `nextDomain`            | `() => boolean`                                     | Advance to next domain, returns success                                                                                                                                                                                                                                                                                                                                          |
| `prevDomain`            | `() => boolean`                                     | Go to previous domain, returns success                                                                                                                                                                                                                                                                                                                                           |
| `setCurrentDomainIndex` | `(index: number) => void`                           | Set domain index directly (no-op if out of range)                                                                                                                                                                                                                                                                                                                                |

### Scope / Source Per-Skill

| Action              | Signature                                    | Effect                                                                                                                                     |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `toggleSkillScope`  | `(skillId: SkillId) => void`                 | Toggle skill scope project/global; eject guard blocks project->global when global eject exists (allows undo if excluded tombstone present) |
| `setSkillSource`    | `(skillId: SkillId, source: string) => void` | Set source for a skill in configs                                                                                                          |
| `setFocusedSkillId` | `(id: SkillId \| null) => void`              | Set focused skill for S hotkey                                                                                                             |
| `toggleAgentScope`  | `(agentName: AgentName) => void`             | Toggle agent scope project/global                                                                                                          |
| `setFocusedAgentId` | `(id: AgentName \| null) => void`            | Set focused agent for S hotkey                                                                                                             |

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

| Action                       | Signature                           | When Used                                                                                                                |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `populateFromStack`          | `(stack) => void`                   | Stack selection in init wizard; now returns `selectedAgents` and `agentConfigs` derived from `Object.keys(stack.agents)` |
| `populateFromSkillIds`       | `(skillIds, savedConfigs?) => void` | Edit mode: restore from project config                                                                                   |
| `preselectAgentsFromDomains` | `() => void`                        | After domain selection                                                                                                   |

### Reset

| Action  | Signature    | Effect                                               |
| ------- | ------------ | ---------------------------------------------------- |
| `reset` | `() => void` | Restore all state to `createInitialState()` defaults |

### Computed Getters

| Getter                             | Returns                                     | Purpose                          |
| ---------------------------------- | ------------------------------------------- | -------------------------------- |
| `getAllSelectedTechnologies`       | `SkillId[]`                                 | Flat list of all selected skills |
| `getSelectedTechnologiesPerDomain` | `Partial<Record<Domain, SkillId[]>>`        | Skills grouped by domain         |
| `getCurrentDomain`                 | `Domain \| null`                            | Domain at currentDomainIndex     |
| `getTechnologyCount`               | `number`                                    | Total selected count             |
| `getStepProgress`                  | `{ completedSteps, skippedSteps }`          | For wizard tab indicators        |
| `canGoToNextDomain`                | `() => boolean`                             | Has next domain                  |
| `canGoToPreviousDomain`            | `() => boolean`                             | Has previous domain              |
| `buildSourceRows`                  | `{ skillId, options, scope?, readOnly? }[]` | Sources step UI data             |

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

## Internal Helpers

All declared at module scope in `wizard-store.ts`, not exported.

**`buildSkillConfigForId(id, savedConfigs?)`**: Builds a `SkillConfig` for a skill ID, preferring a project-scoped non-excluded entry from `savedConfigs` over a global one when duplicates exist (D-198 defensive fix). Falls back to `createDefaultSkillConfig` pattern.

**`createDefaultSkillConfig(id)`**: Returns a fresh `{ id, scope: "global", source: primary-or-default-public }` SkillConfig for a skill that has no saved config.

**`applySkillRemoval(configs, removedIds, installedSkillConfigs)`**: Removes project-scope skills outright; marks global-scope skills as `excluded: true` only if they appear in `installedSkillConfigs` (i.e. they were previously installed on disk). Invoked by `toggleDomain`, `toggleFilterIncompatible`, and `reconcileSkillConfigs`.

**`reconcileSkillConfigs(configs, added, removed, installedSkillConfigs)`**: Wrapper applied by `toggleTechnology`. Calls `applySkillRemoval` for removed skills, then for each added skill: un-excludes an existing tombstone if present, otherwise appends a `createDefaultSkillConfig` entry.

**`restoreSkillConfigs(existingConfigs, restoredIds)`**: Used by `toggleDomain` when a domain is re-enabled and a `_stackDomainSelections` snapshot exists. Clears `excluded` flags on the restored IDs and appends defaults for any newly-introduced IDs.

**`applyAgentToggle(configs, agent, isSelected, installedAgentConfigs)`**: Mirror of the skill tombstone logic for agents. Invoked by `toggleAgent`.

**`findIncompatibleWebSkills(webSelections, skillConfigs)` / `removeSkillsFromSelections(selections, toRemove)` / `collectSkillIdsFromSelections(selections)`**: Framework-compatibility helpers used by `toggleFilterIncompatible` and `toggleDomain`.

**`sortDomainsCanonically(domains)`**: Custom domains (alphabetical) then built-in domains per `BUILT_IN_DOMAIN_ORDER`. Used wherever a domain list is set (`toggleDomain`, `populateFromStack`, `populateFromSkillIds`).

**`resolveSkillForPopulation(skillId)`**: Looks up a skill → `{ domain, subcat, techId }` for `populateFromSkillIds`. Returns `null` with a warning when the skill isn't in the matrix or its category has no domain.

**`buildBoundSkillOptions(boundSkills, alias, selectedSource)`**: Converts matching `BoundSkill` entries into `SourceOption[]` for `buildSourceRows`.

**`getSourceSortTier(source)`**: Returns 1–4 for the fixed tier ordering in `buildSourceRows` (local → scoped → public → third-party).

## Hydration Entry Point

**`hydrateWizardStore(options: HydrateOptions): void`** — exported from `wizard-store.ts`. MUST be called before `render(<Wizard />)` so React captures the intended initial snapshot on the first frame (running hydration inside a render-phase hook causes a one-frame flash of the default `"stack"` step).

Called from `commands/init.tsx` (no `initialStep` → init flow) and `commands/edit.tsx` (with `initialStep`, `installedSkillIds`, etc. → edit flow).

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
7. In init flow with existing global configs: seeds `globalPreselections` / `globalAgentPreselections` for `stack-selection.tsx` to merge after the user picks stack/scratch

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

**Source sort tiers** (for source ordering in buildSourceRows):

1. eject/global (installed on disk -- type "eject" or installed via plugin)
2. scoped marketplace (primary source from --source flag)
3. default public marketplace (Agents Inc)
4. third-party marketplaces (extra configured sources)

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
- `isInitMode: false`, `isEditingFromGlobalScope: false`, `toastMessage: null`
- `globalPreselections: null`, `globalAgentPreselections: null`, `history: []`
