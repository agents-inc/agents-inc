---
type: missing-standard
severity: medium
affected_files:
  - src/cli/components/wizard/summary-panel.tsx
  - src/cli/components/hooks/use-panel-scroll.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
date: 2026-07-31
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: partial
partial_note: "Code landed (the summary panel's header carries flexShrink={0} and the reason is in its JSDoc); the standard is pending — component-patterns.md's ScrollAffordance section documents the padding rule but says nothing about children of a clipped viewport needing flexShrink={0}, and nothing warns that Ink's Box defaults flexShrink to 1."
---

## What Was Wrong

At 20 rows and below, the confirm step painted its header as `Stacktnonee Agents Inc` — the
`Marketplace` and `Stack` rows overprinting into a single unreadable line. Verified against the real
binary through a PTY at 16 rows before the fix.

It is not a size problem, it is a layout one. `SummaryPanel` renders a clipping viewport
(`overflow="hidden"`) around a content box marked `flexShrink={0}`, and inside that content box a
fixed-height `PanelHeader` — two text rows plus a bottom border, `paddingBottom` and `marginBottom`.
Only the content box said it must not shrink. **Ink's `Box` sets `flexShrink: 1` as a component
default** (`node_modules/ink/build/components/Box.js`), which is the opposite of Yoga's own default
and is invisible from the JSX, so every unannotated box in the tree is shrinkable. When the terminal
is too short, Yoga compresses the header to fit rather than letting the viewport clip it, and Ink
then writes both header rows at the same terminal row.

The general shape: **marking the scrolled content unshrinkable does not protect anything inside it.**
`flexShrink` is per-item; the guarantee stops at the box that declares it. A clipped viewport's whole
contract is "lay the content out at its natural height, then show a window onto it" — any descendant
that is allowed to shrink breaks that contract silently and produces overprinting rather than a
missing row, so it reads as corruption rather than as clipping.

This is the sibling of the already-recorded padding defect
(`2026-07-31-vertical-padding-blanks-a-clipping-viewport-on-a-short-terminal.md`). Both are ways a
box near a clipped viewport quietly steals or destroys rows on a short terminal, and both are
invisible in the code that causes them.

## Fix Applied

- `PanelHeader` in `summary-panel.tsx` now carries `flexShrink={0}`, with the reason in its JSDoc
  (the constraint is invisible in the result). Confirmed against the real binary: at 16 rows the
  header renders `Marketplace Agents Inc` and the rest is clipped with a `17 more below` affordance,
  where it previously overprinted.
- The `SkillAgentSummary` wrapper below it was tested for the same defect and **deliberately left
  alone**: adding `flexShrink={0}` to it produced byte-identical frames at 16, 18 and 20 rows. Its
  height is entirely content-derived, with no fixed chrome of its own to compress. The residual
  under-measurement that remains at the shortest viewport (`contentHeight` first reading 18 where the
  content is 20) is the `flexWrap="wrap"` under-report that `usePanelScroll`'s monotonic
  `Math.max(prev, height)` guard already exists to absorb — `flexShrink` demonstrably does not move
  it.

## Proposed Standard

For `.ai-docs/reference/component-patterns.md`, in the `ScrollAffordance` section beside the existing
**Placement rule** and the padding rule:

> **Every fixed-height block inside a clipped viewport needs `flexShrink={0}`.** Ink's `Box`
> defaults to `flexShrink: 1`, so an unannotated box is shrinkable even though Yoga's own default is
> not — and `flexShrink={0}` on the scrolled content box does not extend to its children. On a short
> terminal Yoga compresses such a block instead of letting the viewport clip it, and Ink writes the
> compressed rows on top of each other: the failure looks like character corruption, not like
> missing content, so it is not read as a clipping bug. Anything with a border, padding, margin or a
> fixed row count — headers, dividers, labels — must opt out of shrinking. Content whose height is
> purely derived from its children does not need it; verify by rendering at the minimum supported
> height rather than by reasoning about the tree.
