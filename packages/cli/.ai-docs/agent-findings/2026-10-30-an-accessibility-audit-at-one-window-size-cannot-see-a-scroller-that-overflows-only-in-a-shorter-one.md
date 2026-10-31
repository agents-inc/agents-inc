---
type: missing-standard
severity: low
affected_files:
  - apps/editor/e2e/specs/a11y.spec.ts
  - apps/editor/src/features/configure/components/install-dialog.tsx
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-30
reporting_agent: web-developer
category: testing
domain: web
root_cause: missing-rule
status: open
---

## What Was Wrong

Every `a11y.spec.ts` audit ran at 1600x1000, where the Install dialog's skills and agents lists fit,
so axe's `scrollable-region-focusable` had nothing to check there. The defect lived only at 768px
high and below: the lists scrolled, but nothing in them could take keyboard focus, so a keyboard
user could not reach the rest of the list. The audit passed throughout.

Sibling scrollers, from the EDITOR-58 review:
`grep -rn 'overflow-auto\|overflow-y-auto' apps/editor/src packages/ui/src`.

## Fix Applied

EDITOR-58: the Install dialog's lists region (`install-dialog.tsx`) is focusable and named "Skills
and agents". `a11y.spec.ts` "the dialogs › install, in a window too short for its lists" audits at
1600x640, and only after its `overflows` guard on the lists reads true, so it cannot pass on a list
that fits.

## Proposed Standard

`apps/editor/e2e/README.md`: an audit whose subject is a scroller sets a window size at which that
scroller overflows, and guards on `overflows` before auditing. Checked against both `CLAUDE.md`
files: no conflict.
