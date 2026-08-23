# CLI-734: Add YOLO Mode Toggle to Build Step

**Status:** Ready for Dev (plan drafted, open questions below)
**Scope:** ~65 LOC across 11 files + ~13 new tests

## Summary

Add a `Y` footer hotkey that flips `yoloMode` on the wizard store. While active, **all skill-relationship constraints are bypassed** in the build step — `conflictsWith`, `requires`, `discourages`, `compatibleWith` framework gating, and single-select (`exclusive`) category radios — so users can pick any combination freely.

Visual feedback follows the existing `filterIncompatible` precedent: the footer `DefinitionItem` flips to `CLI_COLORS.PRIMARY` when active. No new UI patterns introduced.

## Open questions (resolve before implementation)

1. **YOLO-off behavior** when the user has already picked conflicting skills:
   - (a) Leave selections, surface non-blocking warnings _(recommended)_
   - (b) Auto-deselect to restore consistency
   - (c) Block the toggle-off until conflicts are resolved
2. **Hotkey letter** — `Y` is unused. Confirm OK?
3. **Bypass `compatibleWith` framework gating too?** TODO says "all constraints" — reading that as yes.
4. **Persistence** — persist across wizard steps (like `filterIncompatible`) or reset on leaving `step=build`? Recommended: persist.
5. **Confirm-step warning banner** — show a warning if the final selection contains conflicts/unmet requires? Not in the original TODO.
6. **Visual indicator** — footer highlight only _(recommended, matches precedent)_ or add a header badge too?
7. **Downstream safety** — trace `compile.ts` / stack resolution first to confirm they tolerate a category with two "exclusive" selections (required if option 1a is picked).

## Non-goals / guardrails

- YOLO **must not** bypass the project-scope guard on globally-installed skills (`toggleTechnology` lines 834–839 in `wizard-store.ts`). That's a scope boundary, not a matrix constraint.
- YOLO does not change compile output. If the user selects a conflicting set, the resulting plugins/agents are compiled as-selected.
- No changes to `filterIncompatible` behavior — the two modes are independent.

## Constraint enforcement map

All matrix-level constraints centralize in `matrix-resolver.ts`. Single-select radio enforcement lives in the store.

| File · function                                                                                 | Constraint                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `matrix-resolver.ts` · `isIncompatible` → `hasDirectConflict`                                   | `conflictsWith`                             |
| `matrix-resolver.ts` · `isIncompatible` → `hasUnsatisfiableRequires` + `isDepBlockedByConflict` | `requires` (transitive block)               |
| `matrix-resolver.ts` · `isIncompatible` → `isIncompatibleByFramework`                           | `compatibleWith` framework gating           |
| `matrix-resolver.ts` · `isDiscouraged` / `getDiscourageReason`                                  | `discourages`                               |
| `matrix-resolver.ts` · `hasUnmetRequirements`                                                   | `requires` (positive direction)             |
| `matrix-resolver.ts` · `validateExclusivity`                                                    | Exclusive category (warning path)           |
| `build-step-logic.ts` · `buildCategoriesForDomain`                                              | Forces `incompatible→normal` when exclusive |
| `wizard-store.ts` · `toggleTechnology` (lines 870–871)                                          | **Real** single-select radio enforcement    |
| `use-build-step-props.ts` · `onToggle`                                                          | Passes `cat.exclusive ?? true` into store   |

## Implementation plan

### 1. Store (`src/cli/stores/wizard-store.ts`)

- Add `yoloMode: boolean` field next to `filterIncompatible` (around line 293).
- Add `toggleYoloMode: () => set((state) => ({ yoloMode: !state.yoloMode }))` next to `toggleFilterIncompatible` (around line 438). Mirror the **simpler** `toggleShowLabels` pattern (line 927) — do _not_ prune selections on toggle unless Q1 answer is (b).
- Add `"yoloMode"` to the `WizardStateData` persisted-fields union (line 610).
- Initial value `yoloMode: false` in `createInitialState()` (line 642).
- In `toggleTechnology`, gate the exclusive-radio replacement on `!get().yoloMode`:
  ```ts
  if (exclusive && !get().yoloMode) {
    newSelections = isSelected ? [] : [technology]
  } else {
    newSelections = isSelected
      ? currentSelections.filter((t) => t !== technology)
      : [...currentSelections, technology]
  }
  ```

### 2. Matrix resolver (`src/cli/lib/matrix/matrix-resolver.ts`)

- Thread `yoloMode: boolean` through the public entry points: `isIncompatible`, `isDiscouraged`, `hasUnmetRequirements`, `getDiscourageReason`, `getIncompatibleReason`, `getUnmetRequirementsReason`, `getAvailableSkills`, `computeAdvisoryState`.
- Short-circuit at the top of each: `if (yoloMode) return false;` / `return undefined;` / `return { status: "normal" };`.
- **Do not** import the store here — keep the resolver pure. The flag is passed in from callers.

### 3. Build-step plumbing

- `src/cli/lib/wizard/build-step-logic.ts` · `buildCategoriesForDomain` and `getAvailableSkills` — accept `yoloMode` and forward to resolver calls.
- `src/cli/components/hooks/use-framework-filtering.ts` — read `yoloMode` from the store and pass into `buildCategoriesForDomain`.
- `src/cli/components/hooks/use-build-step-props.ts` — add `onToggleYolo = store.toggleYoloMode`.
- `src/cli/components/wizard/step-build.tsx` — new `onToggleYolo` prop, thread into `CategoryGrid`.
- `src/cli/components/wizard/category-grid.tsx` — new `onToggleYolo` prop, thread into `useCategoryGridInput`.
- `src/cli/components/hooks/use-category-grid-input.ts` — new `onToggleYolo?: () => void` option and `isHotkey(input, HOTKEY_YOLO)` branch (mirror the `HOTKEY_FILTER_INCOMPATIBLE` branch pattern exactly).

### 4. Hotkey registry (`src/cli/components/wizard/hotkeys.ts`)

```ts
export const HOTKEY_YOLO = { key: "y", label: "Y" } as const
```

### 5. Footer (`src/cli/components/wizard/wizard-layout.tsx`)

Add a new `DefinitionItem` beside `Filter incompatible` (around lines 180–221):

```tsx
<DefinitionItem
  label="YOLO"
  values={[HOTKEY_YOLO.label]}
  isVisible={store.step === "build"}
  isActive={store.yoloMode}
/>
```

## Tests

| File                                                | New cases                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/cli/lib/matrix/matrix-resolver.test.ts`        | YOLO bypasses conflicts / requires / discourages / framework (~8 cases)               |
| `src/cli/stores/wizard-store.test.ts`               | `toggleYoloMode` flips state; exclusive-radio bypass in `toggleTechnology` (~4 cases) |
| `src/cli/components/wizard/hotkeys.test.ts`         | `HOTKEY_YOLO` registered                                                              |
| `src/cli/lib/wizard/build-step-logic.test.ts`       | YOLO-on returns all skills as `normal` state                                          |
| `e2e/interactive/build-step-yolo.e2e.test.ts` (new) | Enable YOLO → pick React + Vue → reach confirm step without blockers                  |

## Scope estimate

| File                                                                  | Δ LOC   |
| --------------------------------------------------------------------- | ------- |
| `hotkeys.ts`                                                          | +2      |
| `wizard-store.ts` (field, action, persist, initial, exclusive bypass) | +11     |
| `matrix-resolver.ts` (thread + short-circuit × 8)                     | +25     |
| `build-step-logic.ts`                                                 | +5      |
| `use-framework-filtering.ts`                                          | +3      |
| `use-category-grid-input.ts`                                          | +5      |
| `use-build-step-props.ts`                                             | +2      |
| `step-build.tsx`                                                      | +4      |
| `category-grid.tsx`                                                   | +3      |
| `wizard-layout.tsx`                                                   | +6      |
| **Total**                                                             | **~66** |

## Edge cases to watch

- **Scope guard preserved:** YOLO must not bypass the project-scope block on globally-installed skills in `toggleTechnology` (lines 834–839).
- **Edit-flow reconciliation:** `installedSkillConfigs` baseline diff (lines 882–887) must still run under YOLO.
- **`filterIncompatible` + YOLO:** under YOLO every skill is "normal", so `filterIncompatible` becomes a no-op. That's acceptable — the user sees nothing is filtered because nothing is incompatible.
- **Confirm step:** if Q5 is "yes banner", add a warning when `validateSelection(..., { yoloMode: false })` reports conflicts at confirm time, regardless of current `yoloMode`.

## References

- `src/cli/lib/matrix/matrix-resolver.ts`
- `src/cli/lib/wizard/build-step-logic.ts`
- `src/cli/stores/wizard-store.ts`
- `src/cli/components/wizard/step-build.tsx`
- `src/cli/components/wizard/wizard-layout.tsx`
- `src/cli/components/wizard/category-grid.tsx`
- `src/cli/components/wizard/hotkeys.ts`
- `src/cli/components/hooks/use-category-grid-input.ts`
- `src/cli/components/hooks/use-build-step-props.ts`
