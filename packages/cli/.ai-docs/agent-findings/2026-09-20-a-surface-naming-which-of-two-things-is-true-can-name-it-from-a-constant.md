---
type: standard-gap
severity: high
affected_files:
  - src/cli/lib/installation/source-scopes.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-20
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  None of the three instances survives. The last — the sentence naming which of a scope's two
  source folders was the live one, in doctor's Layout row and in the write commands' refusal — was
  deleted with `.claude-src/` support on 2026-10-04 (CLI-913). The finding stays for the CLASS it
  names. Still pending: the Proposed Standard for `standards/e2e/assertions.md` is written into no
  standard, and nothing runs the census grep.
---

## What Was Wrong

Three defects in one command, all the same shape: **a sentence naming which of several things is
true, where the naming was a constant rather than a derivation, and where nothing covering it
could have failed.**

1. `bothSourceFoldersPresent(from, to, readFrom)` takes the folder being read as a parameter —
   the signature says the answer varies. Both call sites passed `move.to.relName`
   unconditionally, so the sentence always named the destination. The resolver prefers whichever
   folder holds a `config.ts`, so in the exact arrangement `--adopt` exists for — the config still
   under the old name, content under the new one — the live folder is the OLD one and the user
   was told the opposite. The two specs covering the sentence both seeded the config under the old
   name, so both agreed with the constant.

2. **No surface named the post-migration state at all.** `migrate` leaves a marker `config.ts` at
   the old path and the resolver reads it as "moved", which correctly keeps a migrated scope out
   of the rival-folder machinery. Content written into that folder afterwards — by an older CLI
   still installed, or by hand — was therefore in no state any surface had a name for: `doctor`
   printed a tick, `migrate` said there was nothing to do, and `--adopt` could not reach it.

3. **A spec's assertion message claimed the opposite of what the code does, and the assertion
   could not fail.** `repointRegisteredProjects` rewrites each registered project's
   `config-types.ts` when the global moves — outside either scope the command was run for. The
   spec covering the registry asserted `fileExists(other/.claude-src/config.ts) === true` under
   the message _"a registered project is LISTED, never moved — migrate does not touch a working
   tree nobody asked it to change"_. The file it probed is one nothing ever writes, so the
   assertion held whatever the command did; and its message asserted an invariant the command
   breaks.

The common property is that **the assertion and the constant move together**. In (1) the spec
seeded the arrangement the constant happened to be right about. In (3) the assertion probed a
path the behaviour does not touch. In (2) there was nothing to assert about, because the state had
no name.

## Fix Applied

- `folderBeingRead(scope, move)` in `lib/migration/source-scopes.ts`, used by both call sites, so
  the argument is derived from the scope the sentence is about.
- `SourceScope.orphanedLegacy` names the post-migration state; `doctor` reports it with every
  orphaned file named, `migrate` refuses it with a remedy of its own, and `--adopt` merges it with
  the marker excluded from the moving set (`filesTheMergeMoves`).
- `MigrationPlan.repointedProjects` and `MigrationOutcome.repointedProjects`, both from
  `lib/migration/registered-projects.ts` — one enumeration, so `--dry-run` cannot name a different
  set of files from the one the real run writes. The misleading assertion message was corrected to
  state what its probe actually pins.

Each is covered by a pair in ONE file, per `packages/cli/CLAUDE.md`'s rule about a refusal needing
its permitted case beside it:
`e2e/commands/migrate-names-the-folder-being-read.e2e.test.ts` drives the sentence from both
sides of the config's location, and `e2e/commands/migrate-legacy-content-after-the-move.e2e.test.ts`
pairs every orphaned-content claim with the same scope holding the marker alone.

## Proposed Standard

For `standards/e2e/assertions.md`: **a spec covering a sentence that names which of N things is
true drives it from at least two sides in the same file.** One side cannot tell a derivation from
a constant — both leave the same output and the same green assertion — which is the same argument
`CLAUDE.md` already makes for pinning a refusal beside a permitted case, arriving from the output
end rather than the guard end.

The census that finds the shape. It is a worklist, not a verdict: a parameter genuinely constant
at every call site is a signature that should lose it, which is also worth knowing.

```
grep -rn 'readFrom\|whichOne\|isRead\|beingRead' src/cli --include='*.ts' --include='*.tsx'
```

Conflicts with nothing in `CLAUDE.md`. It is narrower than the existing "NEVER pin an operation as
REFUSED without pinning, in the same file, a state where the same operation is ALLOWED" — that
rule governs guards, and all three defects here were in output rather than in a guard.

## Correction — 2026-09-25

**The `partial_note` said the three instances were fixed "and each carries a both-sides pair in one
file", and after `migrate` was deleted that stopped being true.** Both pairs were `migrate` specs —
`migrate-names-the-folder-being-read` and `migrate-legacy-content-after-the-move`, named under "Fix
Applied" — and went with the command. The surviving instance is now exactly the shape this finding
describes: one side seeded, and a sentence that could be a constant with nothing to fail. The note
now says so. It read:

```text
partial_note: >-
  The three instances are fixed and each carries a both-sides pair in one file. What is not
  built is a gate for the class — the census grep below finds the shape, and nothing runs it.
  Later the same day, `migrate` was deleted by owner ruling and three of the five files this
  finding named went with it (`lib/migration/plan.ts`,
  `lib/config-gate/migrate-source-folders.ts` and the rewrites-what-the-move-breaks spec); the
  two that survive moved to `lib/installation/`. The CLASS the finding is about is unaffected,
  which is why the finding stays.
```
