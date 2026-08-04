## Output Format

<output_format>
Provide your implementation in this structure:

<summary>
**Task:** [Brief description of what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Lines | What Was Learned             |
| --------------- | ----- | ---------------------------- |
| [/path/to/file] | [X-Y] | [Pattern/utility discovered] |

**Patterns Identified:**

- **Component structure:** [How components are organized - from /path:lines]
- **State approach:** [How state is managed - from /path:lines]
- **Styling method:** [How styling is applied - from /path:lines]

**Existing Code Reused:**

- [Utility/component] from [/path] - [Why reused instead of creating new]
  </investigation>

<approach>
**Summary:** [1-2 sentences describing the implementation approach]

**Files:**

| File            | Action             | Purpose               |
| --------------- | ------------------ | --------------------- |
| [/path/to/file] | [created/modified] | [What change and why] |

**Key Decisions:**

- [Decision]: [Rationale based on existing patterns from /path:lines]
  </approach>

<implementation>

### [filename.tsx]

**Location:** `/absolute/path/to/file.tsx`
**Changes:** [Brief description - e.g., "New component" or "Added prop handling"]

```tsx
// [Description of this code block]
[Your implementation code]
```

**Design Notes:**

- [Why this approach was chosen]
- [How it matches existing patterns]

### [filename2.styles] (if applicable)

[Same structure...]

</implementation>

<tests>

### [filename.test.tsx]

**Location:** `/absolute/path/to/file.test.tsx`

```tsx
[Test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Edge cases: [scenarios]
- [x] Error handling: [scenarios]

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                                       |
| -------------------- | --------- | ---------------------------------------------- |
| [From specification] | PASS/FAIL | [How verified - test name, manual check, etc.] |

## Universal Quality Checks

**Accessibility:**

- [ ] Semantic HTML elements used (not div soup)
- [ ] Interactive elements keyboard accessible
- [ ] Focus management handled (if applicable)
- [ ] ARIA attributes present where needed
- [ ] Color not sole means of conveying information

**Performance:**

- [ ] No unnecessary re-renders introduced
- [ ] Large lists virtualized (if applicable)
- [ ] Images optimized/lazy-loaded (if applicable)
- [ ] Heavy computations memoized (if applicable)

**Error Handling:**

- [ ] Loading states handled
- [ ] Error states handled with user feedback
- [ ] Empty states handled (if applicable)
- [ ] Form validation feedback (if applicable)

**Code Quality:**

- [ ] No magic numbers (named constants used)
- [ ] No `any` types without justification
- [ ] Follows existing naming conventions
- [ ] Follows existing file/folder structure
- [ ] No hardcoded strings (uses i18n if available)

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass (if added)
- [ ] Build succeeds
- [ ] No type errors
- [ ] No lint errors

</verification>

<notes>

## For Reviewer

- [Areas to focus review on]
- [Decisions that may need discussion]
- [Alternative approaches considered]

## Scope Control

**Added only what was specified:**

- [Feature implemented as requested]

**Did NOT add:**

- [Unrequested feature avoided - why it was tempting but wrong]

## Known Limitations

- [Any scope reductions from spec]
- [Technical debt incurred and why]

## Dependencies

- [New packages added: none / list with justification]
- [Breaking changes: none / description]

</notes>

</output_format>

---

## Section Guidelines

### When to Include Each Section

| Section            | When Required                     |
| ------------------ | --------------------------------- |
| `<summary>`        | Always                            |
| `<investigation>`  | Always - proves research was done |
| `<approach>`       | Always - shows planning           |
| `<implementation>` | Always - the actual code          |
| `<tests>`          | When tests are part of the task   |
| `<verification>`   | Always - proves completion        |
| `<notes>`          | When there's context for reviewer |

### Accessibility Checks (Framework-Agnostic)

These apply regardless of React, Vue, Svelte, or any framework:

- **Semantic HTML:** Use `<button>` not `<div onClick>`, `<nav>` not `<div class="nav">`
- **Keyboard access:** Tab order logical, Enter/Space activate controls
- **Focus visible:** Focus indicators present and visible
- **ARIA:** Only when HTML semantics insufficient

### Performance Checks (Framework-Agnostic)

- **Re-renders:** Don't cause parent re-renders unnecessarily
- **Virtualization:** Lists over ~100 items should virtualize
- **Lazy loading:** Images below fold, heavy components
- **Memoization:** Only for measured bottlenecks

### Error Handling States (Framework-Agnostic)

Every async operation needs:

1. **Loading:** User knows something is happening
2. **Error:** User knows what went wrong + can retry
3. **Empty:** User knows there's no data (not broken)
4. **Success:** User sees the result

### Code Quality (Framework-Agnostic)

- **Constants:** `const MAX_ITEMS = 10` not `items.slice(0, 10)`
- **Types:** Explicit interfaces, no implicit any
- **Naming:** Match codebase conventions exactly
- **Structure:** Match existing file organization

## Example Implementation Output

Here's what a complete, high-quality frontend developer output looks like:

````markdown
# Implementation: Add Dark Mode Toggle to Settings Panel

## Investigation Notes

**Files Read:**

- src/components/SettingsPanel.tsx:67-134 - Settings use controlled inputs with Zustand store
- src/styles/theme.scss:12-45 - Theme tokens use CSS custom properties with cascade layers
- src/stores/ThemeStore.ts:1-89 - Store uses persist middleware for localStorage

**Patterns Found:**

- Settings items use Switch component with label prop (SettingsPanel.tsx:112)
- Zustand with persist middleware, actions defined inline (ThemeStore.ts:45-67)
- CSS custom properties scoped to `[data-theme]` selector (theme.scss:12)

**Existing Code Reused:**

- Switch component from `@repo/ui/switch` - handles accessibility and styling
- useThemeStore hook - consistent with other settings

## Implementation Plan

1. Add darkMode state and toggleDarkMode action to ThemeStore.ts
2. Create DarkModeToggle component following Switch pattern
3. Add toggle to SettingsPanel
4. Add dark mode color tokens to theme.scss
5. Apply data-theme attribute in App.tsx

## Changes Made

### 1. ThemeStore.ts (+12 lines)

Added to existing store:

```tsx
darkMode: false,
toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
```
````

### 2. dark-mode-toggle.tsx (new file, 18 lines)

```tsx
import { Switch } from "@repo/ui/switch";
import { useThemeStore } from "../stores/ThemeStore";

export function DarkModeToggle({ className }: { className?: string }) {
  const { darkMode, toggleDarkMode } = useThemeStore();
  return (
    <Switch label="Dark mode" checked={darkMode} onChange={toggleDarkMode} className={className} />
  );
}
```

### 3. theme.scss (+8 lines)

```scss
[data-theme="dark"] {
  --color-background: var(--gray-900);
  --color-surface: var(--gray-800);
  --color-text-primary: var(--gray-50);
  --color-border: var(--gray-700);
}
```

### 4. SettingsPanel.tsx (+2 lines)

- Imported DarkModeToggle
- Added `<DarkModeToggle />` to settings list

### 5. App.tsx (+3 lines)

- Applied `data-theme={darkMode ? "dark" : "light"}` to root

## Verification

**Success Criteria:**

- [x] Toggle appears in settings panel (visually verified)
- [x] Clicking toggle changes theme (tested)
- [x] Theme persists across reload (localStorage verified)

**Quality Checks:**

- [x] Keyboard accessible (Switch handles this)
- [x] No new dependencies
- [x] Follows existing patterns

**Build Status:**

- [x] `bun test` passes
- [x] `bun build` succeeds
- [x] No type/lint errors

## Summary

**Files:** 5 changed (+43 lines)
**Scope:** Added only toggle + persistence. Did NOT add system preference detection or transition animations (not in spec).
**For Reviewer:** Verify theme.scss color choices match design system.

```

```
