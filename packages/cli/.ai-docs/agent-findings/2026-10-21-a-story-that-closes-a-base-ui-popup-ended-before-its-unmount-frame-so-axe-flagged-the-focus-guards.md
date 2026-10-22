---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/menu.stories.tsx
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  Both menu stories that close the popup now end once it has unmounted. The rule proposed for the
  ui package's CLAUDE.md is not written.
---

## What Was Wrong

`menu.stories.tsx` › `PickingReportsTheChoice` sometimes failed axe with `aria-hidden-focus` on the
popup's two `span[data-type="inside"][data-base-ui-focus-guard]`. It failed 2 of 13 runs in the
round-2 gate and 0 of 20 on an idle machine. Here it failed once, on a cold run (the first after
Vite re-optimised dependencies).

Each step of the cause was measured:

- Base UI unmounts a closed popup only after an animation frame. `useAnimationsFinished`
  (`@base-ui/react/internals/useAnimationsFinished.js`) calls `frame.request(exec)` before it reads
  `getAnimations()`.
- Until that frame the popup is closing. A probe that ran axe itself straight after the click found
  both guards still `tabindex="0"`, the positioner not inert and the internal backdrop gone, and
  `aria-hidden-focus` reported 1 violation. Run while the menu was open, the same probe reported 0,
  because the backdrop makes axe treat the popup as modal.
- In a test environment Storybook's `runStory` finishes running CSS animations and then calls
  `afterEach` without waiting for a frame. The a11y addon's `afterEach` awaits `import("axe-core")`
  and then runs axe. On an idle machine the frame lands first. Under load it can land after.

So a story whose `play` ends on the click that closes a popup races its own teardown. An exit
animation does not widen the race: Storybook finishes it, which unmounts the popup before axe
starts. A variant with a 1.5s exit transition passed every run.

Reproduction: starve the frame. Add a temporary story that spreads the story under test and has a
`beforeEach` that replaces `window.requestAnimationFrame` with one delayed by 250ms and returns the
restore. Run it in `packages/ui` with
`npx vitest run --project storybook --maxWorkers=2 src/components/menu.stories.tsx -t Probe`. On the
original bodies of both the pick and keyboard-pick stories, it failed 3 of 3 runs with the gate's
exact error. On the fixed bodies it passed 3 of 3.

Census: every story in `packages/ui/src/components/*.stories.tsx` that closes a Base UI popup (menu,
dialog, alert-dialog), read by hand. Two ended without waiting, `PickingReportsTheChoice` and
`TheKeyboardCanPick`. The rest (`PickingClosesTheMenu`, both `EscapeCloses`, `CloseGlyphCloses`,
`CancelCloses`) already end on the unmount, because the unmount is what they assert.

## Fix Applied

Both stories now finish with a `waitFor` until `queryByRole("menu")` is null, placed after their own
claim.

## Proposed Standard

Add to `packages/ui/CLAUDE.md` › Gates, under "Axe gates every story": a story whose `play` closes a
popup ends once the popup has unmounted, with a `waitFor` until `queryByRole(...)` is null. Axe runs
straight after `play`, and Base UI unmounts a frame after closing. This does not conflict with "one
claim per story". The wait only settles the DOM, and the claim is still the assertion before it.

No gate can see a story that ends early. The starved-frame probe above is the only instrument. One
alternative was not tried: `globalThis.BASE_UI_ANIMATIONS_DISABLED` makes `useAnimationsFinished`
unmount at once, which would remove the frame for every story.
