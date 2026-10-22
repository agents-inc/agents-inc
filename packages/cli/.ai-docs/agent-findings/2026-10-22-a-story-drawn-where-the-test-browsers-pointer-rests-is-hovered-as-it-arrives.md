---
type: missing-standard
severity: medium
affected_files:
  - packages/ui/src/components/toast.stories.tsx
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  Landed: the toast stories draw the toast off the corner. Open: the rule in packages/ui/CLAUDE.md
  -> "Gates" that a story whose claim depends on not being hovered draws its subject off the corner.
---

## What Was Wrong

The `storybook` Vitest project renders each story without Storybook's `layout`. The preview applies
it (`WebView.applyLayout` adds `sb-main-centered`), and the Vitest runner does not use the preview,
so every story draws at the top-left corner of the test page. Chromium's pointer rests at client
(0,0) there, and when something is drawn under it Chromium sends trusted `pointerover`,
`mouseover` and `mouseenter` events at (0,0). A story drawn at the corner is hovered as it arrives.

For the toast that changes behaviour, not only colour. Base UI's toast viewport sets `hovering` from
`onMouseEnter` and `onMouseMove` (`toast/viewport/ToastViewport.mjs`), `expanded` is
`hovering || focused` (`toast/store.mjs`), and `ToastClose` renders
`aria-hidden={!expanded && !hasFocus}`. So `CloseGlyphHiddenUntilHovered`'s first claim, that the
`✕` is absent from the accessibility tree at rest, depended on whether the pointer's event landed
before the assertion. It received `<button aria-hidden="false" aria-label="Close" …>`. The gate
counted 6 of 7 full-suite runs red.

Measured, with a temporary capture-phase listener recording trusted events inside
`[data-slot=toast-viewport]` and asserted empty at the end of that story:

- Before the fix, the ledger was red on 4 of 4 full `--project storybook` runs (`mouseover toast`,
  `mouseenter toast-viewport`, `mouseenter toast`, repeated once per story mount). The rest-state
  assertion itself failed on 2 of 3, because it loses only when the event comes first. Failing runs
  put the toast at `{"x":0,"y":0}` in a 1200×900 page and every event at client 0,0.
- The toast finding's "the resting state is audited by Storybook's axe gate"
  (`2026-10-22-a-toasts-close-button-is-out-of-the-accessibility-tree-until-hovered-and-an-axe-audit-outlasts-the-toast`)
  held on the same terms: axe audited whichever state the pointer had left.

## Fix Applied

`ToastOnScreen` in `toast.stories.tsx` draws the `Toaster` inside a `p-6` wrapper, off the corner,
with a comment saying why. After the fix the ledger was empty on 5 of 5 runs, and `bun run test` in
`packages/ui` was green 6 of 6 headless and 3 of 3 at 120 columns. The ledger was removed.

Census of the class (behaviour, not CSS, that reacts to hover), over the components rather than the
stories:
`grep -rln "onMouseEnter\|onMouseMove\|onPointerEnter\|onMouseOver\|openOnHover\|Tooltip\|PreviewCard\|ToastPrimitive\|NavigationMenu" packages/ui/src/components --include='*.tsx' | grep -v stories`
returns `toast.tsx` alone. `menu.stories.tsx` also draws its trigger under the resting pointer, but
a Base UI menu does not open on hover and its popup is drawn below the trigger, so nothing it
asserts depends on the pointer.

**What would catch a recurrence:** nothing general. The rest-state assertion catches it for the
toast, and only when the pointer's event lands first.

## Proposed Standard

`packages/ui/CLAUDE.md` -> "Gates": "Stories run in the test browser with no `layout`, at the
top-left corner, where its pointer rests and hovers whatever is drawn there on arrival. A story whose
claim depends on not being hovered draws its subject off the corner." No conflict with a
`CLAUDE.md` rule.
