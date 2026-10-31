---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/src/features/configure/components/skill-cell.tsx
  - apps/editor/e2e/specs/incompatibility.spec.ts
  - packages/ui/src/components/button-group.tsx
  - packages/ui/src/components/segmented.tsx
  - packages/ui/src/components/lattice.tsx
  - packages/ui/src/components/command-block.tsx
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-30
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: missing-rule
status: open
---

## What Was Wrong

`PairCell` in `skill-cell.tsx` uses a conditional spread so that a ruled-out cell's install and scope
radios leave the Tab order. The spread was a workaround for `ButtonGroupItem` letting any `tabIndex`
key, `undefined` included, replace its roving one. No editor spec covered what the workaround
protects. `skill-badges.spec.ts` "only the cell that is on takes the tab stop" covers an available
cell, and `incompatibility.spec.ts` "a ruled-out cell's own controls" covers disabled state, paint
and presses, but not the Tab order. So deleting the spread outright (rather than replacing it) would
have kept the editor e2e suite green, while a keyboard user tabbing past the ruled-out cell's •••
landed on its `plugin` and `project` radios again.

Census of the primitive's trap, where a `tabIndex` is set before `{...props}`, over
`packages/ui/src/components/*.tsx`:

- `SegmentedItem` (`segmented.tsx`) is the exact twin: roving `tabIndex={active ? 0 : -1}` then
  `{...props}`.
- `LatticeRow` (`lattice.tsx`, `tabIndex={0}` on a `div role="button"`) and `CommandBlock`
  (`command-block.tsx`, `tabIndex={copyable ? 0 : undefined}`) go the other way: a caller's
  `tabIndex={undefined}` removes their only Tab stop.

No caller in `apps/` passes `tabIndex` to any of the three today
(`grep -rn -A6 "<LatticeRow\b\|<CommandBlock\b\|<SegmentedItem\b" apps --include='*.tsx' | grep -c tabIndex`
returned 0 on 2026-10-30).

## Fix Applied

None in product code, which belongs to the developer lane. Three stories in
`button-group.stories.tsx` pin the primitive: two reds (a caller's `tabIndex={undefined}` leaves one
Tab stop, on the active cell) and one control (a caller's `tabIndex={-1}` still takes the active cell
out). A proposed `incompatibility.spec.ts` test for the editor half was run from a throwaway config:
it passed against the current tree and failed against a DOM mutant that gave the pair its tab stop
back.

## Proposed Standard

Add to `apps/editor/e2e/README.md`: a workaround in product code lands with a spec that fails once
the workaround is removed without a replacement. It is the other end of `packages/cli/CLAUDE.md`'s
"ALWAYS search for all call sites when removing a workaround". A workaround with no such spec can be deleted with every gate green. This proposal does not
conflict with either `CLAUDE.md`.
