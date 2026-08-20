---
type: anti-pattern
severity: medium
affected_files:
  - packages/ui/src/components/lattice.tsx
  - apps/editor/src/features/configure/components/add-skill-dialog.tsx
date: 2026-08-08
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-visible
status: open
---

## What Was Wrong

The rule — **if a component styles something as clickable, that thing must be a
`<button>`, or must carry `role`, `tabIndex` and a key handler** — was
established the day before, against two components in this package whose
affordance existed in CSS and not in the accessibility tree: `CommandBlock` with
`copyable` (a `cursor-pointer` `<div>` that was the install dialog's only
action) and `Segmented` (a `role="group"` of independent `aria-pressed` toggles
for a row its own comment called mutually exclusive). Both were fixed — the
first into a `role="button"` answering Enter and Space, the second into a
`radiogroup` of `role="radio"` segments with a roving tabindex and arrow keys.
Writing that rule into `packages/ui/CLAUDE.md` under EDITOR-25 meant reading the
package against it, and `Lattice` breaks it in the same way both of those did.

`LatticeRow` and `LatticeCell` are `<div>`s. `latticeRowVariants` opens with
`relative -mt-px flex cursor-pointer items-start gap-3 …` and
`latticeCellVariants` carries an `interactive` variant. Neither renders a
`role`, a `tabIndex` or a key handler, and neither accepts one as anything but a
pass-through nobody uses.

The add-skill dialog is the live case:

```tsx
<LatticeRow key={id} selected={isStaged} onClick={() => toggleStage(entry)}>
```

That row is the only way to stage a skill. Staging is what the dialog exists
for — the confirm button acts on whatever the rows collected — so the dialog's
central action is a `<div onClick>` with a hand cursor. It cannot be tabbed to
and it is announced as nothing.

The E2E suite already documents the consequence without naming it.
`e2e/README.md`'s first convention is "Locate by role … so a class rename cannot
break the suite and the locators double as a check that the page is navigable",
and `AddSkillDialog.result()` is the one place that cannot follow it:

```ts
return this.root.locator('[data-slot="lattice-row"]').filter({ hasText: name });
```

A CSS attribute selector, because there is no role to ask for. The convention's
own second clause is the point — the locator that has to fall back is telling
you the page is not navigable at that spot.

The pattern in the rest of the package makes the omission look deliberate when
it is not: the row's own inner `✕` is a real `<button>`, and `MatrixGrid` next
door makes every cell one. The `Lattice` family is where the convention stopped
being applied, not where it was decided against.

## Fix Applied

None — reported, not fixed. EDITOR-25 was scoped to the focus treatment on two
named components; this is a different rule on a third, and changing what element
`LatticeRow` renders moves a nested `<button>` inside a `<button>` in the
add-skill dialog, which is a real design question rather than a mechanical
substitution.

## Proposed Standard

None new — this is the existing rule, now written down in
`packages/ui/CLAUDE.md`, "Semantics live in the tree":

> **If it is styled as clickable it is a `<button>`, or it carries `role`,
> `tabIndex` and a key handler.**

What this finding adds is that the rule needs a sweep rather than a mention. It
has now been broken three times by three different authors in one package, each
time discovered by someone reading for something else. The check is one grep —
`cursor-pointer` on a component that renders a `div` or `span` — and it would
have found `CommandBlock`, `Segmented` and `Lattice` in a single pass.

The nesting question `LatticeRow` raises is worth deciding once and writing into
the same section: a row whose whole surface is the click target, holding its own
smaller controls, is a known pattern with a known answer, and the package now
has two of them (`LatticeRow` with its `✕`, and the stage badge that is a
`<span>` precisely because the row around it is already clickable).
