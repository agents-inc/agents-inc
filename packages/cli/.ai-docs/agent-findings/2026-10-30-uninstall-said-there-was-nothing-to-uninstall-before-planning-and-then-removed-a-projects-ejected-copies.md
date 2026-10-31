---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/uninstall.tsx
standards_docs:
  - CLAUDE.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  `uninstall` says its declares-nothing line inside `reportNothingToUninstall`, reached only when
  the removal plan is empty; two cases in
  `src/cli/lib/__tests__/commands/a-project-config-declaring-nothing.test.ts` (ejected skill copies,
  a marker-stamped sub-agent file) pin that a run that removes something does not say it.
---

## What Was Wrong

`uninstall` printed "This project's config declares nothing, so there is nothing to uninstall in
this project." straight after its two-installations refusal, on a predicate about the config alone
(`holdsOnlyAConfigDeclaringNothing`), before `detectUninstallTarget` and `buildRemovalPlan` ran. The
plan does not depend on the config: copies carrying `forkedFrom` and sub-agent files carrying the
compiler's marker are removed whatever the config says, and `eject skills` leaves exactly such a
project (stamped copies beside the config it writes declaring nothing). Reproduced on the built CLI
by the reviewer: the line, then "Removed 238 CLI-installed skills … Agents Inc. has been
uninstalled."

The line states an outcome (nothing to remove); the other declares-nothing lines state what a
command works on, which the predicate does decide. Census, 2026-10-30:
`grep -rn 'sayWhenTheGlobalInstallationStandsIn\|sayWhenTheProjectsConfigDeclaresNothing' packages/cli/src/cli`
lists 10 call sites plus the 2 declarations; uninstall's was the only line claiming an outcome the
run decides later.

## Fix Applied

The call moved into `reportNothingToUninstall`, which `run` reaches only when
`hasAnythingToRemove(plan)` is false. Red then green: the two new cases failed on the line alone
(their removal and config assertions passed), then passed; the control "uninstall removes nothing
… after its own line" still passes.

## Proposed Standard

`packages/cli/CLAUDE.md`, Code Conventions: a message stating a command's outcome is printed where
that outcome is known (after the plan or the work), never from a predicate read before it. No
conflict with an existing rule. No mechanical gate is honest here: whether a sentence claims an
outcome is a reading of its words, so the guard is a spec pairing the message with a state where
the outcome differs.
