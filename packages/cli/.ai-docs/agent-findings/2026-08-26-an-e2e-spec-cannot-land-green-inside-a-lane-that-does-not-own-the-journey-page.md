---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/spec-gates.test.ts
  - packages/cli/.ai-docs/standards/e2e/user-journeys.md
  - packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts
  - packages/cli/.ai-docs/standards/briefing.md
standards_docs:
  - .ai-docs/standards/briefing.md
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-26
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: open
---

## What Was Wrong

`spec-gates.test.ts` requires every file the `e2e` vitest project collects to be named on
`.ai-docs/standards/e2e/user-journeys.md`, or to appear in `SPECS_BELONGING_TO_NO_JOURNEY` — a list
its own docblock says "may only shrink". Both of those live outside `e2e/`. So **adding one e2e
spec is a two-file change, and the second file is in neither the spec directory nor, usually, the
lane the spec was dispatched to.**

Observed today. A brief for Phase B of the editor-v6 programme named the lane's files exhaustively
and exclusively — the standard in `briefing.md` requires exactly that whenever more than one agent
is working, and two other lanes were live in `apps/editor` and `packages/ui` at the time. The list
included `packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts` by name. It could not
include `user-journeys.md`, which belongs to no lane and is `codex-keeper`'s to write. Creating the
one file the brief asked for therefore turned a green gate red, in a suite the same brief required
to be run and reported:

```
FAIL |unit| src/cli/lib/__tests__/spec-gates.test.ts
  > names every spec on the page, bar the backlog rostered when this gate landed
AssertionError: a spec belongs to no journey — give it a row, or add it to
SPECS_BELONGING_TO_NO_JOURNEY, which may only shrink: expected [ …(149) ] to strictly equal [ …(148) ]
+   "lifecycle/preview-matches-install"
```

Neither escape is available to a lane-scoped agent. Editing the page is out of lane. Adding to
`SPECS_BELONGING_TO_NO_JOURNEY` is out of lane _and_ forbidden by the list's own contract. Writing
the spec somewhere the `e2e` project does not collect would hide it from the suite entirely, which
is the failure mode `e2e/vitest.config.ts` already records for `e2e/smoke/*.smoke.test.ts` going
unrun for months.

**The gate is right and the brief was right.** What is missing is the sentence that makes them
compatible: nothing in `briefing.md` says a lane's file list has to reach the files its own change's
gates will demand, and nothing in `user-journeys.md` says who writes a row for a spec an
implementation lane creates. The two standards are individually complete and jointly leave a
change with no legal way to be finished.

This is not specific to this programme. Every lane that adds an e2e spec meets it, and the cost is
paid at the worst moment — at the end, in a gate run, by an agent who has just been told its file
list is exclusive.

## Fix Applied

None — discovery only, and deliberately so. Both repairs are in files this lane does not own:
either a journey row in `.ai-docs/standards/e2e/user-journeys.md` naming
`lifecycle/preview-matches-install`, or a decision that the spec belongs to an existing journey. The
orchestrator was told the exact change rather than it being made, which is what `briefing.md`
requires of an agent needing something in another lane's file.

## Proposed Standard

Two lines, in `.ai-docs/standards/briefing.md`, in the section that requires a lane's files to be
named:

1. **A file list has to reach the gates the work will trip, not only the files the work edits.** An
   e2e spec obliges a journey row; a new finding obliges an `INDEX.md` row; a new workspace obliges
   the shared-config checkers. Name the second file in the lane, or name in the brief who owns it
   and say the lane is expected to report rather than fix.
2. **A gate a lane cannot legally satisfy is a brief defect, not an agent failure.** Where a lane
   reports one, the report is the deliverable and the red is expected — it should not be resolved by
   widening the lane on the agent's own authority.

Cross-checked against `packages/cli/CLAUDE.md` and the root `CLAUDE.md`: this conflicts with neither.
It restates the existing "an agent needing a change in another lane's file reports the exact change
rather than making it" rule from the _brief author's_ side, which is the side that can actually
prevent it — the reporting rule already works, and what it cannot do is stop the brief from asking
for a change that cannot be completed inside its own fence.

The alternative shape — teaching `spec-gates.test.ts` to tolerate an unrostered spec for one commit
— is rejected here: the gate's whole value is that the backlog can only shrink, and a tolerance
window is a hole an unrostered spec would live in permanently.
