---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/installation/mode-migrator.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The code fix landed (CLI-975, 2026-10-24): applyApprovedChanges in edit.tsx builds the plan once
  and hands applyScopeChanges its own share, MigrationPlan.scopeChanges. It is pinned by "asks the
  host once for a plugin it installs beside its global copy", the exact host-call lists in
  edit-from-plugins-says-what-it-did.test.ts and the two switch-and-move specs in edit.test.ts
  (CLI-981), each red under a mutant that hands the scope move the scope-changing switches again.
  The Proposed Standard below is not written.
---

## What Was Wrong

Found by the CLI-975 developer on 2026-10-24; filed by the CLI-981 tester on 2026-10-26, with every
claim below re-derived against that day's tree.

`detectMigrations` in `lib/installation/mode-migrator.ts` partitions every changed skill into
`toEject`, `toPlugin` and `scopeChanges` (`movesScopeWithoutSwitchingMode`), and its docblock says
a skill that switches mode is never also a scope change. `edit --from` gave `toEject` and `toPlugin`
to `applyMigrations` and never read `scopeChanges`: `applyScopeChanges` rebuilt its own list from
the config diff (`scopeMovesOf(changes)`), which also holds every skill whose scope changed while
its mode switched.

So one skill reached two executors. A copy beside a global plugin switched to a project plugin was
installed by the switch, then asked for again by the scope move. A project copy switched to a
global plugin was installed globally twice, and the scope move also asked the host to uninstall a
project plugin that was never there. The partition was computed, documented and unit-tested, and had
no production reader.

## Fix Applied

None in this lane; the fix is CLI-975's. `applyApprovedChanges` builds the plan once
(`migrationPlanOf`), hands it to `applyMigrations`, and hands `migrationPlan.scopeChanges` to
`applyScopeChanges`, which splits it into copy moves and plugin moves by mode.

The census of the plan's fields and their production readers, from `packages/cli` (a census of
`MigrationPlan`, not of other planners):

```
grep -rn -E '(plan|migrationPlan|Plan)\.(toEject|toPlugin|scopeChanges)\b' src/cli --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.tsx?:|/__tests__/'
```

On 2026-10-26 it returned 11 lines in the two files above, and each of the three fields has a reader.

What holds it: under a mutant that hands `applyScopeChanges` the scope-changing switches as well as
its own share, five specs redden on the host's exact calls, three in
`edit-from-plugins-says-what-it-did.test.ts` and two in `edit.test.ts`. Before CLI-981 tightened the
two loose specs and added the two in `edit.test.ts`, only "asks the host once" did.

## Proposed Standard

For `clean-code-standards.md`, where no section covers it today: "Where a planner partitions items
among executors, each executor takes its share of that plan; none re-derives its set from another
diff." It conflicts with no CLAUDE.md rule.

No cheap static gate exists. Neither knip nor `tsc` reports an object field that is written and
never read, which is the shape this took. Mutation testing does find it, as the mutant above shows.
Not checked against every planner in the CLI: the census covers `MigrationPlan` only.
