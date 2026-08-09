---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/filter-bar.tsx
  - apps/editor/src/features/configure/lib/use-pinned.ts
  - apps/editor/e2e/specs/skill-options.spec.ts
  - apps/editor/e2e/specs/sticky-bar.spec.ts
date: 2026-08-09
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  EDITOR-29. Owner ruling 2026-08-09: "remove the auto focus on sticky" — neither of the two
  mechanical fixes proposed below, but the grab itself. The `useEffect` and the now-dead
  `searchRef` are gone from `filter-bar.tsx`; sticking changes how the bar looks and never where
  the caret is. `sticky-bar.spec.ts` was rewritten to the ruling — "hands focus to the search
  input as it sticks" is now "takes no focus as it sticks", the once-per-stick test no longer
  opens by asserting the grab happened, and the inverse the finding asked for is pinned by "a Tab
  that sticks the bar keeps its focus", which walks the keyboard down the page and asserts the
  caret is still on a skill cell. That test was red before the removal (focus measured in the
  search `<input>`) and green after, unmodified. The KNOWN GAP is closed: the source link's own
  ring spec is written, and the two sibling ring specs no longer filter the grid to one skill,
  since the workaround existed only to dodge this.
---

## What Was Wrong

The filter bar takes focus into its own search field the moment it sticks:

```tsx
useEffect(() => {
  if (stuck) searchRef.current?.focus({ preventScroll: true });
}, [stuck]);
```

The comment beside it names the case it was designed for — "reaching the top is
the moment searching becomes the obvious thing to do" — and
`sticky-bar.spec.ts` pins both halves of that design, including the one the
author thought about: the grab fires once per stick rather than on every scroll
event, so a user who scrolls on and starts typing elsewhere keeps their caret.

The case nobody thought about is the reverse direction. **Focus can cause the
scroll.** Tabbing to a control below the fold makes the browser scroll it into
view; if that scroll crosses the pin threshold the bar sticks, the effect runs,
and focus is taken off the control the user was tabbing to and put in the search
field. The keyboard user is thrown back to the top of the page by the act of
moving down it, and it happens on the Tab that reveals anything the viewport was
not already showing.

Measured while writing EDITOR-27's focus-ring specs: tabbing from the Meta fold
to the source link at the foot of an open `•••` panel left `scrollY` at 694,
`data-bar-stuck` set, and `document.activeElement` as the search `<input>` —
drawing its own focus ring, in a field the user never asked for. The same
sequence on a grid filtered to one skill, where the page is too short to stick
the bar, leaves focus on the link.

It is invisible to every existing test for two reasons. `sticky-bar.spec.ts`
only ever scrolls with `window.scrollTo`, so nothing in it moves focus and then
watches what happens to it. And every other spec drives the app by clicking,
which never scrolls as a side effect of focus.

## Fix Applied

Reported first, fixed under EDITOR-29. The owner took neither branch offered
below: the ruling was to remove the grab, not to make it smarter about why
focus is where it is. The effect and the `searchRef` it was the only reader of
are gone, and the bar now moves focus never.

Red was measured before the removal and on the real dev server, not inferred:
tabbing from the add-skill button down into the grid stuck the bar at
`scrollY` 1176 with `document.activeElement` the search `<input>` and no skill
cell holding focus. The same walk after it leaves the caret on the control the
Tab reached — hand-run and screenshotted, with the bar a dark band at the top
and the ring on a cell's `global` badge mid-page.

What it cost EDITOR-27 has been paid back. The source link's focus-ring spec
exists now ("the source link draws a focus ring"), reaching the link by Tab
from the shut Meta fold, and the two sibling ring specs no longer call
`configure.search()` first — that filter was only ever there to keep the page
too short to stick the bar. All three passed five consecutive eight-worker
runs, and the meta-fold spec had failed one of the two eight-worker runs taken
before the removal, which is the flake this describes caught in the act.

## Proposed Standard

> **An effect that moves focus asks why focus is where it is.** A focus grab
> keyed on a scroll must not fire when the scroll was caused by focus moving —
> otherwise the feature that helps a pointer user helps itself to a keyboard
> user's caret.

Mechanically, the bar has the information: it can skip the grab when the
document already holds a focused element inside `main`, or key the grab on a
scroll event rather than on the derived `stuck` transition, so a programmatic
`scrollIntoView` is not mistaken for the user arriving at the top. Either fix
belongs in `filter-bar.tsx` beside the effect and wants a line in
`sticky-bar.spec.ts` asserting the inverse of what that file asserts today: a
Tab that scrolls keeps its focus.

Worth noting for whoever takes it: this is the second defect in this app that
only exists for keyboard users and that no automated check could see —
`2026-08-08-the-focus-rule-is-written-and-five-controls-do-not-follow-it.md`
was the first. Both were found by someone writing a test that moved focus with
the keyboard rather than with `focus()`. That is the technique, and it is worth
naming somewhere more permanent than two findings.
