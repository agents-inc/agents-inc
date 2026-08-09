---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/command-block.tsx
  - packages/ui/src/components/segmented.tsx
  - apps/editor/src/features/configure/components/install-dialog.tsx
date: 2026-08-07
reporting_agent: web-tester
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: |
  EDITOR-24 (2026-08-08). `copyable` now carries the semantics as well as the look —
  `role="button"`, `tabIndex={0}` and Enter/Space routed through the caller's own
  `onClick` — and `Segmented` is a `radiogroup` of `role="radio"` segments with a
  roving tabindex and arrow keys, selection following focus. Six play functions in
  `command-block.stories.tsx` and `segmented.stories.tsx` pin both and were red
  against the old components. The install dialog's hand-rolled `role`/`tabIndex`/
  `onKeyDown` were deleted, so the affordance is the component's again.
  The Proposed Standard below is NOT closed by this: `packages/ui` still has no
  component-authoring doc, and that gap is now carried by
  2026-08-08-one-component-marks-focus-and-nothing-says-it-is-the-rule.md.
---

## What Was Wrong

Writing interaction tests for the design system surfaced two components whose
affordance exists in CSS but not in the accessibility tree. Both were found by
trying to write the obvious keyboard test and discovering there was no keyboard
path to test.

**`CommandBlock` with `copyable` is a clickable `<div>`.** The prop's own
comment says it exists so "the affordance cannot drift between the blocks that
have it" — but what it actually adds is `cursor-pointer` and a hover border:

```tsx
copyable && "cursor-pointer hover:border-rule";
```

There is no `role`, no `tabIndex`, no key handler. The element the user is meant
to click is not focusable, is not announced as actionable, and cannot be
operated from the keyboard at all. This is the install dialog's central
affordance — the dialog deliberately ships no Install button precisely because
copying the command _is_ the action — so the one thing that dialog exists to do
is pointer-only.

Note also that `copyable` does not copy. The clipboard write is the caller's
`onClick`, which means the prop guarantees the _look_ of a copy affordance
while its behaviour is unenforced at every call site — the exact drift the
comment says the prop prevents.

**`Segmented` is a `role="group"` of independent toggle buttons.** Each
`SegmentedItem` is a `Chip`, which renders `<button aria-pressed>`. For a row
the component's own comment calls "mutually-exclusive", that model has two
consequences: every segment is a separate tab stop, so a 2-segment row costs two
tabs and a 5-segment row costs five; and the mutual exclusivity is communicated
nowhere — a screen reader hears several independent toggle buttons, one of which
happens to be pressed, rather than one choice with several options.

There is no arrow-key handling anywhere in the component. The obvious test —
"arrow keys move the active segment" — has nothing to assert against.

By contrast `MatrixGrid`, which sits in the same panel, gets this right: every
cell is a real `<button>` with an explicit `aria-label`, so it is focusable,
announced and operable by Enter/Space with no extra code. That component is the
in-repo proof that the pattern is available and cheap.

## Fix Applied

Nothing at the time — EDITOR-01 was explicitly scoped not to modify the
components, and both of these are behaviour changes rather than test changes.
The tests written then recorded the current contract honestly rather than
papering over it: `CommandBlock`'s play function asserted that a click reaches
the caller's handler (the real contract), and `Segmented`'s asserted that a click
moves `aria-pressed` (the only signal a screen reader then got). Both were
rewritten when the components were fixed, which is the correct direction of
dependency.

Fixed under EDITOR-24 on 2026-08-08:

- **`CommandBlock`** — `copyable` adds `role="button"`, `tabIndex={0}` and a key
  handler that answers Enter and Space by dispatching a real click, so the
  keyboard reaches the caller's `onClick` rather than a second handler that could
  drift from it. The prop still buys the affordance rather than the copying; what
  changed is that the affordance is now real. The install dialog, which had grown
  its own `role`/`tabIndex`/`onKeyDown` at the call site, hands all three back.
- **`Segmented`** — `role="radiogroup"` holding `role="radio"` segments with
  `aria-checked`, a roving tabindex (one tab stop for the row) and arrow keys
  that move the choice and wrap, selection following focus. The arrow move goes
  through the segment's own click, so the caller's `onClick` is still the only
  place a choice is made and no call site changed. Both call sites hold their row
  in a single store field (`entry.install`, `entry.scope`), which is what makes
  the exclusive shape the true one rather than a nicer-sounding one.
- Both focusable elements carry the design language's own focus marker,
  `focus-visible:ring-1 focus-visible:ring-ring`, copied from `Button`.

Six play functions cover it — Tab reaches the block, Enter fires the handler, the
row announces one exclusive choice, only the active segment is a tab stop, arrows
move the choice, and a click still does — plus one editor E2E test that the
install dialog's command copies from the keyboard. All seven were red first.

## Proposed Standard

> **If a component styles something as clickable, that thing must be a
> `<button>` — or must carry `role`, `tabIndex` and a key handler.**
> `cursor-pointer` is not an affordance; it is a picture of one. A pointer-only
> control is invisible to keyboard users, to screen readers and to
> `getByRole`-based tests, which is why this class of defect survives both code
> review and an E2E suite that clicks everything.

For the exclusive-choice case specifically, the rule has a named pattern:

> **A row of mutually-exclusive options is a `radiogroup` of `role="radio"`
> items with roving tabindex, not a group of independent `aria-pressed`
> toggles.** The distinction is not pedantry — it changes the number of tab
> stops and it is the only thing that tells assistive technology the options are
> exclusive.

Where it should live: `packages/ui` has no component-authoring standard at all
today, which is the actual root cause — the convention is undocumented rather
than broken. A short `packages/ui/CLAUDE.md` carrying these two rules plus the
existing house conventions (shadcn output is overwritten by `shadcn add`, cva
variants exported beside the component, `data-slot` on every root) would give
the next component somewhere to inherit from. `MatrixGrid` is the worked example
to point at.
