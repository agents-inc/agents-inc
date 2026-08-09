---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/base-command.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
  - src/cli/commands/compile.ts
  - src/cli/commands/uninstall.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-08
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  Folded into BaseCommand.reportPropagatedRecompile, alongside
  reportValidationErrors, and called by all four commands. The two spellings
  collapsed to one in the same edit that made the count honest (CLI-440).
---

## What Was Wrong

Four commands print the summary of the recompile a global write fans out into the other registered
projects, and each held its own copy of it:

- `init.tsx` and `edit.tsx` each declared a **private method of the same name**,
  `reportPropagatedRecompile(propagation: GateReport)`, with the same early return, the same
  warning loop and the same line — except `init` wrote `... N registered projects` and `edit` wrote
  `... N registered project(s)`.
- `compile.ts` and `uninstall.tsx` inlined the same three statements a second and third time.

The divergence was already load-bearing in the test suite: `e2e/pages/constants.ts` carries a
comment on `PROPAGATED_RECOMPILE` explaining that specs must anchor on the command-agnostic prefix
`"Recompiled agents in"` _because_ the two commands spell the rest of the line differently. A
constant whose doc comment documents a defect is the defect having outlived the chance to be
noticed as one.

This is the same shape CLI-364 landed for the validation report — `init` and `edit` answering the
same question two ways — but it went unnoticed because the two narrations agreed on everything a
reader would compare at a glance, and disagreed only on a plural.

## Fix Applied

`reportPropagatedRecompile` moved to `BaseCommand`, next to `reportValidationErrors`, and all four
commands call it. The wording is now produced by one formatter, `propagatedRecompileSummary` in
`utils/messages.ts`. `compile.ts` keeps its own skipped-project warning loop (that part genuinely is
its own) and delegates the rest; `uninstall.tsx` keeps its `registeredProjectsUpdated` line for the
same reason.

`init`'s copy carried a trailing `\n` the other three did not, so `init`'s output loses one blank
line after the summary. No spec asserted it and the full E2E suite is green.

## Proposed Standard

`clean-code-standards.md` should carry the rule the CLI-364 landing and this one are both instances
of, stated so it applies before a second copy exists rather than after four do:

> **A line more than one command prints belongs on `BaseCommand`.** If two commands narrate the
> same operation, the narration is a property of the operation, not of either command. Put it on
> `BaseCommand` (or on the shared operation) the first time a second caller needs it — not the
> second time it drifts.

The detection heuristic worth writing down alongside it: **two private methods with the same name
in two commands is the signature**. `grep -c "private reportPropagatedRecompile" src/cli/commands/`
returning 2 is a one-line check, and would have caught this the day the copy was made.
