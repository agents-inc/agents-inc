---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/base-command.ts
  - src/cli/commands/compile.ts
  - src/cli/commands/uninstall.tsx
  - src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code half has landed in full. PropagationResult keeps one list per reason: unreadable, then
  gone, notOurs and failed, and compile and uninstall give each its own line. uninstall keeps its
  own sentence only for unreadable and failed, where its config is still there. The Proposed
  Standard is not written into any standard.
---

## What Was Wrong

`PropagationResult.skipped` held every registered project a fan-out did not rewrite, for any
reason. A caller could print one sentence for all of them, or nothing:

- `edit` and `init` printed nothing, so a project whose `config.ts` could not be loaded was left
  stale with no word ("Recompiled agents in 0 registered projects").
- `compile` printed `registeredProjectUpdateSkipped`, whose docblock says it is uninstall's line,
  so it told the user their config "may still reference the uninstalled global content" when
  nothing was uninstalled.

## Fix Applied

`PropagationResult` has a third list, `unreadable`, for projects whose `config.ts` raised a
`ConfigLoadError`. Each project lands in exactly one list. `propagateToProject` loads the config
before it seats the catalogue, because the catalogue load reads the same file and refuses it with a
plain `Error` no caller can tell apart from any other failure.

`BaseCommand.reportFanOut` prints `Skipped <path>: its config.ts can't be read.` for each one, then
the recompile summary. `init`, `edit` and `compile` call it. `uninstall` keeps its own sentence for
both lists.

## Proposed Standard

A result that lists the things an operation did not do keeps one list per reason a caller words
differently. A message function whose docblock names one command is not reused by another; give it
its own function.
