---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/reference/config/config-merger.md
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
standards_docs:
  - .ai-docs/reference/config/config-merger.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`src/cli/lib/configuration/config-merger.ts` now preserves the global config's
`projects` field on merge (the `if (existingConfig.projects && !newConfig.projects)`
branch at the end of `mergeConfigs`). This landed as part of the in-progress
D-233 working-tree changes and is compiled into the current `dist/` binary.

Two artifacts still describe this as an unfixed, active bug:

1. `.ai-docs/reference/config/config-merger.md` — the "Known Bug — `projects`
   Field Drop" section and the `mergeConfigs` vs `mergeGlobalConfigs` comparison
   row (`projects` field: "**Dropped** (bug; see finding 2026-04-18)") still
   assert the drop happens on current main.

2. `e2e/lifecycle/project-tracking-propagation.e2e.test.ts` — the `KNOWN GAP`
   comment in "cc edit at HOME adding a new global skill preserves project
   import-and-extend config-types" keeps a proof-of-execution assertion
   (`expect(projectTypesAfter).not.toStrictEqual(projectTypesBefore)`) commented
   out, citing the drop bug as the blocker. That precondition is now satisfiable.

Verified by a fresh repro (`e2e/lifecycle/scenario-b-edit-home-preserves-projects.e2e.test.ts`):
seeding a global config at `$HOME` with `projects: [<registered-project>]`, then
running `cc edit` at `$HOME` and toggling a skill, leaves the `projects` array
intact (`toStrictEqual` before/after passes).

## Fix Applied

None — discovery only. This is a verification-only task; no source, doc, or
existing test files were modified.

## Proposed Standard

When the D-233 `projects`-preservation change is committed:

- Update `.ai-docs/reference/config/config-merger.md`: convert the "Known Bug —
  `projects` Field Drop" section to a resolved note and flip the comparison-table
  row from "Dropped (bug)" to "Preserved".
- Uncomment the proof-of-execution assertion in
  `project-tracking-propagation.e2e.test.ts` so propagation is proven to fire
  (guarding against a future regression that short-circuits before the contract).
- Mark finding `2026-04-18-mergeConfigs-drops-projects-field.md` as `resolved`
  with `resolved_by:` citing the merger change.
