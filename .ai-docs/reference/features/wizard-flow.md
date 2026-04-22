---
scope: reference
area: wizard
keywords:
  [
    wizard-steps,
    navigation,
    guards,
    scope-toggle,
    dual-scope,
    lock-icon,
    stack-grouping,
    agent-preselection,
    init-mode,
    edit-mode,
  ]
related:
  - reference/store-map.md
  - ../wizard/state-transitions.md
  - reference/component-patterns.md
  - reference/commands/index.md
last_validated: 2026-04-21
---

# Wizard Flow

**Last Updated:** 2026-04-21

## Overview

**Purpose:** Multi-step interactive terminal UI for selecting skills, agents, and sources.

**Rendered by:** `init` and `edit` commands using Ink (React-based terminal rendering).

**State:** Zustand store at `src/cli/stores/wizard-store.ts`

## Step Progression

```
stack -> domains -> build -> sources -> agents -> confirm
```

- `stack`: Select a pre-built stack OR choose "Start from scratch"
- `domains`: Select which domains to configure (checkboxes)
- `build`: Per-domain skill selection (CategoryGrid with category sections)
- `sources`: Choose which source provides each skill (recommended vs custom)
- `agents`: Select which agents to compile
- `confirm`: Review selections and confirm

**Step type** in `src/cli/stores/wizard-store.ts`:

```typescript
type WizardStep = "stack" | "domains" | "build" | "sources" | "agents" | "confirm";
```

**Shortcut:** If stack selected with `stackAction: "defaults"`, jumps directly to confirm (skips build/sources/agents). Both stack and scratch flows go through `domains` step.

## Component Architecture

```
Wizard (src/cli/components/wizard/wizard.tsx)
  |-> WizardLayout (wizard-layout.tsx)
  |     |-> WizardTabs (wizard-tabs.tsx) - Step progress indicators
  |     |-> InfoPanel (info-panel.tsx) - Skill/agent scope summary (feature-flagged: FEATURE_FLAGS.INFO_PANEL)
  |     |-> WizardFooter (inline in wizard-layout.tsx) - SPACE/ENTER/ESC key hints
  |
  |-> Step Components (conditional render based on store.step):
  |     |-> StepStack (step-stack.tsx) - Stack selection
  |     |     |-> StackSelection (stack-selection.tsx) - Stack list + "Start from scratch"
  |     |-> DomainSelection (domain-selection.tsx) - Domain toggles
  |     |     |-> CheckboxGrid (checkbox-grid.tsx) - Generic checkbox list
  |     |-> StepBuild (step-build.tsx) - Technology selection
  |     |     |-> CategoryGrid (category-grid.tsx) - Category sections
  |     |     |     |-> CheckboxGrid (checkbox-grid.tsx) - Skill toggles (reused)
  |     |     |-> SectionProgress (section-progress.tsx) - Category progress
  |     |-> StepSources (step-sources.tsx) - Source selection
  |     |     |-> SelectionCard (selection-card.tsx) - Choice card (feature-flagged: SOURCE_CHOICE)
  |     |     |-> SourceGrid (source-grid.tsx) - Per-skill source picker
  |     |     |-> SearchModal (search-modal.tsx) - Bound skill search (feature-flagged: SOURCE_SEARCH)
  |     |-> StepAgents (step-agents.tsx) - Agent selection
  |     |-> StepConfirm (step-confirm.tsx) - Confirmation
  |     |     |-> SkillAgentSummary (skill-agent-summary.tsx) - 2-box skill/agent listing
  |
  |-> Overlays:
        |-> StepSettings (step-settings.tsx) - Source management (S hotkey on sources step; always functional, footer label gated by SOURCE_SEARCH)
```

Additional wizard components (not in main render tree):

- `menu-item.tsx` - Reusable menu item component
- `selection-card.tsx` - Selection card display (used by StepSources choice view)
- `step-refine.tsx` - Refinement step (all-recommended vs customize); currently unused in renderStep switch
- `toast.tsx` - Toast notification component (styled text block with padding)

## Feature Flags

Feature flags live at `src/cli/lib/feature-flags.ts`:

| Flag            | Default | Controls                                                       |
| --------------- | ------- | -------------------------------------------------------------- |
| `SOURCE_SEARCH` | `false` | Search pill in source grid, settings overlay access            |
| `SOURCE_CHOICE` | `false` | Intermediate "recommended vs customize" screen in sources step |
| `INFO_PANEL`    | `true`  | `I` key opens info panel overlay in wizard-layout              |

## Wizard Props (from commands)

```typescript
// src/cli/components/wizard/wizard.tsx
type WizardProps = {
  onComplete: (result: WizardResultV2) => void; // Called on confirm
  onCancel: () => void; // Called on cancel paths (each step handles its own ESC)
  version?: string; // CLI version for display
  logo?: string; // ASCII logo for header
  projectDir?: string;
  startupMessages?: StartupMessage[]; // Messages to display on startup
  initialAgents?: AgentName[]; // Used by StepSources onContinue to gate preselectAgentsFromDomains
  installedSkillIds?: SkillId[]; // Used by useBuildStepProps for install-state markers
};
```

**Important:** edit/init mode state (`initialStep`, `initialDomains`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`) is NOT passed as Wizard props. It is hydrated directly into the Zustand store via `hydrateWizardStore()` (called from `init.tsx` and `edit.tsx` BEFORE `render(<Wizard .../>)`). See the `HydrateOptions` type in `wizard-store.ts`.

**Why:** rendering the wizard first and then pushing state via props caused a one-frame flash of the default "stack" step before the jump to `initialStep` committed. Hydrating synchronously before render ensures React captures the correct initial snapshot.

**Removed in 0.122.0:** `lockedSkillIds` and `lockedAgentNames` props are gone. Global-item locking is now handled inside the store via `isInstalledGlobal` guards on `toggleAgent`/`toggleTechnology` (checks `installedSkillConfigs`/`installedAgentConfigs` + `isInitMode`).

**Note:** The wizard does NOT receive a `matrix` prop. It accesses the matrix singleton via `matrix-provider.ts` imports.

## HydrateOptions (edit/init setup)

```typescript
// src/cli/stores/wizard-store.ts
export type HydrateOptions = {
  initialStep?: WizardStep; // "build" for edit mode; omitted for init mode
  initialDomains?: Domain[]; // Restore saved domains from config
  initialAgents?: AgentName[]; // Restore saved agent selection
  installedSkillIds?: SkillId[]; // Skills currently installed (for edit-mode populateFromSkillIds)
  installedSkillConfigs?: SkillConfig[]; // Saved scope/source configs
  installedAgentConfigs?: AgentScopeConfig[]; // Saved agent scope configs
  isEditingFromGlobalScope?: boolean; // When true, disables scope toggle (S key)
};
```

Behavior by mode:

- **Init mode** (`initialStep` omitted): `isInitMode = true`, store starts at `step: "stack"`. Saved global configs (if any) are stashed as `globalPreselections` / `globalAgentPreselections` to be merged after stack/scratch selection.
- **Edit mode** (`initialStep: "build"`): `isInitMode = false`, store jumps directly to build step with empty history. `populateFromSkillIds(installedSkillIds, installedSkillConfigs)` hydrates skill selections. Saved domains/agents override the defaults.

## WizardResultV2 (`src/cli/components/wizard/wizard.tsx`)

```typescript
type WizardResultV2 = {
  skills: SkillConfig[]; // { id, scope, source } per skill
  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[]; // { name, scope } per agent
  selectedStackId: string | null;
  domainSelections: DomainSelections;
  selectedDomains: Domain[];
  cancelled: boolean;
  validation: {
    valid: boolean;
    errors: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  };
};
```

## Wizard Hooks

| Hook                       | File                                                       | Purpose                          |
| -------------------------- | ---------------------------------------------------------- | -------------------------------- |
| `useBuildStepProps`        | `src/cli/components/hooks/use-build-step-props.ts`         | Compute build step derived data  |
| `useCategoryGridInput`     | `src/cli/components/hooks/use-category-grid-input.ts`      | Keyboard navigation for grid     |
| `useKeyboardNavigation`    | `src/cli/components/hooks/use-keyboard-navigation.ts`      | Arrow key + Enter handling       |
| `useFocusedListItem`       | `src/cli/components/hooks/use-focused-list-item.ts`        | Focus tracking for lists         |
| `useFrameworkFiltering`    | `src/cli/components/hooks/use-framework-filtering.ts`      | Framework-first skill filtering  |
| `useMeasuredHeight`        | `src/cli/components/hooks/use-measured-height.ts`          | Component height measurement     |
| `useModalState`            | `src/cli/components/hooks/use-modal-state.ts`              | Modal open/close state           |
| `useRowScroll`             | `src/cli/components/hooks/use-row-scroll.ts`               | Row-based scroll position        |
| `useSectionScroll`         | `src/cli/components/hooks/use-section-scroll.ts`           | Section-based scroll position    |
| `useSourceGridSearchModal` | `src/cli/components/hooks/use-source-grid-search-modal.ts` | Search modal for sources         |
| `useSourceOperations`      | `src/cli/components/hooks/use-source-operations.ts`        | Source add/remove operations     |
| `useTerminalDimensions`    | `src/cli/components/hooks/use-terminal-dimensions.ts`      | Terminal width/height tracking   |
| `useTextInput`             | `src/cli/components/hooks/use-text-input.ts`               | Text input handling              |
| `useVirtualScroll`         | `src/cli/components/hooks/use-virtual-scroll.ts`           | Virtual scrolling for long lists |

## Build Step Logic

**Pure functions:** `src/cli/lib/wizard/build-step-logic.ts`

Contains non-UI logic extracted from the build step for testability:

- `validateBuildStep()` - Validate build step selections (required categories)
- `isCompatibleWithSelectedFrameworks()` - Check if a skill is compatible with selected framework skills
- `buildCategoriesForDomain()` - Build category row data for a domain

## Edit Mode Flow

When `edit` command enters the wizard (see `runEditWizard` in `edit.tsx`):

1. `hydrateWizardStore({ initialStep: "build", ... })` runs BEFORE `render(<Wizard/>)`. This jumps the store straight to the build step with empty history.
2. `installedSkillIds` and `installedSkillConfigs` are passed to `populateFromSkillIds(skillIds, savedConfigs)` inside hydrate to hydrate skill selections.
3. `initialDomains` and `initialAgents` (from saved config) override defaults.
4. `installedAgentConfigs` becomes `agentConfigs` (scope preserved) and is snapshotted into `installedAgentConfigs` for diff rendering.
5. Global-item locking handled inside store: `toggleAgent`/`toggleTechnology` check `installedSkillConfigs`/`installedAgentConfigs` + `isInitMode` and show toast if blocked.
6. `isEditingFromGlobalScope` disables scope toggle (S key) when editing from the global install root.
7. User modifies selections; `goBack` navigates through `history` (empty at start in edit mode, so ESC on build exits via `onCancel`).
8. On confirm: `detectConfigChanges()` in `edit.tsx` produces `ConfigChanges` (added/removed/sourceChanges/scopeChanges/agentScopeChanges) and applies migrations, plugin install/uninstall, local-skill copy, config write, and agent recompile in order.

**Edit mode step order:** `build -> sources -> agents -> confirm` (stack and domains are skipped).

## Keyboard Navigation

Hotkeys are centralized in `src/cli/components/wizard/hotkeys.ts`.

### Global hotkeys (handled in `wizard.tsx`)

- `I`: Toggle info panel (`HOTKEY_INFO`); feature-flagged by `FEATURE_FLAGS.INFO_PANEL`.
- `A` (build step with stack selected): Accept stack defaults, set `stackAction = "defaults"`, jump to `confirm` (`HOTKEY_ACCEPT_DEFAULTS`).
- `S` (build step): Toggle focused skill scope (project/global) via `toggleSkillScope`; suppressed with toast when `isEditingFromGlobalScope` (`HOTKEY_SCOPE`).
- `S` (agents step): Toggle focused agent scope via `toggleAgentScope`; suppressed with toast when `isEditingFromGlobalScope` (`HOTKEY_SCOPE`).
- `S` (sources step): Toggle settings overlay via `toggleSettings` (`HOTKEY_SETTINGS`). Always functional; footer label is gated by `SOURCE_SEARCH`.
- `S` (settings overlay): Closes the overlay (same `HOTKEY_SETTINGS`).
- `Escape` (in wizard.tsx): Explicit no-op. Each step owns ESC handling (see Cancellation below).

### Cancellation semantics

- `wizard.tsx`'s `useInput` treats `key.escape` as a no-op and documents which step handles it: `stack` (StackSelection `onCancel`), `domains` (CheckboxGrid `onBack`), `build` (own `useInput`), `sources` (`onBack` prop), `agents` (own `useInput`), `confirm` (`onBack` prop).
- **Ctrl+C**: Ink translates Ctrl+C to SIGINT by default, which calls `useApp().exit()`. The wizard has no custom Ctrl+C handler. Whichever callback fired last (`onComplete` or `onCancel`) determines whether `wizardResult` was populated. If the user hit Ctrl+C before completing, `wizardResult` is `null` and the parent command treats it as cancelled (`init.tsx` exits with `EXIT_CODES.CANCELLED`; `edit.tsx` calls `this.error("Cancelled", ...)`). No partial state is written.
- `onCancel` logs "Setup cancelled" (init) or "Edit cancelled" (edit) but does NOT call `exit()` -- completion of the Ink render handles that.

### Per-step hotkeys

Build step (in `hotkeys.ts`):

- `D`: Toggle labels display (`HOTKEY_TOGGLE_LABELS`)
- `F`: Toggle incompatible skill filtering (`HOTKEY_FILTER_INCOMPATIBLE`)

Sources step (customize view, handled in `step-sources.tsx`):

- `L`: Set all sources to local/eject (`HOTKEY_SET_ALL_LOCAL`)
- `P`: Set all sources to plugin/marketplace (`HOTKEY_SET_ALL_PLUGIN`)
- `ENTER`: Continue to agents step (or in choice view, proceed with selected card)
- `ESC`: Back. If `FEATURE_FLAGS.SOURCE_CHOICE` is on, ESC from customize view returns to the choice view; otherwise ESC calls `onBack` (which calls `store.goBack`).
- All hotkeys are suppressed while the search modal is open (`isGridSearching` guard).

Sources step (source-grid in `source-grid.tsx`):

- Arrow keys / vim keys: move focus between skill rows and source option columns
- `SPACE`: select focused source for the focused skill, OR trigger search modal when focused on the search pill
- Search pill only rendered when `FEATURE_FLAGS.SOURCE_SEARCH` is on (onSearch prop is provided)

Settings step (`step-settings.tsx`):

- `A`: Add source (`HOTKEY_ADD_SOURCE`)
- `DEL`/`Backspace`: Remove focused source
- `ESC` or `S`: Close settings (ESC handled by step-settings' own `useKeyboardNavigation` hook; `S` handled by wizard.tsx)

### Hotkey helpers

- `isHotkey(input, hotkey)` - Case-insensitive character comparison.

Common key labels exported from `hotkeys.ts`:

- `KEY_LABEL_ENTER`, `KEY_LABEL_ESC`, `KEY_LABEL_SPACE`, `KEY_LABEL_TAB`, `KEY_LABEL_DEL`
- `KEY_LABEL_ARROWS` (horizontal), `KEY_LABEL_ARROWS_VERT` (vertical)
- `KEY_LABEL_VIM`, `KEY_LABEL_VIM_VERT`

**No other HOTKEY\_\* constants exist** in the registry. Previously-referenced `HOTKEY_COPY_LINK` was removed and never returned.

## Build Step Domain Order

From `src/cli/consts.ts`:

```typescript
BUILT_IN_DOMAIN_ORDER = ["web", "api", "ai", "mobile", "desktop", "cli", "infra", "meta", "shared"];
```

Custom domains appear before built-in domains, alphabetically.

Default scratch domains in `src/cli/consts.ts`: `["web", "api", "mobile"]`.

Domain descriptions defined in `domain-selection.tsx`:

| Domain    | Description                                            |
| --------- | ------------------------------------------------------ |
| `web`     | Frontend web applications                              |
| `api`     | Backend APIs and services                              |
| `ai`      | AI and LLM integrations                                |
| `cli`     | Command-line tools                                     |
| `mobile`  | Mobile applications                                    |
| `desktop` | Desktop applications                                   |
| `infra`   | CI/CD, deployment, and infrastructure                  |
| `meta`    | Design patterns, code review, and research methodology |
| `shared`  | Shared utilities and methodology                       |

## Framework-First Filtering

In the build step, skills have a `compatibleWith` field (resolved from `skill-rules.ts` compatibility groups) listing framework skill IDs they work with.

When a framework is selected (e.g., `web-framework-react`), only skills compatible with that framework (or with an empty `compatibleWith`) are shown. This filtering only applies to the `web` domain and only when `filterIncompatible` is true (toggled with `F` key).

Implemented in:

- `src/cli/components/hooks/use-framework-filtering.ts` (hook)
- `src/cli/lib/wizard/build-step-logic.ts` (`isCompatibleWithSelectedFrameworks()`, `buildCategoriesForDomain()`)

## Info Panel

`src/cli/components/wizard/info-panel.tsx`

Gated by `FEATURE_FLAGS.INFO_PANEL` (currently `true`).

Pressing `I` opens a panel in `wizard-layout.tsx` that replaces the step content. Shows:

- Header section with marketplace source names and selected stack name
- Scrollable skill/agent summary via `SkillAgentSummary` component (2-box layout with scope labels)
- Uses `useMeasuredHeight()` for scroll viewport calculation
- Closes with `I` or `Escape`

**Key difference from StepConfirm:** InfoPanel reads `skillConfigs`/`agentConfigs` directly from the wizard store. StepConfirm receives them as props.

## Global-Item Guards (D-196)

> **Detailed documentation:** See [concepts/guard-pattern.md](../concepts/guard-pattern.md) for the unified guard reference, [concepts/scope-system.md](../concepts/scope-system.md) for scope system, and [concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md) for tombstone lifecycle.

Since 0.122.0, toggling globally-installed agents from project scope is blocked via an `isInstalledGlobal` guard in the `toggleAgent` store action in `wizard-store.ts`. When triggered, a toast message is shown: "Global agents cannot be changed from project scope". The guard is bypassed when `isEditingFromGlobalScope` is true or when `isInitMode` is true.

The same pattern guards `toggleTechnology` in `wizard-store.ts`: globally-installed skills cannot be toggled from project scope. In exclusive (radio) categories, it also blocks selecting a new skill when the current selection is globally installed.

**Key state field:** `isInitMode` (boolean, default `false`) distinguishes init wizard (first-time setup, no restrictions) from edit wizard (existing installation, global items locked).

## Scope Toggle Eject Guard (D-199)

`toggleSkillScope` in `wizard-store.ts` blocks project-eject to global-eject promotion when a non-excluded global eject entry already exists in `installedSkillConfigs`. However, if the current `skillConfigs` already contains an excluded tombstone for that skill ID, the guard allows the toggle (undo path). This prevents accidental overwrites while allowing users to reverse a previous scope change.

## Dual-Scope Badges (D-183)

Both the build step (CategoryGrid) and agent step (StepAgents) now show dual-scope badges when a scope toggle creates a tombstone:

- **CategoryGrid** in `category-grid.tsx`: `CategoryOption.secondaryScope` renders a second `[G]`/`[P]` badge next to the primary scope badge.
- **StepAgents** in `step-agents.tsx`: Computes `secondaryScope` by checking for an excluded entry in `agentConfigs` with a different scope than the active entry. Renders `[G]`/`[P]` badge after the primary scope badge.

## Lock Icon for Globally Installed Skills (D-189)

In the build step, `SkillTag` in `category-grid.tsx` appends `UI_SYMBOLS.LOCK` after the display name when `option.installed && option.scope === "global"`. This visually marks skills that cannot be toggled from project scope.

## Source Mode Transition Labels (D-200)

`SkillAgentSummary` in `skill-agent-summary.tsx` shows a `~` prefix (instead of `+` or bullet) when a skill's source has changed from the installed version. The transition label is rendered as dim text: `(OldSource -> NewSource)` using `SOURCE_DISPLAY_NAMES` from `consts.ts` for human-readable names. Only shown when `prevSource != null && prevSource !== skill.source`.

## Stack Selection Grouping (D-194)

`StackSelection` in `stack-selection.tsx` now groups stacks by the `group` property on each stack definition (in `types/matrix.ts`: `Stack.group` and `ResolvedStack.group`).

- `GROUP_ORDER` constant in `stack-selection.tsx`: `["React", "CLI"]` -- determines display priority
- Groups sorted by `GROUP_ORDER` index (known groups first), then alphabetically
- Ungrouped stacks appear under "Other Frameworks" label
- When no stacks have `group`, falls back to flat list with no headers

## Stack Agent Preselection (D-195)

Stack selection now preselects agents from `Object.keys(stack.agents)` filtered through `isAgentName`, merged with global agent preselections.

In `populateFromStack` in `wizard-store.ts`: derives `stackAgents` from `Object.keys(stack.agents).filter(isAgentName).sort()`, builds `agentConfigs` with default `"global"` scope, and returns both `selectedAgents` and `agentConfigs`.

In `stack-selection.tsx` (customize path): the component merges stack agents with `globalAgentPreselections` (set by `hydrateWizardStore`) and applies the merged list via `useWizardStore.setState()`.

**New store fields supporting preselection:**

- `globalPreselections: SkillConfig[] | null` -- global skill configs to pre-select when a stack or scratch is chosen
- `globalAgentPreselections: { agents: AgentName[]; configs: AgentScopeConfig[] } | null` -- global agent preselections to restore after `selectStack` wipes `selectedAgents`/`agentConfigs`
