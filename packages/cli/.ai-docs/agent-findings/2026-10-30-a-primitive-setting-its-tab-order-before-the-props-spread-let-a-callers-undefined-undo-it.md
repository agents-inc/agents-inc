---
type: anti-pattern
severity: low
affected_files:
  - packages/ui/src/components/button-group.tsx
  - packages/ui/src/components/segmented.tsx
  - packages/ui/src/components/lattice.tsx
  - packages/ui/src/components/command-block.tsx
  - apps/editor/src/features/configure/components/skill-cell.tsx
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-30
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  SegmentedItem, LatticeRow and CommandBlock merge a caller's tabIndex with `??` as ButtonGroupItem
  does, and the rule is in packages/ui/CLAUDE.md.
---

## What Was Wrong

`ButtonGroupItem` wrote its roving `tabIndex={checked ? 0 : -1}` before `{...props}`. A caller's
`tabIndex={undefined}` is still a key in that spread, so it replaced the roving value and every radio
in the group became a Tab stop. `skill-cell.tsx` worked around it with
`{...(clash !== undefined && { tabIndex: -1 })}`.

Siblings with the same order, over `packages/ui/src/components/*.tsx`
(`grep -rn "tabIndex=" packages/ui/src/components --include=*.tsx | grep -v stories`, then each
checked for a later `{...props}`): `SegmentedItem` (roving, the exact twin), `LatticeRow`
(`tabIndex={0}`) and `CommandBlock` (`tabIndex={copyable ? 0 : undefined}`). `LatticeCell`
destructures `tabIndex` and is not affected.

## Fix Applied

`ButtonGroupItem` destructures `tabIndex` and renders `tabIndex={tabIndex ?? rovingTabIndex}`, so an
explicit caller value still wins and `undefined` falls back to the roving one. `PairCell` passes
`tabIndex={clash !== undefined ? -1 : undefined}`. Pinned by the stories "An Undefined Tab Index
Leaves One Tab Stop", "An Undefined Tab Index Leaves The Stop On The Active Cell" and the control "A Caller Tab Index Takes
The Active Cell Out Of The Tab Order" in `button-group.stories.tsx`.

## Proposed Standard

Add to `packages/ui/CLAUDE.md` Rules: an attribute a component sets but lets a caller override is
destructured and merged with `??`, never written before `{...props}`, since a caller's `undefined` is
a key in the spread and replaces it. This does not conflict with either `CLAUDE.md`.
