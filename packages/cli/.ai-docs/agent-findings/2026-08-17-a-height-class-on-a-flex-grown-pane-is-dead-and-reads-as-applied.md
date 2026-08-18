---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/features/configure/components/skill-contents-dialog.tsx
  - packages/ui/src/components/dialog.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-17
reporting_agent: web-developer
category: testing
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code-side fix landed in EDITOR-32 (the class became `min-h-`, which does take effect). What
  is pending is the written rule. Nothing in the repository says that a sizing utility can be
  silently inert, and no gate can tell you — it is only visible by measuring a rendered element.
---

## What Was Wrong

`DialogPanes` in `@workspace/ui` carries `flex min-h-0 flex-1 overflow-auto` and is rendered inside
a `flex flex-col` sheet. I passed it a height to stop the dialog resizing as the reader clicked
between files:

```tsx
<DialogPanes className="h-[26rem] overflow-hidden">
```

`cn` merged it exactly as intended — `overflow-hidden` beat `overflow-auto`, and `h-[26rem]` was
added because it is in a different group from `flex-1`. Both classes really are on the element. The
height still does nothing: `flex-1` is `flex: 1 1 0%`, and a definite flex-basis plus flex-grow
decides the used main size in a column flex container, so `height` never gets consulted.

Nothing catches this. It type-checks, it lints, Prettier's Tailwind plugin sorts it happily, and
every Playwright assertion passed — none of them measures a box. The comment above it asserted the
dialog "does not resize as files are selected", which was a claim about behaviour the code did not
produce, sitting directly above the code that did not produce it. That is the part that would have
outlived the bug: the next reader trusts the comment and never measures.

I found it by driving the real app and printing the pane's own numbers:

```
rail: 696 content in 696 — scrolls: false
```

696px, in an element declared 416px tall. The class had been inert since I wrote it.

## Fix Applied

`min-h-[26rem]`, which is not overridden — `min-height` clamps the used size whatever flex resolves
to — and which turned out to be the better design anyway: the panes grow to whatever the shell's
`max-h` allows, so a document gets the height it deserves, and a two-file skill still cannot
collapse the sheet and move the Close button under the cursor.

The comment now says which of the two it is and why, and records that `h-` alone is dead here.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`, wherever the utility-class conventions live:

> **A `w-`/`h-` utility on a flex-grown child is dead code.** `flex-1` (`flex: 1 1 0%`) resolves the
> main-axis size from the flex algorithm, so `height` on a column child and `width` on a row child
> are never consulted. Use `min-h-`/`max-h-` (or `min-w-`/`max-w-`), which clamp the used size and
> therefore do take effect. This is invisible to `tsc`, ESLint, Prettier's class sorter and every
> DOM assertion that does not measure — `cn` will merge the class in, and it will be on the element,
> and it will do nothing.
>
> The rule generalises past flex: **a CSS declaration being present in the DOM is not evidence that
> it is in effect.** When a layout class is load-bearing enough to justify a comment, measure it
> once in a browser (`element.clientHeight`, `getComputedStyle`) rather than asserting the class is
> there. A comment claiming a layout behaviour is a claim that has to be checked the same way any
> other claim is.

Worth naming in `packages/ui/CLAUDE.md` too, beside the `data-slot` and cva conventions: components
that ship `flex-1` on a part callers are expected to size — `DialogPanes` is the live one — should
say so, because the caller's override looks like it works.
