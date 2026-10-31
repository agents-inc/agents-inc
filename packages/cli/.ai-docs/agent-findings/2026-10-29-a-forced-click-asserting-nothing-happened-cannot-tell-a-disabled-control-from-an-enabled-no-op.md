---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/incompatibility.spec.ts
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-29
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`incompatibility.spec.ts` "forcing a click on it still selects nothing" forced presses on a
ruled-out cell's switch and ••• and asserted that nothing changed. A comment justified the force by
saying the cell's `aria-disabled` covered its whole subtree, which was false: `LatticeCell` sets
none. In a browser on 2026-10-29 the ••• and all four switches were enabled, Tab reached the •••,
and Enter did nothing; axe reported zero violations. A forced press followed by "nothing changed"
passes both for a disabled control and for an enabled control whose handler silently returns.

## Fix Applied

EDITOR-61: the tester corrected the comment and added `toBeDisabled()` checks on each control; the
developer made the ••• and the four switches `aria-disabled`, and out of the Tab order, while the
clash stands.

## Proposed Standard

`apps/editor/e2e/README.md` Conventions: a press forced past actionability is paired with
`toBeDisabled()` on the same locator.
