---
scope: reference
area: wizard
keywords:
  [
    ink,
    components,
    hooks,
    category-grid,
    skill-tag,
    scope-badge,
    dual-scope,
    lock-icon,
    stack-selection,
    hotkeys,
  ]
related:
  - reference/store-map.md
  - reference/wizard/state-transitions.md
  - reference/features/wizard-flow.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/guard-pattern.md
  - reference/commands.md
last_validated: 2026-07-23
---

# Component Patterns

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

## Rendering Library

**Library:** Ink v5 (React-based terminal rendering)
**Theme:** `@inkjs/ui` ThemeProvider with custom theme
**Styling:** Inline Ink props (`color`, `bold`, `dimColor`) + `CLI_COLORS` constants

## Component Structure

### Directory Layout

```
src/cli/components/
  common/                    # Shared UI components
    confirm.tsx              # Y/N confirmation prompt (Confirm)
    confirm.test.tsx
    prompt-confirm.tsx       # Imperative confirm/value prompt helper (used by the dashboard)
    select-list.tsx          # Generic keyboard-navigable list (SelectList)
    spinner.tsx              # Loading spinner
  hooks/                     # React hooks (13 hooks, 2 test files)
    use-build-step-props.ts
    use-category-grid-input.ts
    use-focused-list-item.ts
    use-framework-filtering.ts
    use-keyboard-navigation.ts
    use-measured-height.ts
    use-modal-state.ts
    use-row-scroll.ts
    use-section-scroll.ts
    use-source-grid-search-modal.ts
    use-source-operations.ts
    use-terminal-dimensions.ts
    use-text-input.ts
  themes/
    default.ts               # CLI theme configuration
  wizard/                    # Wizard step components (22 source files, 13 test files)
    wizard.tsx               # Main wizard orchestrator
    wizard-layout.tsx        # Layout wrapper (tabs + content + info panel + footer)
    wizard-tabs.tsx          # Step progress indicator tabs
    run-wizard-session.tsx   # runWizardSession(): hydrate store, render <Wizard>, await exit
    step-stack.tsx           # Stack selection step
    step-build.tsx           # Technology selection step
    step-sources.tsx         # Source selection step
    step-agents.tsx          # Agent selection step
    step-confirm.tsx         # Confirmation step (scrollable, delegates to SkillAgentSummary)
    step-settings.tsx        # Settings overlay
    category-grid.tsx        # Category grid layout (internal CategorySection + SkillTag)
    checkbox-grid.tsx        # Generic checkbox grid (used by DomainSelection)
    domain-selection.tsx     # Domain tab selector
    selection-card.tsx       # Selected item card (used by StepSources choice view)
    skill-agent-summary.tsx  # 2-box skill/agent listing with scope labels (used by StepConfirm and InfoPanel)
    source-grid.tsx          # Per-skill source picker (inline layout with column headers)
    search-modal.tsx         # Bound skill search modal (rendered by SourceGrid)
    stack-selection.tsx      # Grouped stack list component
    info-panel.tsx           # Marketplace/stack header + scrollable SkillAgentSummary
    toast.tsx                # Toast notification component (styled text block)
    hotkeys.ts               # Centralized hotkey registry
    utils.ts                 # Wizard utility functions
```

## Component Definition Pattern

**Standard pattern (named export, functional component, Ink elements):**

```typescript
import React from "react";
import { Box, Text } from "ink";
import { CLI_COLORS } from "../../consts.js";
import { useWizardStore } from "../../stores/wizard-store.js";

type StepBuildProps = {
  matrix: MergedSkillsMatrix;
  // ...
};

export const StepBuild: React.FC<StepBuildProps> = ({ matrix }) => {
  const store = useWizardStore();

  return (
    <Box flexDirection="column">
      <Text color={CLI_COLORS.PRIMARY}>Build Step</Text>
    </Box>
  );
};
```

**Key patterns:**

- Named exports only (no default exports)
- `React.FC<Props>` type annotation
- Ink primitives: `<Box>`, `<Text>`, `useInput()`, `useApp()`, `useStdout()`
- Colors from `CLI_COLORS` constant in `src/cli/consts.ts`
- Store access via `useWizardStore()` selectors
- No SCSS/CSS - all styling via Ink props

## Color Constants (CLI_COLORS in `src/cli/consts.ts`)

| Constant    | Value     | Usage                             |
| ----------- | --------- | --------------------------------- |
| `PRIMARY`   | "#99FFFF" | Headers, focus                    |
| `SUCCESS`   | "#90EE90" | Checkmarks, success               |
| `ERROR`     | "#DC343B" | Errors                            |
| `WARNING`   | "#E6A817" | Warnings                          |
| `INFO`      | "#3B82F6" | Info text                         |
| `NEUTRAL`   | "#888888" | Dimmed text                       |
| `FOCUS`     | "#87CEFA" | Focused elements                  |
| `UNFOCUSED` | "#FFFFFF" | Unfocused elements                |
| `WHITE`     | "#FFFFFF" | Default text                      |
| `BLACK`     | "#000000" | Dark backgrounds                  |
| `DIM`       | "#666666" | Dimmed/muted text                 |
| `GRAY_1`    | "#ddd"    | Light gray                        |
| `LABEL_BG`  | "#383838" | Background for scope/focus labels |
| `TOAST_BG`  | "#EEEEEE" | Toast background                  |
| `TOAST_FG`  | "#000000" | Toast foreground                  |
| `HOVER_BG`  | "#333333" | Hover background                  |

## UI Symbols (UI_SYMBOLS in `src/cli/consts.ts`)

| Symbol               | Value           | Usage                                    |
| -------------------- | --------------- | ---------------------------------------- |
| `CHECKBOX_CHECKED`   | `[x]`           | Selected checkbox                        |
| `CHECKBOX_UNCHECKED` | `[ ]`           | Unselected checkbox                      |
| `CHEVRON`            | unicode chevron | Navigation indicator                     |
| `CHEVRON_SPACER`     | space           | Non-focused spacer                       |
| `SELECTED`           | checkmark       | Selected item                            |
| `UNSELECTED`         | circle          | Unselected item                          |
| `CURRENT`            | filled circle   | Current focus                            |
| `SKIPPED`            | dash            | Skipped step                             |
| `DISABLED`           | dash            | Disabled item                            |
| `DISCOURAGED`        | `!`             | Warning indicator                        |
| `LOCK`               | lock emoji      | Locked/read-only items                   |
| `EJECT`              | eject symbol    | Local/ejected skill indicator            |
| `BULLET`             | bullet dot      | List item marker in confirm/summary      |
| `SCROLL_UP`          | triangle up     | Scroll indicator                         |
| `SCROLL_DOWN`        | triangle down   | Scroll indicator                         |
| `CHECK`              | checkmark       | Success glyph (same glyph as `SELECTED`) |
| `CROSS`              | ✗               | Failure/cross glyph                      |

## SelectList Component (`src/cli/components/common/select-list.tsx`)

Generic keyboard-navigable list component. Consumed by `src/cli/commands/init.tsx` (project dashboard) and `src/cli/components/wizard/search-modal.tsx` (bound skill search).

```typescript
type SelectListItem<T> = { value: T; label: string };

type SelectListProps<T> = {
  items: readonly SelectListItem<T>[];
  onSelect: (value: T) => void;
  onCancel?: () => void;
  renderItem?: (item: SelectListItem<T>, isFocused: boolean) => React.ReactNode;
  active?: boolean;
};
```

## Prompt Helpers (`src/cli/components/common/prompt-confirm.tsx`)

Imperative bridge for rendering a one-shot Ink prompt from a command's `run()` and awaiting the user's choice as a promise. Resolution is **first-wins**: the first of a build callback or the app-exit fallback settles the promise; later resolves are ignored. The element is unmounted at the resolution site (optionally cleared first). Callers own exit policy (exit codes, logging).

**Exports:**

| Export                           | Kind     | Purpose                                                                                                                                                                                            |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promptValue<T>(build, options)` | async fn | Renders `build(resolve)` and resolves with the callback's value, or `options.onExit` when the app exits before any callback fires (Ctrl+C / render failure).                                       |
| `promptConfirm(build)`           | async fn | Thin wrapper over `promptValue` resolving `"confirmed" \| "cancelled"`; app-exit without a choice resolves as `"cancelled"`.                                                                       |
| `ConfirmHandlers`                | type     | `{ onConfirm: () => void; onCancel: () => void }` — passed to the `promptConfirm` build callback.                                                                                                  |
| `PromptValueOptions<T>`          | type     | `{ onExit: T; clearOnResolve?: boolean }` — `onExit` is the app-exit fallback value; `clearOnResolve` calls `instance.clear()` before unmount to repaint a clean terminal (used by the dashboard). |

**Consumers:** `promptValue` — `src/cli/commands/init.tsx` (project dashboard, uses `clearOnResolve`), `src/cli/commands/new/agent.tsx`. `promptConfirm` — `src/cli/commands/uninstall.tsx`, `src/cli/commands/update.tsx`.

## Grid Types

### OptionState (`src/cli/types/matrix.ts`)

Discriminated union for skill option advisory state. Imported by `category-grid.tsx` from `types/index.js`:

```typescript
type OptionState =
  | { status: "normal" }
  | { status: "recommended"; reason: string }
  | { status: "discouraged"; reason: string }
  | { status: "incompatible"; reason: string };
```

### CategoryOption and CategoryRow (`src/cli/components/wizard/category-grid.tsx`)

Types for the build step skill selection grid:

```typescript
type CategoryOption = {
  id: SkillId;
  state: OptionState;
  selected: boolean;
  local?: boolean;
  installed?: boolean;
  scope?: "project" | "global";
  /** Secondary scope badge shown alongside primary (e.g. after G->P toggle, excluded tombstone) */
  secondaryScope?: "project" | "global";
  source?: string;
  hasUnmetRequirements?: boolean;
  unmetRequirementsReason?: string;
  requiredBy?: string;
};

type CategoryRow = {
  id: Category;
  displayName: string;
  required: boolean;
  exclusive: boolean;
  options: CategoryOption[];
};
```

**Consumers:** `category-grid.tsx` (defines both types), `use-category-grid-input.ts` (imports `CategoryRow` only), `use-framework-filtering.ts` (imports `CategoryRow` only), `src/cli/lib/wizard/build-step-logic.ts` (imports both). Note: `checkbox-grid.tsx` does NOT use these types -- it has its own `CheckboxItem<T>` / `CheckboxGridProps<T>` (consumed by `domain-selection.tsx`, with the `CheckboxItem` type reused by `step-agents.tsx`).

### SkillTag Rendering (in `src/cli/components/wizard/category-grid.tsx`)

Internal component within `category-grid.tsx` that renders a single skill option as a bordered tag.

**Scope badges:** When `option.scope` is set, `SkillTag` iterates `[option.scope, option.secondaryScope].filter(Boolean)` and renders each as a space-padded background badge (`G`/`P`, `CLI_COLORS.WARNING` on `CLI_COLORS.LABEL_BG`). The secondary badge covers dual-scope display (e.g., after a G->P toggle where an excluded tombstone still holds the original scope).

**No lock icon / eject icon in `SkillTag`:** `SkillTag` no longer renders `UI_SYMBOLS.LOCK` or `UI_SYMBOLS.EJECT`. `UI_SYMBOLS.LOCK` now renders in `source-grid.tsx` on read-only rows; `UI_SYMBOLS.EJECT` renders in `skill-agent-summary.tsx` (`EjectIcon`).

**Compatibility labels:** `getCompatibilityLabel()` returns labels shown on focus (with labels mode) or always for requiredBy/unmetRequirements. Labels include: `(required by X)`, `(incompatible)`, `(recommended)`, `(discouraged)`, or the unmet-requirements reason.

**Focus seeding (synchronous, store-driven):** `CategoryGrid` has no post-mount effect. `focusedSkillId` is seeded synchronously in the store by `seedFocusedSkillForActiveDomain()` — called by `setStep("build")`, `nextDomain`, `prevDomain`, and `setCurrentDomainIndex` — so the `s` scope hotkey resolves the visually-focused skill with no dependency on a render-phase effect. `CategoryGrid` additionally reports focus movement through `onFocusedSkillChange` (fired by its internal `handleFocusChange` on focus change).

### StepAgents Dual Scope Badges (in `src/cli/components/wizard/step-agents.tsx`)

**Store access:** Reads `selectedAgents`, `agentConfigs`, and `installedAgentConfigs` from wizard store.

**Secondary scope computation:** For each agent row, finds the active config (`!excluded`) and the excluded config, then calls `deriveScopeBadges(activeConfig, excludedConfig)` (from `src/cli/lib/wizard/scope-diff.ts`). A `secondaryScope` badge is emitted only when the excluded tombstone has a different scope than the active entry.

**Rendering:** Scope badges use `[G]`/`[P]` bracket labels via `formatScopeTag()` (not the space-padded background badges `SkillTag` uses). Primary scope badge always shown; secondary badge only when `deriveScopeBadges` returns one.

### StackSelection Grouping (in `src/cli/components/wizard/stack-selection.tsx`)

**`groupStacks()` function:** Groups stacks using the `stack.group` field from `ResolvedStack` (via `remeda` `groupBy`). Stacks with a `group` string are bucketed together; stacks without `group` go to an "Other Frameworks" section (`OTHER_FRAMEWORKS_LABEL`). When no stacks have a `group`, returns a single group with an empty label (`[{ label: "", items }]`), so no header renders.

**`GROUP_ORDER` constant:** Defines sort order for group labels: `["React", "CLI"]`. Groups in this list appear first in order; unlisted groups sort alphabetically after (see `compareGroupLabels()`).

**Row-based rendering:** `buildStackRows()` flattens groups into a `StackListRow` union (`header | spacer | stack | scratch`). A header row is only emitted when `group.label` is a non-empty string, so an empty-label group renders as a flat list with no visual grouping. `StackRow`/`ScratchRow` render individual rows. (There is no `StackSection` component.)

**Agent preselection:** On stack select, derives `stackAgents` from `typedKeys<AgentName>(focusedStack.skills)` and calls the store's `preselectAgentsFromStack(stackAgents)`, which merges with `globalAgentPreselections`, sorts, builds `agentConfigs` via `buildAgentConfigForName`, and preserves excluded tombstones (`collectTombstones`).

## Hotkeys Registry (`src/cli/components/wizard/hotkeys.ts`)

Centralized hotkey definitions. Each hotkey has a `key` (for matching) and `label` (for display). Used by step components, `wizard-layout.tsx`, and `wizard.tsx`.

**Character hotkeys:**

| Export                       | Key | Context                          |
| ---------------------------- | --- | -------------------------------- |
| `HOTKEY_INFO`                | I   | Global (toggle info panel)       |
| `HOTKEY_ACCEPT_DEFAULTS`     | A   | Build step (with stack selected) |
| `HOTKEY_SCOPE`               | S   | Build/agents step                |
| `HOTKEY_SETTINGS`            | S   | Sources step                     |
| `HOTKEY_TOGGLE_LABELS`       | D   | Build step                       |
| `HOTKEY_FILTER_INCOMPATIBLE` | F   | Build step                       |
| `HOTKEY_SET_ALL_LOCAL`       | L   | Sources step (customize view)    |
| `HOTKEY_SET_ALL_PLUGIN`      | P   | Sources step (customize view)    |
| `HOTKEY_ADD_SOURCE`          | A   | Settings step                    |

**Structural key labels** (display-only, for footer hints): `KEY_LABEL_ENTER`, `KEY_LABEL_ESC`, `KEY_LABEL_SPACE`, `KEY_LABEL_DEL`, `KEY_LABEL_ARROWS_VERT` (`↑/↓`). Also exported: `KEY_SPACE` (the literal `" "` input character used for space-key matching, not a display label).

**No other `KEY_LABEL_*` constants exist.** Previously-documented `KEY_LABEL_TAB`, `KEY_LABEL_ARROWS`, `KEY_LABEL_VIM`, and `KEY_LABEL_VIM_VERT` have been removed.

Helper: `isHotkey(input, hotkey)` for case-insensitive matching.

## InfoPanel (`src/cli/components/wizard/info-panel.tsx`)

Scrollable panel showing marketplace/stack header and a skill/agent summary. Toggled via `HOTKEY_INFO` (I key). Rendered inside `wizard-layout.tsx` when `showInfo` store state is true (gated by `FEATURE_FLAGS.INFO_PANEL`, currently enabled).

**Exports:** `InfoPanel` (React.FC, no props -- reads `skillConfigs`, `agentConfigs`, `selectedStackId`, and `enabledSources` from wizard store).

**Layout:**

- Header: marketplace source names + selected stack name (bordered bottom separator)
- Body: `SkillAgentSummary` component for skill/agent listing
- Scrollable via `useMeasuredHeight()` + manual `scrollOffset` state

**Consumers:** `wizard-layout.tsx`

## SkillAgentSummary (`src/cli/components/wizard/skill-agent-summary.tsx`)

Two-column (skills | agents) summary component with scope labels (Project/Global), eject icons for local skills, diff markers (+/- for added/removed items in edit mode), and source change markers (~). The component is a thin renderer: it reads baseline state from the store, delegates all diff computation to `computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts`, and renders the returned row buckets. Uses `UI_SYMBOLS.BULLET` for unchanged items and `formatSourceDisplayName()` (from `consts.ts`) for human-readable source labels.

**Exports:** only `SkillAgentSummaryProps` (`{ skillConfigs: SkillConfig[]; agentConfigs: AgentScopeConfig[] }` — both required) and `SkillAgentSummary` (React.FC). `TableHeader`, `ScopeLabel`, `EjectIcon`, `SkillRow`, and `AgentRow` are module-internal (not exported).

**Store access:** Reads `installedSkillConfigs`, `installedAgentConfigs`, and `isInitMode` from the wizard store and passes them (with the `skillConfigs`/`agentConfigs` props) to `computeScopeDiff()`. Renders `null` when `diff.hasContent` is false.

**Diff computation (`computeScopeDiff` in `scope-diff.ts`):** returns `projectSkillRows`, `globalSkillRows`, `projectAgentRows`, `globalAgentRows`, `hasContent`. Each row carries a `DiffRowStatus` = `"added" | "source-changed" | "removed" | "unchanged"`. The following invariants live in `computeScopeDiff`, not the component:

- **Diff baseline (D-230 / D-232):** Baseline is NOT pre-filtered. Tombstones remain first-class entries in `prevSkillKeySet` and the `removedSkills` match; a tombstone occupies the `(id, scope)` slot ("global install silenced at project scope", D-223). Only `prevSourceMap` filters to active (`!excluded`) baseline entries — tombstones don't represent a live install source.
- **Slot-occupancy removal match:** A baseline entry is removed ONLY if nothing (active OR tombstone) occupies that slot in current state — prevents a spurious `-` at Global on G→P toggle (D-230) and a spurious `+` at Global on re-edit of the stored tombstone (D-232).
- **Tombstone dedup (`uniqueExcludedGlobalSkills`):** Dedups current tombstone rows against inherited-global entries by `id` only — the Global section never shows two rows for the same skill.
- **Source change detection:** `computeScopeDiff()` builds `prevSourceMap` from active (non-excluded) baseline entries keyed by `"${id}:${scope}"` and passes it to `classifyDiffRow()` (a module-internal helper), which emits `"source-changed"` (with `prevSource`) when `!isNew && prevSource != null && prevSource !== skill.source`.
- **Init mode gating:** When `isInitMode` is true, `removedGlobalSkills` / `removedGlobalAgents` are suppressed (empty arrays).

**Scope-badge helpers (also in `scope-diff.ts`):** `formatScopeTag(scope)` returns `[G]`/`[P]`; `deriveScopeBadges(active, excluded)` derives the primary + secondary badges from an active entry and its tombstone (used by `StepAgents`).

**Diff markers** (`DIFF_PREFIX` / `DIFF_COLOR` in the component):

- `+ ` (green, `SUCCESS`) -- newly added skill/agent
- `- ` (red, `ERROR`) -- removed skill/agent
- `~ ` (yellow, `WARNING`) -- source mode changed (with "from → to" label)
- `BULLET` (neutral) -- unchanged item

**Consumers:** `step-confirm.tsx`, `info-panel.tsx`

## Hook Patterns

### Hook Reference (`src/cli/components/hooks/`)

All 13 hooks (2 co-located `*.test.ts` files excluded). Detailed sections for the scroll hooks and terminal dimensions appear below; this table is the index.

| Hook (file)                       | Purpose                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-build-step-props.ts`         | Derives `StepBuildProps` from the wizard store: resolves the active domain and wires domain-aware `onToggle` / `onContinue` / `onBack` callbacks (`nextDomain`/`prevDomain`).                             |
| `use-category-grid-input.ts`      | Registers a stable `useInput` handler for the build-step category grid (space to toggle, Tab / Shift+Tab, arrow/vim movement, label & filter hotkeys) via a ref to survive domain-remount stale closures. |
| `use-focused-list-item.ts`        | 2D grid focus state `(row, col)` with wrapping, column clamping, disabled-column skipping, and an optional row-skip predicate; also exports the `Direction` type.                                         |
| `use-framework-filtering.ts`      | Memoizes `buildCategoriesForDomain()` into `CategoryRow[]` for the current domain, selections, installed skills, and incompatible-filter flag.                                                            |
| `use-keyboard-navigation.ts`      | Single-axis (vertical) list navigation: focused-index state with wrap, vim keys, Enter/Escape handlers, and `isActive` gating.                                                                            |
| `use-measured-height.ts`          | Measures a Box's computed height via Ink's Yoga `measureElement`, retrying on early renders (Yoga returns 0 pre-layout) and re-measuring on terminal resize.                                              |
| `use-modal-state.ts`              | Generic modal open/close lifecycle with typed context (`open(ctx)` sets `isOpen`; `close()` resets).                                                                                                      |
| `use-row-scroll.ts`               | Row-based scroll offset for uniform 1-line lists (delegates to `computeRowScrollTop`) — see Scrolling section.                                                                                            |
| `use-section-scroll.ts`           | Pixel-offset scroll for variable-height sections; also exports the pure `computeRowScrollTop()` helper — see Scrolling section.                                                                           |
| `use-source-grid-search-modal.ts` | Manages the bound-skill search modal for `SourceGrid` (search trigger, results, bind, close) with alias lookup via `matrix.slugMap`.                                                                      |
| `use-source-operations.ts`        | Add/remove source operations (`addSource` / `removeSource` from `source-manager.ts`) with success/error `statusMessage` state for the settings step.                                                      |
| `use-terminal-dimensions.ts`      | Reactive terminal `columns` / `rows` with an 80x24 non-TTY fallback; re-renders on resize.                                                                                                                |
| `use-text-input.ts`               | Text input state with backspace/delete handling and printable-ASCII (char codes 32-126) filtering.                                                                                                        |

### Store Access

```typescript
// Select specific fields (prevents unnecessary re-renders)
const step = useWizardStore((s) => s.step);
const toggleTechnology = useWizardStore((s) => s.toggleTechnology);
```

### Keyboard Input

```typescript
import { useInput } from "ink";

useInput((input, key) => {
  if (key.return) handleConfirm();
  if (key.escape) handleCancel();
  if (key.upArrow) handleUp();
  if (key.downArrow) handleDown();
});
```

### Terminal Dimensions

```typescript
import { useTerminalDimensions } from "../hooks/use-terminal-dimensions.js";

const { width, height } = useTerminalDimensions();
```

## Theme

**File:** `src/cli/components/themes/default.ts`

Provides `cliTheme` for `@inkjs/ui` `ThemeProvider`. Applied in `wizard.tsx`:

```tsx
<ThemeProvider theme={cliTheme}>{/* wizard content */}</ThemeProvider>
```

## Testing Pattern

Wizard components have co-located test files using Vitest + ink-testing-library:

```
step-build.tsx
step-build.test.tsx
```

Test files use:

- `ink-testing-library` for rendering
- `createMockSkill()`, `createMockMatrix()`, `createMockCategory()` from `src/cli/lib/__tests__/factories/` (`skill-factories.ts`, `matrix-factories.ts`, `category-factories.ts`)
- Test constants from `src/cli/lib/__tests__/test-constants.ts` (keyboard escape sequences, timing delays)

## Scrolling

Long lists that exceed terminal height are handled by two scroll hooks (there is no `use-virtual-scroll.ts`): `use-section-scroll.ts` for variable-height sections (category grid) and `use-row-scroll.ts` for uniform 1-line rows (agent/source/stack lists). Shared constants live in `SCROLL_VIEWPORT` in `src/cli/consts.ts`:

| Constant                  | Value | Purpose                                    |
| ------------------------- | ----- | ------------------------------------------ |
| `SCROLL_INDICATOR_HEIGHT` | 1     | Height of scroll indicator line            |
| `CATEGORY_NAME_LINES`     | 2     | Lines per category name row (incl. margin) |
| `CATEGORY_MARGIN_LINES`   | 1     | Margin between category sections           |
| `MIN_VIEWPORT_ROWS`       | 5     | Minimum rows before enabling scroll        |
| `MIN_TERMINAL_HEIGHT`     | 15    | Minimum terminal height for wizard display |

### Section Scroll (`use-section-scroll.ts`)

Pixel-offset scroll for views with variable-height sections (e.g., category grid).

### Row Scroll (`use-row-scroll.ts`)

Row-based scroll for views with uniform 1-line rows (e.g., agent list, source list).
