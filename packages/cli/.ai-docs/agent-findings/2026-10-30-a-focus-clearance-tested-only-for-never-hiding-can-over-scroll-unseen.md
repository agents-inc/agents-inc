---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-scroll-clearance.ts
  - apps/editor/e2e/specs/sticky-bar.spec.ts
  - apps/editor/e2e/specs/composer.spec.ts
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

The scroll clearance (`use-scroll-clearance.ts`, the root's `scroll-padding-top` and `-bottom`) was
guarded one way only: "never hides the control the keyboard is on" (`sticky-bar.spec.ts`,
`composer.spec.ts`). Nothing asserted that the page holds still when the focused control is already
on screen. Controls inside the pinned bar sit inside the top padding zone and never count as "in
view", so each Tab scrolled the page about 400px, with every test green (EDITOR-93; the bottom-edge
twin is EDITOR-80, typing is EDITOR-81).

## Fix Applied

EDITOR-93. `sticky-bar.spec.ts` "the keyboard inside the stuck bar" holds the converse for the top
bar. Nothing holds it for the bottom edge.

## Proposed Standard

`apps/editor/e2e/README.md`: a clearance or visibility guard is tested with its converse, that
focusing a stop already on screen moves nothing.
