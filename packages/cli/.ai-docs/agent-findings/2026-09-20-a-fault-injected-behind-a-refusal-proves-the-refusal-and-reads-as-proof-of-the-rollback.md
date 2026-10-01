---
type: anti-pattern
severity: medium
affected_files:
  - e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-20
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The fixture half landed and survives: `refuseUnreachableConfig` in `e2e/helpers/test-utils.ts`
  compares only when the file the product reads (`LoadedProjectConfig.configPath`) is the file it
  wrote. The half about the two migrate specs is moot rather than pending, because the command, its
  specs and its planner were deleted by owner ruling on 2026-09-20. Pending is the Proposed Standard
  for `standards/e2e/anti-patterns.md` (an injected fault must reach the step the spec names,
  established from the OUTPUT), which is written into no standard.
---

## What Was Wrong

Two specs in `migrate-rollback.e2e.test.ts` injected a fault with `chmod` — one on the project
directory, one on `.agents-inc/` — and asserted that the `mkdir` and the `rename` had left nothing
behind. Neither step ran. `migrate` PLANS before it moves, and the plan already refuses a directory
this process may not write (`unwritableDirectories` in `src/cli/lib/migration/plan.ts` probes the
scope root, the source folder and the destination parent whenever it exists), so both runs stopped
one phase earlier than the spec's subject.

**What made it invisible is that the refusal and the rollback print the same closing line.**
`MIGRATE_NOTHING_MOVED` is the last thing a refused plan says and the last thing a failed move says,
so `expect(combined).toContain(...)` held either way; the tree was byte-identical either way; and
the exit code was `ERROR` either way. Every assertion in both specs passed, and a rollback that had
been deleted outright would have passed them too.

Evidence, run against the fixture the spec built:

```
$ cd <scratch>/project && chmod 0555 .agents-inc && migrate --yes
✗ This project: <scratch>/project/.agents-inc cannot be written by this process
 ›   Error: Refusing to migrate: nothing was moved.
```

That is the planner's refusal — not a rename that failed and unwound.

A second, narrower case of the same shape was found in `e2e/helpers/test-utils.ts`:
`refuseUnreachableConfig` re-read "this scope's config" through the product loader after writing a
config into a folder the caller NAMED. Where the two are not the same file — a spec seeding the
rival half of a two-folder scope — it compared file A's bytes against a re-render of file B and
refused the fixture, quoting the other file's `name` back as evidence of a normalisation nobody had
performed.

## Fix Applied

Both faults are now injected where the step they name can actually meet them, needing no
permission bit: a plain file standing at `.agents-inc` fails the `mkdir` with `EEXIST`, and a plain
file standing at `.agents-inc/claude` fails the `rename` with `ENOTDIR`. Both reach their step,
both roll back, and both now run as root — only the `chmod`-on-a-file spec still needs the uid
guard, which moved from the file onto that one `it`.

The fixture guard now asks the product which file it reads (`LoadedProjectConfig.configPath`) and
compares only when that is the file just written, with the reason written where the guard is.

## Proposed Standard

For `.ai-docs/standards/e2e/anti-patterns.md`, beside the existing rules on assertions that cannot
fail:

> **An injected fault must reach the step the spec names, and the way to establish that is the
> OUTPUT, not the fixture.** A command that validates before it acts has two failure phases that
> leave the same tree, the same exit code and — where a closing line is shared — the same text. A
> spec whose fault is caught by the earlier phase proves the earlier phase twice and the later one
> never, and it stays green when the later one is deleted. Assert on a sentence only that phase can
> produce (the errno, the step's own message), or drive the fault through a state the earlier phase
> cannot refuse.

This is the mirror of the repository's existing rule that a refusal must be pinned beside a
permitted case: that one covers a guard that has swallowed its domain, this one covers a guard that
has swallowed the spec's subject.

## Correction — 2026-09-25

**`status` moved from `resolved` to `partial`: the fix landed and the Proposed Standard did not.**
`README.md` → "Resolution Model (authoritative)" makes that `partial`, and
`grep -rniE 'injected fault|reach the step' .ai-docs/standards`, run from `packages/cli`, answers
nothing. The `resolved_by` it carried is recorded here rather than kept beside a status it no longer
pairs with:

```text
resolved_by: >-
  Both faults now land at the step they name — a file standing where `.agents-inc/` has to be
  created reaches the `mkdir`, and a file standing where `.agents-inc/claude/` has to land reaches
  the `rename` (ENOTDIR). The read-only-directory case they used to inject stays covered where it
  belongs, in `commands/migrate-refuses-and-moves-nothing`, paired there with a permitted case.
  The fixture guard in `e2e/helpers/test-utils.ts` now compares the file it WROTE, by asking the
  product which file it reads (`LoadedProjectConfig.configPath`), instead of comparing two
  different files whenever a spec seeds the rival half of a two-folder scope.
  Later the same day, `migrate` was deleted by owner ruling: the two specs this finding is about
  (`e2e/commands/migrate-rollback.e2e.test.ts`) and the planner behind them
  (`src/cli/lib/migration/plan.ts`) went with the command, so neither is listed above any more.
  The fixture guard and the CLASS the finding names both survive, which is why the finding stays.
```

**One clause of it no longer holds either.** The read-only-directory case it says "stays covered
where it belongs, in `commands/migrate-refuses-and-moves-nothing`" went with the `migrate` command,
as the two specs it names did: `ls e2e/commands | grep migr` answers nothing.
