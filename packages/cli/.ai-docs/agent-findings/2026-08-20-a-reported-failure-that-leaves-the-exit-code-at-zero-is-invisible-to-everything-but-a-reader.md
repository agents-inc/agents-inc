---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/base-command.ts
  - src/cli/lib/exit-codes.ts
  - src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  `edit`, `init` and `eject` all have the third ending as of 2026-08-21, the mechanism now lives on
  `BaseCommand`, and the gate binds every warn site in all four files to a stated verdict.
  `reportPropagatedRecompile` on `BaseCommand` is the one half still open, and its reason has
  changed rather than gone: it is shared by four commands, and two of them answer for no recorded
  failure at all, so routing it through the recorder would file work into a list they never read.
---

## What Was Wrong

A long-standing finding claimed three "warn and continue" sites in `edit` should become hard
errors. Two of the three had already been fixed and the third should not be: by the time
`Agent recompilation failed` fires, the config write has succeeded and the recompile is the last
step, so there is nothing left to continue to. A hard error there would relabel a state already
committed to disk rather than prevent one.

The real defect was in the third shape nobody had: `this.warn` does not touch the process exit
code, so `agents-inc edit` printed a failure and exited **0**. In a script or a `&&` chain the
run reported success over compiled sub-agents that had gone stale.

This is a class, not a site. `edit.tsx` had thirteen `this.warn(` calls and five of them named
work that did not happen — a global origin change that was never recorded while the migration it
described had already touched disk, a plugin scope migration whose install failed while the config
was about to record the new scope, sub-agents that refused to be written, a recompile that threw,
and a compiled sub-agent that would not delete. Every one of them looked, at the call site,
exactly like the eight that are genuinely advisory. Nothing distinguished them and nothing could:
both compile, both lint, and both pass every spec.

**Two of the five were also reachable through a shape that reads as covered.** The recompile's
partial-failure branch already printed `(N failed)` and warned each reason, so the output was
correct and only the exit code lied — the kind of defect a reader scanning for silence walks past.
And a summary built from that pass's `warnings` would have been wrong in the other direction:
`warnings` carries `"No agents found to recompile"` from the global scope on every
project-context run, which is not a failure.

## Fix Applied

`EXIT_CODES.COMPLETED_WITH_FAILURES` (5), raised through `this.exit()` at the very end of a
command that ran to completion. It is distinct from `ERROR` because the two ask opposite things of
a reader: an `ERROR` aborted so nothing landed and the run can be repeated, while this one landed
and the repeat is the wrong move. A spec asserting `not.toBe(0)` cannot tell a refusal from a
partial apply either.

In `edit.tsx`: `run()` became two statements — `applyEdit()` then `exitIfWorkIncomplete()` — so
the code is decided once, past every one of that method's three endings, rather than at each of
them. The five failure sites go through `reportIncompleteWork(what, recovery)`, which warns where
the failure is explicable AND records it; the ending prints `completedWithFailures()`, one line
per failure with the single command that finishes it, and suppresses `✓ Done`. The recompile's
partial-failure arm records off `failed` rather than off `warnings`, for the reason above.

Verified by hand against the built binary through a PTY: a project whose `.claude/agents` is a
regular file completes its edit, rewrites `config.ts` without the dropped skill, prints the
failure and the remedy, prints no tick, and the shell sees `$? = 5`. The same flow over an
unsabotaged tree exits 0 with both sub-agents compiled.

## Proposed Standard

**Landed as a runnable gate rather than as prose**, because the judgement it protects is made at a
call site where prose is not in front of anybody:
`src/cli/lib/__tests__/failure-reporting-classification.test.ts` holds every `this.warn(` in
`edit.tsx` and `base-command.ts` against a roster naming each one and stating why it is allowed to
leave the exit code alone. A new warn site reddens it until its author has written down which side
it is on. A second assertion holds the `EDIT_RECOVERY` members each failure site reaches for, in
source order and with repeats, so a failure site silently downgraded back to warn-only reddens
twice. Both halves were mutation-checked.

The prose half is one clause added to `clean-code-standards.md` **12.2**: this code is raised
through `this.exit()` at the END of a command that completed, never through `this.error()`.

What the gate cannot judge is whether a stated reason is a good one — only that a reason was
stated. Two of the rostered reasons are rulings rather than deductions and should be read as
open to revision: plugin **uninstall** failures are diagnostic-only per CLAUDE.md (the local copy
is the install after an eject, and a machine with no Claude CLI produces one on every healthy
migration), and `reportPropagatedRecompile` warns about recompile failures in other registered
projects — genuinely the same class as `edit`'s own, left alone only because the method is shared
by four commands and one command has been ruled on.
