---
type: standard-gap
severity: medium
affected_files:
  - src/cli/base-command.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/commands/eject.ts
  - src/cli/lib/__tests__/failure-reporting-classification.test.ts
standards_docs:
  - .ai-docs/reference/commands/index.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: premise-expired
status: resolved
resolved_by: >-
  The roster gate was widened from two files to four and gained a second assertion that reads the
  whole command directory rather than a list: any command recording incomplete work must also call
  exitIfWorkIncomplete, which is a failure mode that could not exist while the mechanism was
  private. Both halves mutation-checked by reverting the product change and watching the
  corresponding e2e leg redden.
---

## What Was Wrong

Nothing, when it was written. `failure-reporting-classification.test.ts` rosters every `this.warn(`
in two named files and requires a stated reason per site, and that was the right shape for a
mechanism that lived inside one command: `edit` owned the recorded-work list, the two methods that
appended to it and the ending that answered for it, all private. **No other command could file a
failure into a list nobody read, because no other command could file one at all.**

Widening the third ending to `init` and `eject` moves that mechanism onto `BaseCommand`, and the
premise the gate rested on expires with the move. Ten commands now inherit `recordIncompleteWork`
and `exitIfWorkIncomplete` as two independent calls, and the pair has to be made by hand:

- Recording without answering compiles, lints, passes every spec, and exits **0** over a failure
  the user was warned about. It is the original defect wearing the mechanism built to close it.
- The per-file warn roster cannot see it. It reports what a call site SAYS, over a fixed list of
  files, and this failure is a call that is absent from a file the list does not name.

`reportPropagatedRecompile` is the live instance of the hazard rather than a hypothetical: it warns
about recompile failures in other registered projects — the same class as the compile failures both
`init` and `edit` now record — and it is shared by four commands, two of which (`compile`,
`uninstall`) have no ending that reads the list. Routing it through the recorder would file work
into a list those two never read. It is left warn-only for that reason, which is a different reason
from the one on record before this pass, and the roster entry now says so.

## Fix Applied

Two assertions where there was one, in the same file:

1. The warn roster is total over four files rather than two — `edit.tsx`, `init.tsx`, `eject.ts` and
   `base-command.ts` — so each command that adopted the ending had to classify its own warn sites in
   the same pass that gave it one. Every failure site's recovery sentence is rostered per file too,
   so a site deleted reddens as well as a site added.
2. A second assertion globs `src/cli/commands/**/*.{ts,tsx}` — derived, not listed, so a command
   added tomorrow is inside the gate — and requires that any command whose source records incomplete
   work also calls the answering method. It asserts the recording set itself first, so the gate
   cannot pass vacuously against a tree where nothing records anything.

The hand-run evidence for the behaviour underneath: a real `init --from` into a directory whose
`web-developer.md` is a directory prints `Compiled 1 agents (1 failed)`, names the sub-agent, names
the remedy, withholds `initialized successfully!`, and the shell sees `$? = 5`; the same flow over
an unsabotaged tree exits 0 with the tick.

## Proposed Standard

**When a mechanism moves from one owner to a shared one, its gate moves with it or the gate has
quietly narrowed.** The move usually reads as a pure refactor — same methods, same behaviour, one
call site becoming four — and the thing that changes is not in the diff: the set of ways the
mechanism can now be used WRONG. A per-file roster is exactly the shape that does not follow, because
its population is a list and the move is what makes the list incomplete.

The cheap test to apply at the moment of hoisting: **name the new failure mode that was
unrepresentable before.** Here it was "record without answering". If one exists and no assertion
covers it, the hoist is not finished. If none exists, say so — a hoist that genuinely widens nothing
is worth writing down as such, because the next reader cannot tell that from an unexamined one.

Home for the rule: `.ai-docs/standards/clean-code-standards.md`, beside the error-handling section
that already carries the completed-with-failures clause. Cross-checked against CLAUDE.md's NEVER and
ALWAYS lists: it conflicts with none of them, and it is the same shape as the existing rule for
changing a function from returning a sentinel to throwing — visit every call site and record its
posture — one level up, where the change is to who may call rather than to what a call returns.
