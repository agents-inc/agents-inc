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
last_validated: 2026-07-30
---

<!-- PARTIAL re-validation 2026-07-31 (InfoPanel-extraction drift + terminal-size gate). `last_validated` deliberately NOT re-stamped: this pass validated four areas against source and made no judgement on the rest of the file. Validated and rewritten: (1) the wizard directory tree — `info-panel.tsx` replaced by `summary-panel.tsx`, test-file count 13 -> 15, both re-counted on disk; (2) the whole `## InfoPanel` section, now `## SummaryPanel`, rewritten against summary-panel.tsx + use-panel-scroll.ts, and its NEEDS-VALIDATION marker cleared — the manual scrollOffset/useMeasuredHeight machinery it described is gone, the panel is rendered by BOTH wizard-layout.tsx and step-confirm.tsx, and paddingX-only + PanelHeader's flexShrink={0} are recorded as load-bearing; (3) consumer lists re-derived by grep — SkillAgentSummary is consumed by summary-panel.tsx AND commands/list.tsx, ScrollAffordance by exactly source-grid.tsx + summary-panel.tsx; (4) the Scrolling section: three hooks not two (use-panel-scroll.ts was missing from the hook table entirely, count 13 -> 14), plus two NEW subsections — "No affordance on the grid steps" (owner decision; records that category-grid DISCARDS the counts while the useRowScroll views never compute them, and that this narrows but does not close D-266) and "Terminal-size gates" (the WizardLayout guard added 2026-07-31 alongside the pre-existing startup gate; both now read isTerminalLargeEnough/formatTerminalTooSmallMessage from src/cli/utils/terminal.ts). NOT re-validated this pass and untouched: hotkey registry, SourceGrid row states, SkillAgentSummary diff invariants, focus seeding, theme, testing pattern. Prior annotation follows. -->

<!-- re-validated 2026-07-30 (product v0.146.0, UX/rendering pass): added the new ScrollAffordance component (D-263) and listed it in the wizard directory tree, correcting the source-file count 22→23; rewrote "Focus seeding" — the doc claimed CategoryGrid has no post-mount effect and that handleFocusChange dispatches onFocusedSkillChange, both untrue since D-272, which moved the dispatch INTO a mount effect and out of handleFocusChange; documented the D-272 alphabetical grid ordering, which was undocumented; removed the `prevSource` field and the "(OldSource → NewSource)" transition-label claim from the SkillAgentSummary section (D-261 replaced both with the compact `~`) and dropped the stale formatSourceDisplayName attribution; annotated HOTKEY_FILTER_INCOMPATIBLE as feature-flag-gated (D-269); expanded the Scrolling section with the measured-viewport/overscroll model, the source-grid clipping gates and the pinned-header rule (D-263/D-271); noted the two open computeScopeDiff display quirks -->

# Component Patterns

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

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
  hooks/                     # React hooks (14 hooks, 2 test files)
    use-build-step-props.ts
    use-category-grid-input.ts
    use-focused-list-item.ts
    use-framework-filtering.ts
    use-keyboard-navigation.ts
    use-measured-height.ts
    use-modal-state.ts
    use-panel-scroll.ts
    use-row-scroll.ts
    use-section-scroll.ts
    use-source-grid-search-modal.ts
    use-source-operations.ts
    use-terminal-dimensions.ts
    use-text-input.ts
  themes/
    default.ts               # CLI theme configuration
  wizard/                    # Wizard step components (23 source files, 15 test files)
    wizard.tsx               # Main wizard orchestrator
    wizard-layout.tsx        # Layout wrapper (tabs + content + info overlay + footer); owns the mid-session terminal-size guard
    wizard-tabs.tsx          # Step progress indicator tabs
    run-wizard-session.tsx   # runWizardSession(): hydrate store, render <Wizard>, await exit
    step-stack.tsx           # Stack selection step
    step-build.tsx           # Technology selection step
    step-sources.tsx         # Source selection step
    step-agents.tsx          # Agent selection step
    step-confirm.tsx         # Confirmation step: renders SummaryPanel, claims only Enter/Esc (25 lines)
    step-settings.tsx        # Settings overlay
    category-grid.tsx        # Category grid layout (internal CategorySection + SkillTag)
    checkbox-grid.tsx        # Generic checkbox grid (used by DomainSelection)
    domain-selection.tsx     # Domain tab selector
    selection-card.tsx       # Selected item card (used by StepSources choice view)
    skill-agent-summary.tsx  # 2-box skill/agent listing with scope labels (rendered by SummaryPanel)
    source-grid.tsx          # Per-skill source picker (inline layout with column headers)
    search-modal.tsx         # Bound skill search modal (rendered by SourceGrid)
    stack-selection.tsx      # Grouped stack list component
    summary-panel.tsx        # Marketplace/stack header + scrollable SkillAgentSummary (the ONE panel; rendered by both the I overlay and StepConfirm)
    scroll-affordance.tsx    # Shared "N more above / N more below" overflow hint (D-263)
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

| Symbol               | Value           | Usage                                                                       |
| -------------------- | --------------- | --------------------------------------------------------------------------- |
| `CHECKBOX_CHECKED`   | `[x]`           | Selected checkbox                                                           |
| `CHECKBOX_UNCHECKED` | `[ ]`           | Unselected checkbox                                                         |
| `CHEVRON`            | unicode chevron | Navigation indicator                                                        |
| `CHEVRON_SPACER`     | space           | Non-focused spacer                                                          |
| `SELECTED`           | checkmark       | Selected item                                                               |
| `UNSELECTED`         | circle          | Unselected item                                                             |
| `CURRENT`            | filled circle   | Current focus                                                               |
| `SKIPPED`            | dash            | Skipped step                                                                |
| `DISABLED`           | dash            | Disabled item                                                               |
| `DISCOURAGED`        | `!`             | Warning indicator                                                           |
| `LOCK`               | lock emoji      | Locked/read-only items                                                      |
| `EJECT`              | eject symbol    | Local/ejected skill indicator                                               |
| `BULLET`             | bullet dot      | List item marker in confirm/summary                                         |
| `SCROLL_UP`          | triangle up     | Scroll indicator                                                            |
| `SCROLL_DOWN`        | triangle down   | Scroll indicator                                                            |
| `CHECK`              | checkmark       | Success glyph (same glyph as `SELECTED`)                                    |
| `CROSS`              | ✗               | Failure/cross glyph                                                         |
| `ADDED`              | `+`             | Added-diff marker (info panel, confirm step, Sources tab)                   |
| `REMOVED`            | `-`             | Removed/pending-removal diff marker (info panel, confirm step, Sources tab) |

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

**Cell ordering (D-272):** the options in each `CategoryRow` are sorted by `displayName`, lowercased, using remeda's `sortBy` in `buildCategoriesForDomain()` (`src/cli/lib/wizard/build-step-logic.ts`). Before this the order followed matrix and `readdir` insertion order, so the grid reshuffled between runs and between source types. The lowercased ordinal comparison is deliberately locale-independent, so the order is identical on every machine — which is what makes a positional E2E walk over the grid meaningful. Category ROWS are ordered separately, by `cat.order ?? 0`.

**Focus dispatch (two writers, by design).** `focusedSkillId` is written from both the store and the grid, and the pair is what keeps store state equal to what is drawn:

1. **Store, synchronous (D-233 "Fix A").** `seedFocusedSkillForActiveDomain()` seeds `focusedSkillId` before the frame — called by `setStep("build")`, `nextDomain`, `prevDomain`, `setCurrentDomainIndex`, and both hydration paths. It resolves the domain via `getCurrentDomain() ?? FALLBACK_DOMAIN`, mirroring the build-step renderer's own fallback, so the seed can never be `null` while a cell is visibly focused.
2. **`CategoryGrid`, mount effect (D-272).** A `useEffect` keyed on the resolved focused cell (`categories[focusedRow]?.options[focusedCol]?.id ?? null`) calls `onFocusedSkillChange`. It fires **on mount** as well as on change, which is the point: `useFocusedListItem` only fires `onChange` during navigation, so the initially highlighted cell — and any cell shifted by a category reshape rather than by a keypress — would otherwise never reach the store, leaving `s` a no-op until the first arrow key. The dispatch was deliberately moved OUT of `handleFocusChange` (which now only handles label toggling and `onFocusChange`) so it is no longer navigation-gated.

Consequence: the older "Scenario B `focusedSkillId` race" narrative no longer describes the skill path. The agent path still has it — `focusedAgentId` is seeded by a post-mount `useEffect` in `step-agents.tsx` with no synchronous store counterpart.

### SourceGrid Row States (in `src/cli/components/wizard/source-grid.tsx`)

A `SourceRow` renders in one of four states, driven by its optional flags:

| State           | Flag       | Marker before the name          | Name colour          | Interactive?                         |
| --------------- | ---------- | ------------------------------- | -------------------- | ------------------------------------ |
| Ordinary        | —          | none                            | `CLI_COLORS.NEUTRAL` | Yes                                  |
| Locked global   | `readOnly` | `UI_SYMBOLS.LOCK`               | dimmed               | No (inert)                           |
| Pending removal | `disabled` | `UI_SYMBOLS.REMOVED` (red `- `) | `CLI_COLORS.ERROR`   | No (inert)                           |
| Added           | `added`    | `UI_SYMBOLS.ADDED` (green `+ `) | `CLI_COLORS.SUCCESS` | Yes — added rows stay fully editable |

**Inertness is the interaction contract.** `isRowInert(row)` (`readOnly || disabled`) is consulted in three places, so an inert row can never be acted on: focus seeding and arrow navigation skip inert rows (`firstFocusableRowIndex` and the focus walk), the SPACE handler returns immediately on them, and the render drops the selection chevron and search pill. A pending-removal row therefore shows its **persisted** source purely as information — the skill that is going away cannot also have its source changed. `disabled` and `readOnly` are deliberately distinct flags: the lock means "installed globally, not yours to change here"; the removal marker means "saving will remove this".

**The diff palette is shared with the confirm step by design.** `rowStatusGlyph` / `rowLabelColor` mirror `DIFF_PREFIX` / `DIFF_COLOR` in `skill-agent-summary.tsx` (both built on `UI_SYMBOLS.ADDED` / `UI_SYMBOLS.REMOVED` and `CLI_COLORS.SUCCESS` / `CLI_COLORS.ERROR`), so an added or pending-removal skill reads identically on the Sources tab and the confirm step. The marker (not the colour) carries the meaning in no-color terminals. On a **focused** row, `focusedRowLabelColor` keeps the diff colour for added/removed rows while ordinary focused rows stay `CLI_COLORS.WHITE` on the focus background — focus styling must never erase diff information.

**Session-diff flags come from the store, not the component.** `buildSourceRows` (see `store-map.md`, "Sources-tab session diff") decides `disabled`/`added` against the hydration snapshot per `(id, scope)` slot, using the same `skillSlotKey` as the confirm step's `computeScopeDiff`. Because removal is per slot, one skill can occupy two rows: a collapsed dual-scope `[P][G]` pair renders a surviving global row plus a Project pending-removal row, both inert (keyed `${skillId}-${scope}`, so the two rows never collide).

**Inert rows are reachable by SCROLLING, not by focus (D-271).** Because focus skips inert rows, a trailing locked or pending-removal row used to be clipped with no way to reach it — exactly the row that mattered most. `SourceGrid`'s `useInput` therefore splits vertical keys two ways, using `lastFocusableRowIndex(rows)`: when nothing is focusable at all (`lastFocusableRow === -1`) or focus already sits on the last focusable row, `↓` calls `scrollBy(1)` on `useSectionScroll` to travel the viewport past focus instead of wrapping; `↑` does the same via `scrollBy(-1)` in the no-focusable-row case. Otherwise the keys move focus normally. Both are additionally gated on `scrollEnabled` and a non-zero `hiddenBelow`/`hiddenAbove`.

**Row grouping.** `groupRowsByScope(rows)` returns `Global` / `Project` sections only when BOTH exist; when every row shares a scope it returns `[]` and the grid renders flat with no scope column. Each group's first row carries the section label in a `SCOPE_COL_WIDTH` gutter. Grouping is presentation only — navigation indices stay in the store's sort order, which `sourceRowSortTier` aligns with the render order.

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
| `HOTKEY_FILTER_INCOMPATIBLE` | F   | Build step — **feature-gated**   |
| `HOTKEY_SET_ALL_LOCAL`       | L   | Sources step (customize view)    |
| `HOTKEY_SET_ALL_PLUGIN`      | P   | Sources step (customize view)    |
| `HOTKEY_ADD_SOURCE`          | A   | Settings step                    |

**Structural key labels** (display-only, for footer hints): `KEY_LABEL_ENTER`, `KEY_LABEL_ESC`, `KEY_LABEL_SPACE`, `KEY_LABEL_DEL`, `KEY_LABEL_ARROWS_VERT` (`↑/↓`). Also exported: `KEY_SPACE` (the literal `" "` input character used for space-key matching, not a display label).

**No other `KEY_LABEL_*` constants exist.** Previously-documented `KEY_LABEL_TAB`, `KEY_LABEL_ARROWS`, `KEY_LABEL_VIM`, and `KEY_LABEL_VIM_VERT` have been removed.

Helper: `isHotkey(input, hotkey)` for case-insensitive matching.

**`HOTKEY_FILTER_INCOMPATIBLE` is dormant (D-269).** It is gated behind `FEATURE_FLAGS.FILTER_INCOMPATIBLE` (default `false`) in **two** places, which must stay in step: the keypress arm in `use-category-grid-input.ts` (`FEATURE_FLAGS.FILTER_INCOMPATIBLE && isHotkey(input, HOTKEY_FILTER_INCOMPATIBLE) && onToggleFilterIncompatible`) and the footer hint's `isVisible` in `wizard-layout.tsx`. Pressing `F` is a no-op today; the constant and the store action stay intact for a one-flag re-enable.

**`HOTKEY_SCOPE` and `HOTKEY_SETTINGS` share the `s` key** and are context-gated in `wizard.tsx` — scope on `build`/`agents`, settings on `sources` — so both are never active at once.

## SummaryPanel (`src/cli/components/wizard/summary-panel.tsx`)

Scrollable panel showing a marketplace/stack header above a skill/agent summary. **There is one panel, and both summary surfaces render it**: the `I` overlay in `wizard-layout.tsx` (toggled via `HOTKEY_INFO`, gated by `FEATURE_FLAGS.INFO_PANEL`, currently enabled) and `step-confirm.tsx`. That is why the two can no longer disagree.

> **`info-panel.tsx` no longer exists.** The duplicated panel was extracted here; once the cosmetics were reconciled `InfoPanel` reduced to `() => <SummaryPanel />` — pure indirection — and was deleted. Anything still naming `InfoPanel` or `info-panel.tsx` is stale.

**Exports:** `SummaryPanel` (React.FC, no props — reads `skillConfigs`, `agentConfigs` and `selectedStackId` from the wizard store). `formatSkillMarketplaces` and `PanelHeader` are module-internal.

**Marketplace row derivation.** The row names the distinct non-`EJECT_SOURCE` values across `skillConfigs`, formatted through `formatSourceDisplayName` and joined with `" · "`, sorted so the row cannot reorder between renders. Three cases, and the two zero-marketplace ones are distinct states: no skills at all falls back to `DEFAULT_PUBLIC_SOURCE_NAME` (reachable — the `I` overlay opens from the stack step); skills present but every one ejected renders `ALL_SKILLS_EJECTED_LABEL`; otherwise the marketplaces are named, with ejected siblings contributing no name but not suppressing the others. Tombstoned (`excluded`) entries contribute, matching `computeScopeDiff`, which renders them as rows in the summary below.

**Stack row.** `getStackName(selectedStackId)` from `components/wizard/utils.ts` — an **asserting** lookup that throws on a stack id the matrix does not hold, not a display fallback. It returns `undefined` only for "no stack selected", which this row renders as `none`.

**Layout:**

- Header (`PanelHeader`): marketplace source names + selected stack name, above a dimmed bottom border. It sits INSIDE the scrolled content, so its `marginBottom` scrolls away rather than permanently costing the viewport a row, and it carries `flexShrink={0}` — see "Fixed-height blocks inside a clipped viewport" below.
- Body: `SkillAgentSummary` for the skill/agent listing
- Scroll: the `usePanelScroll` hook owns the viewport ref, the content ref, the offset and the `↑`/`↓` keys. A host needing other keys adds its own `useInput` on disjoint keys — `StepConfirm` claims `Enter`/`Esc` that way.
- `<ScrollAffordance>` rendered as a **sibling** of the clipping viewport, fed the hook's `hiddenAbove` / `hiddenBelow`
- **`paddingX` only.** Vertical padding is unshrinkable, so on a short terminal it claims the viewport's last row; `measureElement` then reports `0`, `maxScroll` stays `0` and the affordance returns `null` — no content AND no signal that content is missing.

**Fixed-height blocks inside a clipped viewport must not shrink.** Ink sets `flexShrink: 1` as a `Box` component default — the opposite of Yoga's own default — so `flexShrink={0}` on the scrolling content box protects only that box. `PanelHeader` carries its own, or Yoga compresses it instead of letting the viewport clip it and the Marketplace and Stack rows overprint into one line. The `SkillAgentSummary` wrapper needs none: its height is entirely content-derived, so there is no fixed chrome to compress.

**Content measurement uses the tallest reading.** `usePanelScroll` keeps `contentHeight` monotonic (`Math.max(prev, height)`). Yoga under-reports a wrapped subtree measured inside a viewport too short to lay it out, and reports `0` inside a zero-height one. Believing a squeezed reading shrinks the hidden-line count until the affordance disappears, which hands its row back and grows the count again — a render loop. `useSectionScroll` applies the same rule to its content box. The hook deliberately does **not** return `contentHeight`, so "content height must never gate the clip" is enforced by the interface rather than by a comment.

**Consumers:** `wizard-layout.tsx` (the `I` overlay), `step-confirm.tsx`

## SkillAgentSummary (`src/cli/components/wizard/skill-agent-summary.tsx`)

Two-column (skills | agents) summary component with scope labels (Project/Global), eject icons for local skills, diff markers (+/- for added/removed items in edit mode), and source change markers (~). The component is a thin renderer: it reads baseline state from the store, delegates all diff computation to `computeScopeDiff()` in `src/cli/lib/wizard/scope-diff.ts`, and renders the returned row buckets. Uses `UI_SYMBOLS.BULLET` for unchanged items.

**A row is marker + display name, nothing else (D-261).** `SkillRow` renders `DIFF_PREFIX[status]` + `getSkillDisplayName(row.id)`, plus an `EjectIcon` when `row.source === EJECT_SOURCE`. The verbose `(agents-inc → eject)` source-transition label is **gone** — it wrapped out of its row — and the compact `~` marker the row already carried is now the whole signal. `skill-agent-summary.tsx` consequently no longer imports `formatSourceDisplayName`; `summary-panel.tsx` still does, for its marketplace header.

**Exports:** only `SkillAgentSummaryProps` (`{ skillConfigs: SkillConfig[]; agentConfigs: AgentScopeConfig[] }` — both required) and `SkillAgentSummary` (React.FC). `TableHeader`, `ScopeLabel`, `EjectIcon`, `SkillRow`, and `AgentRow` are module-internal (not exported).

**Store access:** Reads `installedSkillConfigs`, `installedAgentConfigs`, and `isInitMode` from the wizard store and passes them (with the `skillConfigs`/`agentConfigs` props) to `computeScopeDiff()`. Renders `null` when `diff.hasContent` is false.

**Diff computation (`computeScopeDiff` in `scope-diff.ts`):** returns `projectSkillRows`, `globalSkillRows`, `projectAgentRows`, `globalAgentRows`, `hasContent`. Each row carries a `DiffRowStatus` = `"added" | "source-changed" | "removed" | "unchanged"`. The following invariants live in `computeScopeDiff`, not the component:

- **Diff baseline (D-230 / D-232):** Baseline is NOT pre-filtered. Tombstones remain first-class entries in `prevSkillKeySet` and the `removedSkills` match; a tombstone occupies the `(id, scope)` slot ("global install silenced at project scope", D-223). Only `prevSourceMap` filters to active (`!excluded`) baseline entries — tombstones don't represent a live install source.
- **Slot-occupancy removal match:** A baseline entry is removed ONLY if nothing (active OR tombstone) occupies that slot in current state — prevents a spurious `-` at Global on G→P toggle (D-230) and a spurious `+` at Global on re-edit of the stored tombstone (D-232).
- **Tombstone dedup (`uniqueExcludedGlobalSkills`):** Dedups current tombstone rows against inherited-global entries by `id` only — the Global section never shows two rows for the same skill.
- **Source change detection:** `computeScopeDiff()` builds `prevSourceMap` from active (non-excluded) baseline entries keyed via `skillSlotKey(id, scope)` and passes it to `classifyDiffRow()` (a module-internal helper), which emits `"source-changed"` when `!isNew && prevSource != null && prevSource !== skill.source`. The previous source is used only to make that comparison and is **not** carried on the row — `SkillDiffRow` has no `prevSource` field since D-261.
- **One key, both surfaces (D-278):** `skillSlotKey(id, scope)` is exported from `scope-diff.ts` (and re-exported from `src/cli/lib/wizard/index.ts`) precisely so the Sources tab's own session diff keys on the same `(id, scope)` slot. Both surfaces previously derived their own key — the confirm step per slot, the Sources tab per id — and disagreed. Never re-derive the key inline.
- **Init mode gating:** When `isInitMode` is true, `removedGlobalSkills` / `removedGlobalAgents` are suppressed (empty arrays). Since D-277 this suppression is **vestigial in practice**: a project-scope deselect of a globally-installed item is refused by the store guards (init included), and a real `cc init` can never carry a global baseline anyway (`Init.run` routes to the dashboard → `edit` when one is found). It is kept as a cheap invariant so an init-mode diff can never render a removed-global row. `computeScopeDiff` is now the only remaining consumer of `isInitMode` besides this component.

**Scope-badge helpers (also in `scope-diff.ts`):** `formatScopeTag(scope)` returns `[G]`/`[P]`; `deriveScopeBadges(active, excluded)` derives the primary + secondary badges from an active entry and its tombstone (used by `StepAgents`).

**Diff markers** (`DIFF_PREFIX` / `DIFF_COLOR` in the component):

- `+ ` (green, `SUCCESS`) -- newly added skill/agent
- `- ` (red, `ERROR`) -- removed skill/agent
- `~ ` (yellow, `WARNING`) -- source changed (marker only; no transition label since D-261)
- `BULLET` (neutral) -- unchanged item

**Known limitations (`computeScopeDiff`, both OPEN).** Two display quirks live in the confirm-step diff and are deliberately NOT mirrored by the Sources tab, which is the authoritative surface for both shapes:

| Shape                                                                          | `computeScopeDiff` renders                                                              | Why it is wrong                                                                                                                   | Reachability                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Snapshot `[G active]` + live `[P active]`, **no** tombstone (inherited global) | Two Global rows for one skill: `unchanged` (from `inheritedGlobalSkills`) AND `removed` | `inheritedGlobalSkills` re-surfaces the entry while the slot-occupancy `removedSkills` filter independently classifies it as gone | Much less reachable since D-279 masks such configs at write time                                          |
| Snapshot `[G tombstone]` + live `[]`                                           | A Global `removed` row                                                                  | A tombstone is a MASK over a global install, not an install — dropping it deletes nothing                                         | Cannot occur within a session: every path that drops a tombstone fills the same slot with an active entry |

The Sources-tab equivalents avoid both: `isSlotAlreadyRendered` suppresses the duplicate, and snapshot tombstones are excluded as removal candidates. Source: `.ai-docs/agent-findings/2026-07-29-per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row.md`; see also the 0.146.0 changelog backlog.

**Consumers:** `summary-panel.tsx` (and therefore both surfaces that render it), plus the dashboard `commands/list.tsx`

## ScrollAffordance (`src/cli/components/wizard/scroll-affordance.tsx`)

The shared overflow hint introduced by D-263: one pinned, text-only line reading `N more above` / `N more below` (joined by three spaces when both apply). There is no glyph and no scrollbar — the counts are the whole affordance, which keeps it legible under `NO_COLOR` and in non-TTY captures.

```typescript
export type ScrollAffordanceProps = {
  /** Content lines scrolled off the top of the viewport. */
  hiddenAbove: number;
  /** Content lines that do not fit below the viewport. */
  hiddenBelow: number;
};
```

**Exports:** `ScrollAffordance` (React.FC) and `ScrollAffordanceProps`. `formatHiddenCounts` is module-internal.

**Placement rule (load-bearing):** render it as a **sibling** of the clipped viewport, never inside it — a viewport that clips its own overflow would clip this line too. Its fixed `SCROLL_VIEWPORT.SCROLL_INDICATOR_HEIGHT` row (`flexShrink={0}`) is taken out of the space the viewport grows into, so the viewport shrinks by exactly one row while the affordance shows. It returns `null` when both counts are `<= 0`, so a non-overflowing view pays nothing.

**Consumers: exactly two — `source-grid.tsx` and `summary-panel.tsx`.** The Skills (build), Domains, Agents and Stack views clip **silently and on purpose**; see "No affordance on the grid steps" under Scrolling.

## Hook Patterns

### Hook Reference (`src/cli/components/hooks/`)

All 14 hooks (2 co-located `*.test.ts` files excluded). Detailed sections for the scroll hooks and terminal dimensions appear below; this table is the index.

| Hook (file)                       | Purpose                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `use-build-step-props.ts`         | Derives `StepBuildProps` from the wizard store: resolves the active domain and wires domain-aware `onToggle` / `onContinue` / `onBack` callbacks (`nextDomain`/`prevDomain`).                                                                                                                                            |
| `use-category-grid-input.ts`      | Registers a stable `useInput` handler for the build-step category grid (space to toggle, Tab / Shift+Tab, arrow/vim movement, label & filter hotkeys) via a ref to survive domain-remount stale closures.                                                                                                                |
| `use-focused-list-item.ts`        | 2D grid focus state `(row, col)` with wrapping, column clamping, disabled-column skipping, and an optional row-skip predicate; also exports the `Direction` type.                                                                                                                                                        |
| `use-framework-filtering.ts`      | Memoizes `buildCategoriesForDomain()` into `CategoryRow[]` for the current domain, selections, installed skills, and incompatible-filter flag.                                                                                                                                                                           |
| `use-keyboard-navigation.ts`      | Single-axis (vertical) list navigation: focused-index state with wrap, vim keys, Enter/Escape handlers, and `isActive` gating.                                                                                                                                                                                           |
| `use-measured-height.ts`          | Measures a Box's computed height via Ink's Yoga `measureElement`, retrying on early renders (Yoga returns 0 pre-layout) and re-measuring on terminal resize.                                                                                                                                                             |
| `use-modal-state.ts`              | Generic modal open/close lifecycle with typed context (`open(ctx)` sets `isOpen`; `close()` resets).                                                                                                                                                                                                                     |
| `use-panel-scroll.ts`             | Line scrolling for ONE clipped viewport driven by `↑`/`↓`: owns the viewport ref, content ref, offset, monotonic content height and `hiddenAbove`/`hiddenBelow`. Used by `summary-panel.tsx`. Deliberately does not return `contentHeight` — see SummaryPanel.                                                           |
| `use-row-scroll.ts`               | Row-based scroll offset for uniform 1-line lists (delegates to `computeRowScrollTop`). Exposes no hidden-line counts, by design — see Scrolling section.                                                                                                                                                                 |
| `use-section-scroll.ts`           | Pixel-offset scroll for variable-height sections. Measures section, viewport and content boxes; separates focus-following from user overscroll and exposes `scrollBy`; emits `hiddenAbove`/`hiddenBelow` for a `ScrollAffordance` sibling. Also exports the pure `computeRowScrollTop()` helper — see Scrolling section. |
| `use-source-grid-search-modal.ts` | Manages the bound-skill search modal for `SourceGrid` (search trigger, results, bind, close) with alias lookup via `matrix.slugMap`.                                                                                                                                                                                     |
| `use-source-operations.ts`        | Add/remove source operations (`addSource` / `removeSource` from `source-manager.ts`) with success/error `statusMessage` state for the settings step.                                                                                                                                                                     |
| `use-terminal-dimensions.ts`      | Reactive terminal `columns` / `rows` with an 80x24 non-TTY fallback; re-renders on resize. `WizardLayout` reads it for the mid-session size guard — see "Terminal-size gates" under Scrolling.                                                                                                                           |
| `use-text-input.ts`               | Text input state with backspace/delete handling and printable-ASCII (char codes 32-126) filtering.                                                                                                                                                                                                                       |

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

Long lists that exceed terminal height are handled by three scroll hooks (there is no `use-virtual-scroll.ts`):

| Hook                    | For                                     | Consumers                                                     | Renders an affordance? |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `use-section-scroll.ts` | Variable-height sections (pixel offset) | `category-grid.tsx`, `source-grid.tsx`                        | `source-grid` only     |
| `use-row-scroll.ts`     | Uniform 1-line rows (row offset)        | `step-agents.tsx`, `checkbox-grid.tsx`, `stack-selection.tsx` | no consumer does       |
| `use-panel-scroll.ts`   | One opaque subtree, `↑`/`↓` only        | `summary-panel.tsx`                                           | yes                    |

`summary-panel.tsx` uses `use-panel-scroll.ts` rather than either grid hook because it scrolls one opaque `SkillAgentSummary` subtree with no focus to follow and no addressable sections. It replaced the hand-rolled `scrollOffset` + `useMeasuredHeight()` block that `info-panel.tsx` and `step-confirm.tsx` each carried a verbatim copy of.

### No affordance on the grid steps — a decision, not a gap

`ScrollAffordance` is rendered by exactly two components: `source-grid.tsx` and `summary-panel.tsx`. The **Skills (build)**, **Domains**, **Agents** and **Stack** views clip silently, and that is the owner's decision: on a grid that dense a half-cut card is self-evidently "there is more", so a counted hint would be noise — and it would cost the viewport a row to say what the clipped card already says.

The two views reach that state by different routes, which matters when reading the code:

- `category-grid.tsx` calls `useSectionScroll`, which **does** compute `hiddenAbove` / `hiddenBelow`, and destructures only `setSectionRef` / `scrollEnabled` / `scrollTopPx`. The discard is deliberate and is commented at the call site.
- Domains (`checkbox-grid.tsx`), Agents (`step-agents.tsx`) and Stack (`stack-selection.tsx`) call `useRowScroll`, which **never computes** the counts — so there is nothing to discard. The absence is in the hook's interface, documented in its JSDoc.

Do not add an affordance to these views on the strength of the counts merely being available. Adding one is a product change.

**This narrows D-266, it does not close it.** That ticket bundles two things: the silent clipping above (accepted) and the genuine bleed below `MIN_VIEWPORT_ROWS`, where `scrollEnabled` goes false and the view grows past its border instead of clipping. The second half is still a defect. The `WizardLayout` size guard below mitigates the worst of it — the wizard now refuses to draw at all under `MIN_TERMINAL_SIZE.ROWS = 20` rather than shredding — but heights between 20 and the per-view `minViewportRows` floor are untouched.

### Terminal-size gates

Two gates share one constant and one message, and both are needed:

| Gate                               | Where                                                          | Catches                                       |
| ---------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `BaseCommand.ensureTerminalSize()` | `src/cli/base-command.ts`, in `init()` — before Ink mounts     | launching in a terminal that is already small |
| `WizardLayout`'s guard             | `src/cli/components/wizard/wizard-layout.tsx`, after its hooks | the terminal shrinking mid-session            |

Both read `isTerminalLargeEnough()` and print `formatTerminalTooSmallMessage()` from `src/cli/utils/terminal.ts`, which are the single source of the `Terminal too narrow (need 80). / too short (need 20). Please resize.` wording. Two wordings would leave one gate unassertable — the E2E constants `STEP_TEXT.TOO_NARROW` / `TOO_SHORT` / `RESIZE_PROMPT` key off this text.

The React guard **replaces** `children` rather than overlaying them. An overlay does not work: Ink lays a still-mounted tree out at the small size regardless of what is drawn on top, so the squeezed content keeps bleeding underneath. Consequences worth knowing: wizard state lives in the zustand store and survives the swap, but component-local state (grid focus row/col, scroll offsets) resets, and the step's own `useInput` is unmounted while the prompt shows — so keys the step owns are inert until the terminal grows back. No machinery preserves any of that; a deliberate resize is allowed to cost it.

Shared constants live in `SCROLL_VIEWPORT` in `src/cli/consts.ts`:

| Constant                  | Value | Purpose                                    |
| ------------------------- | ----- | ------------------------------------------ |
| `SCROLL_INDICATOR_HEIGHT` | 1     | Height of scroll indicator line            |
| `CATEGORY_NAME_LINES`     | 2     | Lines per category name row (incl. margin) |
| `CATEGORY_MARGIN_LINES`   | 1     | Margin between category sections           |
| `MIN_VIEWPORT_ROWS`       | 5     | Minimum rows before enabling scroll        |

The minimum terminal size is **not** in this block. It is `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`), a separate export read by the two gates in "Terminal-size gates" above — the only size gate there is. `SCROLL_VIEWPORT` previously carried a `MIN_TERMINAL_HEIGHT: 15` that nothing imported while the real gate used local magic numbers; the dead key is gone and must not come back.

### Section Scroll (`use-section-scroll.ts`)

Pixel-offset scroll for views with variable-height sections.

```typescript
type UseSectionScrollOptions = {
  sectionCount: number;
  focusedIndex: number;
  availableHeight: number;
  /** Default SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS; lowered by views that must clip rather than bleed. */
  minViewportRows?: number;
};

type UseSectionScrollResult = {
  setSectionRef: (index: number, el: DOMElement | null) => void;
  setViewportRef: (el: DOMElement | null) => void;
  setContentRef: (el: DOMElement | null) => void;
  scrollEnabled: boolean;
  scrollTopPx: number;
  hiddenAbove: number;
  hiddenBelow: number;
  scrollBy: (deltaRows: number) => void;
};
```

**Three refs, three jobs (D-271).** `setSectionRef` measures each section (drives focus-following). `setViewportRef` goes on the clipping box, so overflow counts exclude header and affordance chrome — both siblings of it — rather than assuming the viewport equals `availableHeight`. `setContentRef` goes on the scrolled content box, so overflow measures the WHOLE rendered subtree, section-group margins and labels included, not just the sum of per-section heights. A consumer that attaches no content ref (`category-grid.tsx`) falls back to that per-section sum; a consumer that attaches no viewport ref falls back to `availableHeight`.

**Focus scroll and overscroll are separate offsets.** `focusScrollPx` follows the focused section; `overscrollPx` is user travel BEYOND it, added by `scrollBy` and clamped to `maxScroll - focusScroll`. Overscroll resets to `0` on any `focusedIndex` change, so the viewport snaps back to following focus. This split is what makes a trailing row that can never take focus reachable — see "Inert rows are reachable by SCROLLING" under SourceGrid Row States.

`contentBoxHeight` is kept monotonic (tallest reading wins) for the Yoga reason described under SummaryPanel, and is reset to `0` whenever `sectionCount` changes, since a new row set invalidates the reading.

**Clipping is unconditional; the size gate applies only to the affordance (D-263).** `scrollEnabled` is `availableHeight > 0 && availableHeight >= minViewportRows`. `source-grid.tsx` passes `SOURCE_GRID_MIN_VIEWPORT_ROWS = 1` so the Sources step clips-and-signals rather than bleeding even at the very short viewports it renders at (it is squeezed by the tab bar, dropdown card and footer) — a single clipped row plus the affordance beats a bled grid. Views that fall back to a flex layout keep the default `MIN_VIEWPORT_ROWS = 5`.

**The Sources column header is pinned OUTSIDE the clipping viewport**, so it never scrolls away — but it costs a row, as the affordance does. Below `SOURCE_GRID_HEADER_MIN_HEIGHT = 4` (`showPinnedHeader = !scrollEnabled || availableHeight >= 4`) there is no room for the header AND a readable pair of content rows, so the column labels yield to content; every row still shows its own source cells.

### Row Scroll (`use-row-scroll.ts`)

Row-based scroll for views with uniform 1-line rows. Delegates the offset computation to the pure `computeRowScrollTop(focusedRow, currentScrollTop, viewportHeight)` exported from `use-section-scroll.ts`.
