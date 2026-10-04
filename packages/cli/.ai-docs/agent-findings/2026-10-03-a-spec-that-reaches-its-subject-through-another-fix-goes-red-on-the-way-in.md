---
type: standard-gap
severity: low
affected_files:
  - e2e/interactive/init-wizard-existing.e2e.test.ts
  - e2e/pages/dashboard-session.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-03
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The spec is fixed: it chooses Doctor one key at a time. The proposed line in anti-patterns.md
  has not been written.
---

## What Was Wrong

`should end the run with the command chosen on the dashboard shown with no command` is about one
thing: after the bare dashboard runs a command, the root help must not print. It reached Doctor by
writing Down, Down, Enter in one burst (`chooseInOneBurst(2)`). Reading a burst correctly was a
separate fix, with a spec of its own beside this one.

So the spec's red rested on two fixes. Reverting both made the burst open Edit, and the spec timed
out (`Process did not exit within 10000ms`) instead of failing on `STEP_TEXT.ROOT_HELP_USAGE`.
Reverting only the help fix did fail it on the help listing. So the mutation check passed or failed
depending on which fixes it reverted together.

## Fix Applied

`DashboardSession.chooseOneKeyAtATime(downs, focusedRow)` moves the focus one key at a time, waits
for `STEP_TEXT.DASHBOARD_DOCTOR_FOCUSED`, then presses Enter. The spec uses it. Mutation-checked:

- With only the help fix reverted, the spec fails on `ROOT_HELP_USAGE`.
- With the help and burst fixes both reverted, it still fails on `ROOT_HELP_USAGE`, and the burst
  spec fails on its own subject.

## Proposed Standard

Add one line under "Never call a spec a regression guard until you have watched it go red" in
`standards/e2e/anti-patterns.md`: a spec must reach its subject by a path that does not depend on
another spec's subject. When several fixes land together, revert each one alone. A spec that fails
on its setup instead of its assertion is depending on another spec's subject.
