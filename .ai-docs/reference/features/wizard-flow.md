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
  - reference/wizard/state-transitions.md
  - reference/component-patterns.md
  - reference/commands/index.md
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.147.1)
     ✓ `I`-gate + INFO_PANEL row, hotkey helpers, hooks table, component tree; re-verified
       unchanged: WizardProps/WizardResultV2/HydrateOptions, scope-diff tables, Viewport Clipping
     ✗ step progression, guards, scope toggles, store actions, edit mode, settings overlay, domain
       order, framework filtering, stack grouping — prior 2026-07-31 / 07-30 bases
-->

# Wizard Flow

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

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

The canonical ordered sequence is the `WIZARD_STEP_ORDER` constant in `src/cli/stores/wizard-store.ts` (`["stack", "domains", "build", "sources", "agents", "confirm"] as const satisfies readonly WizardStep[]`). The settings screen is **not** a `WizardStep` — it renders as an overlay on the `showSettings` store flag (see Settings Overlay below), so it never appears in `WIZARD_STEP_ORDER` or the `history` stack.

**Shortcut:** If stack selected with `stackAction: "defaults"`, jumps directly to confirm (skips build/sources/agents). Both stack and scratch flows go through `domains` step.

## Component Architecture

```
Wizard (src/cli/components/wizard/wizard.tsx)
  |-> WizardLayout (wizard-layout.tsx)
  |     |-> [terminal-size guard] - REPLACES everything below when the terminal drops under MIN_TERMINAL_SIZE
  |     |-> WizardTabs (wizard-tabs.tsx) - Step progress indicators
  |     |-> SummaryPanel (summary-panel.tsx) - the "I" overlay: skill/agent scope summary (gated by isInfoPanelAvailable(step): FEATURE_FLAGS.INFO_PANEL and step !== "confirm")
  |     |     |-> SkillAgentSummary (skill-agent-summary.tsx)
  |     |     |-> ScrollAffordance (scroll-affordance.tsx) - "N more above / below" hint
  |     |-> WizardFooter (inline in wizard-layout.tsx) - SPACE/ENTER/ESC key hints
  |     |-> Toast (toast.tsx) - absolute-positioned guard/toast message
  |
  |-> Step Components (conditional render based on store.step):
  |     |-> StepStack (step-stack.tsx) - Stack selection
  |     |     |-> StackSelection (stack-selection.tsx) - Grouped stack list + "Start from scratch"
  |     |-> DomainSelection (domain-selection.tsx) - Domain toggles
  |     |     |-> CheckboxGrid (checkbox-grid.tsx) - Generic checkbox list
  |     |-> StepBuild (step-build.tsx) - Technology selection
  |     |     |-> CategoryGrid (category-grid.tsx) - Category sections; renders internal CategorySection + SkillTag
  |     |-> StepSources (step-sources.tsx) - Source selection
  |     |     |-> SelectionCard (selection-card.tsx) - Choice card (feature-flagged: SOURCE_CHOICE)
  |     |     |-> SourceGrid (source-grid.tsx) - Per-skill source picker
  |     |     |     |-> SearchModal (search-modal.tsx) - Bound skill search (feature-flagged: SOURCE_SEARCH)
  |     |     |     |-> ScrollAffordance (scroll-affordance.tsx) - overflow hint, sibling of the clipped viewport
  |     |-> StepAgents (step-agents.tsx) - Agent selection
  |     |-> StepConfirm (step-confirm.tsx) - Confirmation; owns Enter/Esc only
  |     |     |-> SummaryPanel (summary-panel.tsx) - THE SAME component the "I" overlay renders
  |     |     |     |-> SkillAgentSummary (skill-agent-summary.tsx) - 2-box skill/agent listing
  |     |     |     |-> ScrollAffordance (scroll-affordance.tsx) - overflow hint
  |
  |-> Overlays:
        |-> StepSettings (step-settings.tsx) - Source management (S hotkey on sources step; always functional, footer label gated by SOURCE_SEARCH)
```

Additional wizard components (not in the step render tree):

- `run-wizard-session.tsx` - `runWizardSession(options: WizardSessionOptions): Promise<WizardResultV2 | null>`: the single shared command-side entry point that hydrates the store, renders `<Wizard>`, awaits exit, clears the terminal (Ink `clear()` then the command-owned `clearTerminal`), and returns the result — `null` both when the render produced no result and when the result carries `cancelled: true` (used by `init.tsx` and `edit.tsx` only). It captures `onComplete` internally into a closure variable and forwards `options.onCancel`; callers supply everything else via `WizardSessionOptions = { hydrate: HydrateOptions; props: Omit<WizardProps, "onComplete" | "onCancel">; onCancel: () => void; clearTerminal: () => void }`. `list.tsx` does NOT use it — it renders a read-only `ListView` (via `SkillAgentSummary`) and calls `hydrateWizardStore()` directly to seed the diff baseline, without rendering the wizard.
- `toast.tsx` - Toast notification component (styled text block with padding), rendered by `wizard-layout.tsx`

## Feature Flags

Feature flags live in `FEATURE_FLAGS` (`src/cli/lib/feature-flags.ts`). The wizard-relevant flags:

| Flag                  | Default | Controls                                                                                                                                                                                                                                                |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_SEARCH`       | `false` | Search pill in source grid, settings overlay access                                                                                                                                                                                                     |
| `SOURCE_CHOICE`       | `false` | Intermediate "recommended vs customize" screen in sources step                                                                                                                                                                                          |
| `INFO_PANEL`          | `true`  | `I` opens the `SummaryPanel` overlay in `wizard-layout.tsx`, and guards the overlay's own render branch there. Necessary but not sufficient for the key: the step gate lives with it inside `isInfoPanelAvailable(step)`, which also excludes `confirm` |
| `FILTER_INCOMPATIBLE` | `false` | `F` key filters incompatible skills in the build step (D-269). Gates BOTH the keypress in `use-category-grid-input.ts` and the footer hint in `wizard-layout.tsx`; `toggleFilterIncompatible` stays intact and dormant for a one-flag re-enable.        |

The same object also holds three command-gating flags outside the wizard: `NEW_SKILL_COMMAND`, `NEW_AGENT_COMMAND`, `NEW_MARKETPLACE_COMMAND` (all `false`) — see `commands.md`.

## Wizard Props (from commands)

```typescript
// src/cli/components/wizard/wizard.tsx
export type WizardProps = {
  onComplete: (result: WizardResultV2) => void; // Called on confirm
  onCancel: () => void; // Called on cancel paths (each step handles its own ESC)
  version: string; // CLI version for display (required)
  logo?: string; // ASCII logo for header
  projectDir?: string;
  startupMessages?: StartupMessage[]; // Messages to display on startup
  initialAgents?: AgentName[]; // Used by StepSources onContinue to gate preselectAgentsFromDomains
  installedSkillIds?: SkillId[]; // Used by useBuildStepProps for install-state markers
};
```

**Important:** edit/init mode state (`initialStep`, `initialDomains`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`) is NOT passed as Wizard props. It is hydrated directly into the Zustand store via `hydrateWizardStore()`, which `runWizardSession()` (in `run-wizard-session.tsx`) calls BEFORE `render(<Wizard .../>)`. `init.tsx` and `edit.tsx` enter the wizard through `runWizardSession()`. (`list.tsx` also calls `hydrateWizardStore()` directly, but only to seed the diff baseline for its read-only summary — it never renders the wizard.) See the `HydrateOptions` type in `wizard-store.ts`.

**Why:** rendering the wizard first and then pushing state via props caused a one-frame flash of the default "stack" step before the jump to `initialStep` committed. Hydrating synchronously before render ensures React captures the correct initial snapshot.

**Removed in 0.122.0:** `lockedSkillIds` and `lockedAgentNames` props are gone. Global-item locking is now handled inside the store via `isActiveGlobal` guards on `toggleAgent`/`toggleTechnology` (checks `installedSkillConfigs`/`installedAgentConfigs`, gated on `!isEditingFromGlobalScope` alone since D-277).

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
export type WizardResultV2 = {
  skills: SkillConfig[]; // { id, scope, source } per skill (excluded tombstones appended)
  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[]; // { name, scope } per agent
  selectedStackId: string | null;
  domainSelections: DomainSelections;
  selectedDomains: Domain[];
  unresolvableSkillIds: SkillId[]; // Saved skill ids the loaded matrix could not resolve (D-233 Scenario C data-loss guard)
  cancelled: boolean;
  validation: SelectionValidation; // { valid; errors: ValidationError[]; warnings: ValidationWarning[] } from types/matrix.ts
};
```

## Wizard Hooks

| Hook                       | File                                                       | Purpose                                                                             |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `useBuildStepProps`        | `src/cli/components/hooks/use-build-step-props.ts`         | Compute build step derived data                                                     |
| `useCategoryGridInput`     | `src/cli/components/hooks/use-category-grid-input.ts`      | Keyboard navigation for grid                                                        |
| `useKeyboardNavigation`    | `src/cli/components/hooks/use-keyboard-navigation.ts`      | Arrow key + Enter handling                                                          |
| `useFocusedListItem`       | `src/cli/components/hooks/use-focused-list-item.ts`        | Focus tracking for lists                                                            |
| `useFrameworkFiltering`    | `src/cli/components/hooks/use-framework-filtering.ts`      | Framework-first skill filtering                                                     |
| `useMeasuredHeight`        | `src/cli/components/hooks/use-measured-height.ts`          | Component height measurement                                                        |
| `useModalState`            | `src/cli/components/hooks/use-modal-state.ts`              | Modal open/close state                                                              |
| `usePanelScroll`           | `src/cli/components/hooks/use-panel-scroll.ts`             | Line scroll for one clipped viewport driven by `↑`/`↓`; used by `summary-panel.tsx` |
| `useRowScroll`             | `src/cli/components/hooks/use-row-scroll.ts`               | Row-based scroll position                                                           |
| `useSectionScroll`         | `src/cli/components/hooks/use-section-scroll.ts`           | Section-based scroll position                                                       |
| `useSourceGridSearchModal` | `src/cli/components/hooks/use-source-grid-search-modal.ts` | Search modal for sources                                                            |
| `useSourceOperations`      | `src/cli/components/hooks/use-source-operations.ts`        | Source add/remove operations                                                        |
| `useTerminalDimensions`    | `src/cli/components/hooks/use-terminal-dimensions.ts`      | Terminal width/height tracking                                                      |
| `useTextInput`             | `src/cli/components/hooks/use-text-input.ts`               | Text input handling                                                                 |

## Build Step Logic

**Pure functions:** `src/cli/lib/wizard/build-step-logic.ts`

Contains non-UI logic extracted from the build step for testability:

- `validateBuildStep()` - Validate build step selections (required categories)
- `isCompatibleWithSelectedFrameworks()` - Check if a skill is compatible with selected framework skills
- `buildCategoriesForDomain()` - Build category row data for a domain
- `FRAMEWORK_CATEGORY_ID` - the `"web-framework"` category id the framework-first filter pivots on

**Grid order is deterministic (D-272).** `buildCategoriesForDomain()` orders the two axes independently: category ROWS by `cat.order ?? 0`, and each row's OPTIONS by `displayName` lowercased, both with remeda's `sortBy`. The option sort is the D-272 fix — order previously followed matrix and `readdir` insertion order, so the grid reshuffled between runs and between source types, and a positional walk over it meant nothing. Lowercasing keeps the comparison locale-independent. Rows whose options list is empty are dropped from the result.

Each option also carries its scope badges: the active and excluded `skillConfigs` entries for the skill are looked up and passed to `deriveScopeBadges()`, which yields the `secondaryScope` that renders the `[P][G]` pair.

## Scope Diff Module

**Pure functions:** `src/cli/lib/wizard/scope-diff.ts` (functions re-exported from the `src/cli/lib/wizard/index.ts` barrel; consumers import from `../../lib/wizard/index.js`)

Computes the per-scope diff rows and scope badges that the confirm-step summary and the agent step render. Tombstones are first-class baseline entries: a tombstone occupies its `(id, scope)` slot so a dual-scope `G→P` toggle does not render a spurious `-` at Global (D-230) or a spurious `+` on the next edit when the stored tombstone is re-read (D-232). Source-change (`~`) tracking filters to active baseline entries because tombstones do not represent a live install source.

**Exported functions:**

| Function            | Signature                                                                                                               | Purpose                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computeScopeDiff`  | `(input: ScopeDiffInput) => ScopeDiff`                                                                                  | Builds project/global skill + agent diff rows for the confirm-step summary                                                                                                                                                  |
| `deriveScopeBadges` | `(activeConfig: { scope: SkillScope } \| undefined, excludedConfig: { scope: SkillScope } \| undefined) => ScopeBadges` | Derives primary + secondary scope badge from an active entry and its excluded tombstone (D-223)                                                                                                                             |
| `formatScopeTag`    | `(scope: SkillScope) => "[G]" \| "[P]"`                                                                                 | Bracketed scope label: `[G]` for global, `[P]` for project                                                                                                                                                                  |
| `skillSlotKey`      | `(id: SkillId, scope: SkillScope \| undefined) => string`                                                               | The `(id, scope)` SLOT key this module diffs on (D-278). Exported so every surface that computes its own session diff keys on the same slot instead of on the id alone                                                      |
| `agentSlotKey`      | `(name: AgentName, scope: SkillScope \| undefined) => string`                                                           | The agent-side counterpart: the `(name, scope)` SLOT key. Exported pre-emptively so a second agent-diff surface routes through it from the start rather than re-deriving the key, which is how the skill side reached D-278 |

**Exported types:**

| Type             | Shape                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScopeDiffInput` | `{ currentSkills: SkillConfig[]; currentAgents: AgentScopeConfig[]; installedSkillConfigs: SkillConfig[] \| null; installedAgentConfigs: AgentScopeConfig[] \| null; isInitMode: boolean }` |
| `DiffRowStatus`  | `"added" \| "source-changed" \| "removed" \| "unchanged"`                                                                                                                                   |
| `SkillDiffRow`   | `{ id: SkillId; source: string; status: DiffRowStatus }` — **no `prevSource`**: D-261 removed it when the verbose transition label was replaced by the compact `~` marker                   |
| `AgentDiffRow`   | `{ name: AgentName; status: Exclude<DiffRowStatus, "source-changed"> }`                                                                                                                     |
| `ScopeDiff`      | `{ projectSkillRows: SkillDiffRow[]; globalSkillRows: SkillDiffRow[]; projectAgentRows: AgentDiffRow[]; globalAgentRows: AgentDiffRow[]; hasContent: boolean }`                             |
| `ScopeBadges`    | `{ scope: SkillScope \| undefined; secondaryScope: SkillScope \| undefined }`                                                                                                               |

**Internal helpers** (module scope, NOT exported): `classifyDiffRow(skill, prevKeySet, prevSourceMap)` classifies an active skill entry against the baseline (`added` / `source-changed` / `unchanged`) — it compares against the previous source but does not carry it onto the row; `classifyAgentDiffRow(agent, prevKeySet)` classifies an active agent (`added` / `unchanged`); `toRemovedSkillRow` / `toRemovedAgentRow` build `removed` rows from baseline entries absent in current state. `computeScopeDiff` suppresses removed-global rows when `isInitMode` is true. Both sides key through a shared helper: skills through `skillSlotKey`, agents through `agentSlotKey`. The agent helper has no second consumer yet — it exists so that one cannot arrive and build its own key, which is the precondition that produced D-278 on the skill side.

### Known Limitations (`computeScopeDiff`, both OPEN)

Two shapes render incorrectly on the confirm step. Neither is mirrored by the Sources tab, which is the authoritative surface for both. Full derivation in `.ai-docs/agent-findings/2026-07-29-per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row.md`; also listed in the 0.146.0 changelog backlog.

| Shape                                                                      | Rendered                                                      | Should be                  | Cause                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot `[G active]` + live `[P active]`, no tombstone (inherited global) | Two Global rows for one skill — `unchanged` **and** `removed` | One `unchanged` Global row | `inheritedGlobalSkills` re-surfaces the entry while the slot-occupancy `removedSkills` filter independently classifies it as gone |
| Snapshot `[G tombstone]` + live `[]`                                       | A Global `removed` row                                        | Nothing                    | A tombstone is a mask over a global install, not an install; dropping it deletes nothing                                          |

Reachability: the first is far less reachable since D-279 masks such configs at write time; the second cannot occur within a session, because every store path that drops a tombstone fills the same slot with an active entry. The Sources-tab equivalents avoid both via `isSlotAlreadyRendered` and by excluding snapshot tombstones as removal candidates.

**Consumers:**

| Export              | Consumer                                 | Use                                                                                                                                                                                     |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computeScopeDiff`  | `skill-agent-summary.tsx`                | Per-scope skill + agent rows inside `SummaryPanel` — so the confirm step and the `I` overlay alike                                                                                      |
| `deriveScopeBadges` | `build-step-logic.ts`, `step-agents.tsx` | SkillTag secondary badge; agent dual-scope badge                                                                                                                                        |
| `formatScopeTag`    | `step-agents.tsx`, `commands/edit.tsx`   | Agent `[G]`/`[P]` labels; edit completion-summary labels                                                                                                                                |
| `skillSlotKey`      | `stores/wizard-store.ts`                 | The Sources tab's own session diff (`collectInstalledSkillSlots`, `addedSlotFlag`, `collectRemovedInstalledEntries`, `isSlotAlreadyRendered`) keys on the same slot as the confirm step |
| `agentSlotKey`      | `scope-diff.ts` only (no second surface) | `computeScopeDiff`'s agent baseline set and `classifyAgentDiffRow`. Exported ahead of a second consumer, not because one exists                                                         |

## Edit Mode Flow

When `edit` command enters the wizard (see `runEditWizard` in `edit.tsx`):

1. `runEditWizard` in `edit.tsx` calls `runWizardSession({ hydrate: { initialStep: "build", ... }, ... })`, which runs `hydrateWizardStore()` BEFORE `render(<Wizard/>)`. This jumps the store straight to the build step with empty history.
2. `installedSkillIds` and `installedSkillConfigs` are passed to `populateFromSkillIds(skillIds, savedConfigs)` inside hydrate to hydrate skill selections.
3. `initialDomains` and `initialAgents` (from saved config) override defaults.
4. `installedAgentConfigs` becomes `agentConfigs` (scope preserved) and is snapshotted into `installedAgentConfigs` for diff rendering.
5. Global-item locking handled inside store: `toggleAgent`/`toggleTechnology` check `installedSkillConfigs`/`installedAgentConfigs` and show toast if blocked — in every flow, init included (D-277).
6. `isEditingFromGlobalScope` disables scope toggle (S key) when editing from the global install root.
7. User modifies selections; `goBack` navigates through `history` (empty at start in edit mode, so ESC on build exits via `onCancel`).
8. On confirm: `detectConfigChanges()` in `edit.tsx` produces `ConfigChanges` (`addedSkills`/`removedSkills`, `addedAgents`/`removedAgents`, `sourceChanges`, `scopeChanges`, `agentScopeChanges`, plus `dualScopeSkillTransitions`/`dualScopeAgentTransitions` sets that steer only the completion summary) and applies migrations, plugin install/uninstall, local-skill copy, config write, and agent recompile in order.

**Edit mode step order:** `build -> sources -> agents -> confirm` (stack and domains are skipped).

## Keyboard Navigation

Hotkeys are centralized in `src/cli/components/wizard/hotkeys.ts`.

### Global hotkeys (handled in `wizard.tsx`)

- `I`: Toggle info panel (`HOTKEY_INFO`). Gated by `isInfoPanelAvailable(step)` from `hotkeys.ts` — `FEATURE_FLAGS.INFO_PANEL && step !== "confirm"`, NOT the flag alone. The **close** path is deliberately ungated: `wizard.tsx` handles `store.showInfo` in an earlier branch, so `I` or `Escape` always closes an open panel. See "Info Panel — the `I` overlay" below.
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
- `F`: Toggle incompatible skill filtering (`HOTKEY_FILTER_INCOMPATIBLE`). **Currently a no-op** — gated behind `FEATURE_FLAGS.FILTER_INCOMPATIBLE` (default `false`, D-269) in both `use-category-grid-input.ts` (the keypress) and `wizard-layout.tsx` (the footer hint), because of a dual-scope collapse bug. When re-enabled: turning the filter on removes incompatible web skills; if any of those removals would uninstall a globally-installed skill during a project-scope edit, `toggleFilterIncompatible` in `wizard-store.ts` refuses the entire toggle (filter included) with the `GLOBAL_SKILLS_LOCKED` toast — the same lock `toggleTechnology` applies to spacebar (D-242, added 0.143.0; bypassed only when `isEditingFromGlobalScope` is true — D-277 removed the init-mode bypass).
- Arrow keys **and vim keys** (`h`/`j`/`k`/`l`) move focus; `Tab` jumps to the next category section (wrapping) and `Shift+Tab` toggles labels. All registered through one stable `useInput` handler held in a ref, so a domain remount cannot drop the first keypress into a stale closure.

Sources step (customize view, handled in `step-sources.tsx`):

- `L`: Set all sources to local/eject (`HOTKEY_SET_ALL_LOCAL`)
- `P`: Set all sources to plugin/marketplace (`HOTKEY_SET_ALL_PLUGIN`)
- `ENTER`: Continue to agents step (or in choice view, proceed with selected card)
- `ESC`: Back. If `FEATURE_FLAGS.SOURCE_CHOICE` is on, ESC from customize view returns to the choice view; otherwise ESC calls `onBack` (which calls `store.goBack`).
- All hotkeys are suppressed while the search modal is open (`isGridSearching` guard).

Sources step (source-grid in `source-grid.tsx`):

- Arrow keys only — **no vim keys here** (unlike the build step). `←`/`→` move between source option columns, `↑`/`↓` between skill rows, with wrapping.
- `SPACE`: select the focused source for the focused skill, OR trigger the search modal when focused on the search pill. It returns immediately on an inert row (`isRowInert` = `readOnly || disabled`), so a locked or pending-removal row can never be acted on.
- **Overscroll to reach trailing inert rows (D-271).** Focus skips inert rows, so a trailing locked or pending-removal row is unreachable by focus alone. When focus already sits on the last focusable row (`lastFocusableRowIndex`) — or when no row is focusable at all — `↓` calls `useSectionScroll`'s `scrollBy(1)` to travel the viewport past focus instead of wrapping; `↑` does the same with `scrollBy(-1)` in the no-focusable-row case. Both are gated on `scrollEnabled` and a non-zero `hiddenBelow`/`hiddenAbove`.
- Search pill only rendered when `FEATURE_FLAGS.SOURCE_SEARCH` is on (onSearch prop is provided). While the search modal is open the grid's `useInput` is deactivated entirely (`isActive: !searchModal.isOpen`).
- Rows are grouped into `Global` / `Project` sections only when both scopes are present (`groupRowsByScope`); otherwise the grid renders flat with no scope column.

Settings step (`step-settings.tsx`):

- `A`: Add source (`HOTKEY_ADD_SOURCE`)
- `DEL`/`Backspace`: Remove focused source
- `ESC` or `S`: Close settings (ESC handled by step-settings' own `useKeyboardNavigation` hook; `S` handled by wizard.tsx)

### Hotkey helpers

`hotkeys.ts` exports exactly two:

- `isHotkey(input, hotkey)` - Case-insensitive character comparison.
- `isInfoPanelAvailable(step)` - `FEATURE_FLAGS.INFO_PANEL && step !== "confirm"`. Read by BOTH the `I` branch in `wizard.tsx` and the `Info` footer hint's `isVisible` in `wizard-layout.tsx`, so the wizard cannot advertise a key it ignores. The two call sites must never diverge.

Common key labels exported from `hotkeys.ts`:

- `KEY_LABEL_ENTER`, `KEY_LABEL_ESC`, `KEY_LABEL_SPACE`, `KEY_LABEL_DEL`, `KEY_LABEL_ARROWS_VERT` (vertical arrows `↑/↓`)
- `KEY_SPACE` (the literal space input character, `" "`) — a matching constant, not a display label

**No other `KEY_LABEL_*` constants exist.** Previously-documented `KEY_LABEL_TAB`, `KEY_LABEL_ARROWS` (horizontal), `KEY_LABEL_VIM`, and `KEY_LABEL_VIM_VERT` have been removed.

**No other `HOTKEY_*` constants exist** in the registry. Previously-referenced `HOTKEY_COPY_LINK` was removed and never returned.

## Build Step Domain Order

From `src/cli/consts.ts`:

```typescript
BUILT_IN_DOMAIN_ORDER = ["web", "api", "ai", "mobile", "desktop", "cli", "infra", "meta", "shared"];
```

Custom domains appear before built-in domains, alphabetically (see `orderDomains()` in `src/cli/lib/wizard/domain-order.ts`).

Default scratch domains: `DEFAULT_SCRATCH_DOMAINS = ["web", "api", "mobile"]` in `src/cli/consts.ts`.

Domain descriptions defined as `BUILT_IN_DOMAIN_DESCRIPTIONS` in `src/cli/components/wizard/utils.ts` (consumed by `domain-selection.tsx`):

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

## Info Panel — the `I` overlay

`src/cli/components/wizard/summary-panel.tsx` (there is no `info-panel.tsx`; it was deleted once it reduced to `() => <SummaryPanel />`).

Gated by `FEATURE_FLAGS.INFO_PANEL` (currently `true`).

Pressing `I` opens a panel in `wizard-layout.tsx` that replaces the step content. Shows:

- Header section with marketplace source names and selected stack name
- Scrollable skill/agent summary via `SkillAgentSummary` (2-box layout with scope labels)
- Scroll owned by `usePanelScroll` (viewport ref, content ref, offset, `↑`/`↓`), with a `ScrollAffordance` sibling
- Closes with `I` or `Escape`

**There is no longer any difference from StepConfirm — it is the same component.** Both halves of the old claim are false: `SummaryPanel` reads `skillConfigs` / `agentConfigs` from the store on both surfaces, and `StepConfirm` no longer receives them as props (`wizard.tsx` had been passing exactly what the panel now selects for itself). `StepConfirm` adds only a `useInput` of its own for `Enter` (complete) and `Esc` (back), on keys disjoint from the panel's `↑`/`↓`.

**`I` is not offered on the confirm step.** `isInfoPanelAvailable(step)` in `hotkeys.ts` gates both the toggle in `wizard.tsx` and the `Info` footer hint in `wizard-layout.tsx` — once the confirm step IS the panel, the hotkey has nothing left to reveal. The CLOSE path is deliberately ungated: gating it would strand an overlay opened on a step that later became disallowed.

## Settings Overlay

`src/cli/components/wizard/step-settings.tsx`

**Not a `WizardStep`.** `StepSettings` is an overlay, not a member of `WIZARD_STEP_ORDER`. `wizard.tsx` renders it in place of the step content when the `showSettings` store flag is true (toggled by the `toggleSettings` action, bound to the `S` hotkey on the sources step). It is a sibling of the `I` summary overlay, not part of the step render tree or the `history` stack.

**Props:**

```typescript
// src/cli/components/wizard/step-settings.tsx
export type StepSettingsProps = {
  projectDir: string;
  onClose: () => void; // wizard.tsx passes () => store.toggleSettings()
};
```

**Behavior:**

- Loads a `SourceSummary` via `getSourceSummary(projectDir)` from `src/cli/lib/configuration/source-manager.ts`; on failure falls back to a single default `PUBLIC_SOURCE_NAME` source. Renders configured marketplaces, local skill count (`.claude/skills/`), and plugin skill count.
- Adds/removes sources through `useSourceOperations(projectDir, loadSummary)`; a successful `handleRemove` reloads the summary and moves focus up one row.
- Add-source uses an in-place text-input modal (`useModalState` + `useTextInput`), NOT `SearchModal`.
- The default public source (`PUBLIC_SOURCE_NAME`) cannot be removed — DEL/Backspace on it is a no-op.
- Hotkeys (`A` add, `DEL`/`Backspace` remove, `ESC`/`S` close): see the Settings step subsection under Keyboard Navigation.

## Global-Item Guards (D-196)

> **Detailed documentation:** See [concepts/guard-pattern.md](../concepts/guard-pattern.md) for the unified guard reference, [concepts/scope-system.md](../concepts/scope-system.md) for scope system, and [concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md) for tombstone lifecycle.

Toggling a globally-installed agent from project scope is blocked in the `toggleAgent` store action in `wizard-store.ts` by an `isActiveGlobal` check — true when `installedAgentConfigs` holds an active global entry for the agent, or holds a global tombstone paired with a live active global entry in `agentConfigs` (the stale state a persisted `[P][G]` reaches after an in-session collapse). When triggered, the toast `TOAST_MESSAGES.GLOBAL_AGENTS_LOCKED` ("Global agents cannot be changed from project scope") is shown. The guard is bypassed only when `isEditingFromGlobalScope` is true — D-277 removed the init-mode bypass, so a globally-installed agent is immutable from project scope in every flow.

The same `isActiveGlobal` pattern guards `toggleTechnology` in `wizard-store.ts` (toast `GLOBAL_SKILLS_LOCKED`): globally-installed skills cannot be toggled from project scope. In exclusive (radio) categories, it also blocks selecting a new skill when the current selection is globally installed.

**Key state field:** `isInitMode` (boolean, default `false`) distinguishes init wizard from edit wizard. Since D-277 it gates **no** scope guard — global items are locked in both flows; its remaining readers are `computeScopeDiff` (suppresses removed-global diff rows) and `SkillAgentSummary`.

## Scope Toggle Eject Guard (D-199)

`toggleSkillScope` in `wizard-store.ts` blocks project-eject to global-eject promotion when a non-excluded global eject entry already exists in `installedSkillConfigs`. However, if the current `skillConfigs` already contains an excluded tombstone for that skill ID, the guard allows the toggle (undo path). This prevents accidental overwrites while allowing users to reverse a previous scope change.

## Dual-Scope Badges (D-183)

Both the build step (CategoryGrid) and agent step (StepAgents) now show dual-scope badges when a scope toggle creates a tombstone:

- **SkillTag** (internal to `category-grid.tsx`): when `CategoryOption.secondaryScope` is set, renders a second background badge (`G`/`P`, warning color on `LABEL_BG`) immediately after the primary scope badge.
- **StepAgents** in `step-agents.tsx`: derives the primary + secondary scope from the active and excluded `agentConfigs` entries via `deriveScopeBadges()`, then renders `[G]`/`[P]` bracket labels via `formatScopeTag()` (both from `src/cli/lib/wizard/scope-diff.ts`). The secondary badge only shows when the excluded tombstone has a different scope than the active entry.

## Lock Icon for Globally Installed Skills (D-189)

`UI_SYMBOLS.LOCK` is rendered by `SourceGrid` in `source-grid.tsx` on read-only rows (`row.readOnly`) — the sources step surfaces globally-installed skills as locked global rows. The build-step `SkillTag` (in `category-grid.tsx`) no longer renders a lock icon; in the build step, globally-installed skills are signalled by the scope badge plus the toggle guard toast ("Global skills cannot be changed from project scope"). See `classifySkillSourceRows()` and `toLockedGlobalRow()` in `wizard-store.ts` for how read-only rows are produced.

## Sources Tab Session Diff (D-257 / D-258 / D-278)

The sources step is not only a source picker — it is a second view of "what this session changes", and it must agree with the confirm step. Three behaviours make that up:

- **A deselected saved skill stays visible as an inert removal row (D-257).** `collectRemovedInstalledEntries` finds every ACTIVE hydration-snapshot slot no live `skillConfigs` entry occupies; each becomes a `disabled` row via `toPendingRemovalRow`, pinned to its PERSISTED scope and source and carrying the red `-` marker. Without it the row would simply vanish and the user would lose sight of what saving removes — the case that matters most. The row is deliberately not `readOnly`, because a lock reads as "installed globally", not "about to be removed".
- **A skill added this session carries a green `+` (D-258).** `collectInstalledSkillSlots` + `addedSlotFlag` decide the flag per `(id, scope)` slot, and every row shape in `classifySkillSourceRows` is fed it. An added row stays fully selectable and editable — unlike `disabled`/`readOnly`, `added` is not an inertness flag.
- **Both are keyed on the slot, exactly as the confirm step is (D-278).** Both surfaces call `skillSlotKey` from `scope-diff.ts`. The consequences: a removal shows at global scope too (the old `isEditingFromGlobalScope` gate on the removal collector is gone; the confirm step never had one); adopting a globally-installed skill at project scope shows `+` on the new project row while the global row stays a plain lock; and a collapsed dual-scope pair renders **two** rows — the surviving locked global row plus a red inert pending-removal row for the emptied project slot — which is exactly what the confirm step already reported (`-` at Project, `•` at Global). `isSlotAlreadyRendered` prevents a removal row being stacked on a slot an emitted row already renders, so an inherited global install never reads as both locked and removed.

**Source selection is scope-threaded (D-262).** `handleGridSelect` in `step-sources.tsx` looks up the skill's single non-inert row and passes its `scope` to `store.setSourceSelection(skillId, sourceId, scope)`, which rewrites only the active entry at that slot. A dual-scope skill renders only its project row as editable, so the masked global tombstone keeps its own source.

Full mechanics: `store-map.md`, "Sources-tab session diff" and "Source-row builders". Rendering contract: `component-patterns.md`, "SourceGrid Row States".

## Viewport Clipping and Overflow Affordance (D-263 / D-271)

Long content used to bleed outside its border at short terminal heights. Two rules now hold across the wizard:

- **Clipping is unconditional; only the AFFORDANCE is size-gated.** A viewport that stops clipping when it looks too small grows to content height, which makes it look big enough to keep not clipping — a stable wrong answer that paints content over the border. `source-grid.tsx` passes `minViewportRows: SOURCE_GRID_MIN_VIEWPORT_ROWS = 1` to `useSectionScroll` so the Sources step clips-and-signals rather than falling back to a bleeding flex layout; other views keep the default `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS = 5`.
- **The overflow hint is a shared, text-only component.** `<ScrollAffordance hiddenAbove hiddenBelow />` renders one pinned line — `N more above` / `N more below` — and must be a SIBLING of the clipped viewport, never a child of it. Consumers: exactly `source-grid.tsx` and `summary-panel.tsx`.
- **The grid steps have no affordance, deliberately.** Skills (build), Domains, Agents and Stack clip silently: a half-cut card on a grid that dense already says "there is more", and a counted hint would cost the viewport a row to repeat it. `category-grid.tsx` discards the counts `useSectionScroll` hands it; the `useRowScroll` views never compute them. This narrows **D-266** — the accepted half — but does not close it: the bleed below `MIN_VIEWPORT_ROWS`, where `scrollEnabled` goes false and the view grows past its border, is still open. See `component-patterns.md`, "No affordance on the grid steps".

**A terminal that shrinks mid-session is caught too.** `BaseCommand.ensureTerminalSize()` runs once, before Ink mounts, so it blocks LAUNCHING below `MIN_TERMINAL_SIZE` (80x20) but cannot see a window resized afterwards — the build grid used to paint straight through the footer. `WizardLayout` now re-checks the dimensions `useTerminalDimensions` already tracks and REPLACES the wizard tree with the same resize prompt (an overlay does not work: Ink lays a still-mounted tree out at the small size regardless of what covers it). Both gates read `isTerminalLargeEnough` / `formatTerminalTooSmallMessage` from `src/cli/utils/terminal.ts` so their wording cannot drift. Store state survives the swap; component-local state (grid focus, scroll offsets) and the step's own `useInput` do not.

**Decoration yields before content does.** The stack step is the only step that paints the ASCII banner, and its six rows were enough to starve that step's own list viewport below `MIN_VIEWPORT_ROWS` — where `useRowScroll` stops clipping — so the stack rows painted over the scratch row at 20 and through the footer at 24. `WizardLayout` now renders the banner only at or above `LOGO_MIN_TERMINAL_ROWS` (26, measured against the binary; the table is in its JSDoc). That constant is deliberately NOT part of `MIN_TERMINAL_SIZE`: the size gate decides whether a command runs at all, this decides whether one decorative element renders inside a terminal that already cleared it, and folding 26 into the gate would refuse to run in a 24-row terminal. It fixes the stack-step instance only — the bail-instead-of-clip behaviour itself is untouched and D-266 stays open.

The Sources column header is pinned OUTSIDE the clipping viewport so it cannot scroll away, but it costs a row just as the affordance does; below `SOURCE_GRID_HEADER_MIN_HEIGHT = 4` the column labels yield to content (`showPinnedHeader`). See `component-patterns.md`, "Scrolling", for the measurement and overscroll model.

## Source Change Marker (D-200, compacted by D-261)

`SkillAgentSummary` in `skill-agent-summary.tsx` shows a `~` prefix (instead of `+` or bullet) when a skill's source has changed from the installed version. The `"source-changed"` status is computed by `computeScopeDiff()`/`classifyDiffRow()` in `src/cli/lib/wizard/scope-diff.ts` (condition: `!isNew && prevSource != null && prevSource !== skill.source`, where `prevSource` comes from the active-baseline `prevSourceMap`).

**The transition label is gone (D-261).** `SkillRow` used to append a dim `(OldSource → NewSource)` — e.g. `agents-inc → eject` — which wrapped out of its row at realistic widths. It now renders only `DIFF_PREFIX[status]` + `getSkillDisplayName(row.id)`, plus an `EjectIcon` when `row.source === EJECT_SOURCE`. The compact `~` marker the row already carried is the whole signal, and `SkillDiffRow` no longer carries a `prevSource` field. Consequently `skill-agent-summary.tsx` no longer imports `formatSourceDisplayName`; `summary-panel.tsx` still does, for its marketplace header.

## Stack Selection Grouping (D-194)

`StackSelection` in `stack-selection.tsx` now groups stacks by the `group` property on each resolved stack (`ResolvedStack.group?: string` in `types/matrix.ts`; the base `Stack` type has no `group` field).

- `GROUP_ORDER` constant in `stack-selection.tsx`: `["React", "CLI"]` -- determines display priority
- Groups sorted by `GROUP_ORDER` index (known groups first), then alphabetically
- Ungrouped stacks appear under "Other Frameworks" label
- When no stacks have `group`, falls back to flat list with no headers

## Stack Agent Preselection (D-195)

Stack selection now preselects agents from the stack's agent keys, merged with global agent preselections.

In `stack-selection.tsx` (customize path): on stack select, the component derives `stackAgents` via `typedKeys<AgentName>(focusedStack.skills)` and calls `preselectAgentsFromStack(stackAgents)`.

In `preselectAgentsFromStack` in `wizard-store.ts`: merges `stackAgents` with `globalAgentPreselections.agents`, sorts the deduped list, builds `agentConfigs` via `buildAgentConfigForName` (default `"global"` scope), preserves excluded tombstones via `collectTombstones`, and returns both `selectedAgents` and `agentConfigs`.

In `stack-selection.tsx` (scratch path): after `selectStack(null)` wipes agents, the component restores `globalAgentPreselections` (set by `hydrateWizardStore`) directly via `useWizardStore.setState()`.

**New store fields supporting preselection:**

- `globalPreselections: SkillConfig[] | null` -- global skill configs to pre-select when a stack or scratch is chosen
- `globalAgentPreselections: { agents: AgentName[]; configs: AgentScopeConfig[] } | null` -- global agent preselections to restore after `selectStack` wipes `selectedAgents`/`agentConfigs`
