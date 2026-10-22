---
type: missing-standard
severity: low
affected_files:
  - packages/ui/src/components/toast.tsx
  - packages/ui/src/components/toast.stories.tsx
  - apps/editor/e2e/pages/toasts.ts
  - apps/editor/e2e/specs/a11y.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
  - packages/ui/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: web
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Two facts about Base UI's toast (`@base-ui/react` 1.6.0), neither visible from its types, each of
which made a first-draft spec of the editor's new toast wrong.

**The `✕` is out of the accessibility tree at rest.** `ToastClose` renders
`'aria-hidden': !expanded && !hasFocus` (`node_modules/@base-ui/react/toast/close/ToastClose.js`),
where `expanded` is the viewport being hovered or focused. So the polite live region reads the
message alone, which is the point. The cost is that
`getByRole("button", { name: "Close" })` finds nothing until something hovers or focuses the
toasts. Measured: the e2e spec "closes on its ✕" timed out with the call log stopping at
`waiting for getByRole('region', { name: 'Notifications' }).getByRole('dialog', …).getByRole('button', { name: 'Close' })`,
and the stories `CloseGlyphCloses` and `CloseGlyphFocusDrawsTheRing` failed on the same query,
while the toast was on screen. The page object's own snapshot showed
`<button … aria-hidden="true" … aria-label="Close">✕</button>`.

**A full-page axe audit outlasts the toast.** A toast closes after 5 s (`timeout` default 5000).
`apps/editor/e2e/specs/a11y.spec.ts`'s audit of the assembled page took 18.6 s for the toast case
(`1 passed (18.6s)`), so an audit started with a toast on screen finishes over a page the toast has
already left, and passes whether or not the toast is accessible. Nothing in that spec could tell.

## Fix Applied

- `apps/editor/e2e/pages/toasts.ts`: `close(message)` hovers the toast, then presses the `✕`.
  `closeButton` carries a comment saying why a bare role query misses it.
- `toast.stories.tsx`: `CloseGlyphHiddenUntilHovered` pins the hidden-until-hovered behaviour with
  its control (absent at rest, present after `userEvent.hover`), and the two `✕` stories hover
  first. The resting state is audited by Storybook's axe gate, where the stories raise the toast
  with `timeout: 0`.
- `a11y.spec.ts` "with a toast naming the sub-agents a selection switched on" hovers the toast before
  the audit, which pauses its timer, and counts it again after the audit. That closing count is what
  shows the audit ran with the toast on screen.

## Proposed Standard

In `apps/editor/e2e/README.md` -> "Conventions", beside "Prove a negative's channel": **an audit or
assertion about something that times out holds it for the whole check, and re-asserts its presence
after**, since a slower check passes over its absence. And: **a toast's `✕` is pressed through
`Toasts.close`**, because Base UI keeps it out of the accessibility tree until the toasts are
hovered or focused. Neither conflicts with a CLAUDE.md rule. The README's "assert on the
accessibility tree" stays right; this records why one control needs a hover before that tree holds
it.
