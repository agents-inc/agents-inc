---
type: anti-pattern
severity: medium
affected_files:
  - apps/server/src/stacks.test.ts
  - apps/server/src/stacks.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: api-developer
category: testing
domain: api
root_cause: enforcement-gap
status: partial
partial_note: >-
  The forced interleave landed as a spec, stacks.test.ts › "a write of the account's own landing
  between the worker's read and its write"; with noNewNameSince returning sql`1` its save and
  rename cases answer 201 and 200 where 409 is expected. The proposed editor-and-worker.md rule
  is not written.
---

## What Was Wrong

`stacks.test.ts` › "a name the account already holds" › "goes to one of two saves sent together,
and is refused to the other" sends two `POST /stacks` through `Promise.all` over `SELF` and expects
`[201, 409]`. It is there to hold the worker's guard. `createStack` reads the account's names,
compares them in JavaScript, then writes only where no new name has appeared since that read. The
condition sits inside the `insert … select` statement itself (`noNewNameSince` in `stacks.ts`).

In the Workers test pool the two requests never interleave between one handler's read and its
write. With the condition replaced by `where 1` (and the rename's dropped), the spec still passes.
So does a probe of twelve concurrent saves, and one of twelve concurrent renames. Each was run
2026-10-26 against the mutant. The same-name check in JavaScript answers every one, because each
request reads after the other's write.

The guard is load-bearing, but only a forced interleave shows it. A probe spies on
`env.DATABASE.prepare` (the same binding object `SELF` uses) and lands a write of another
same-name stack just before the worker's guarded `insert`/`update` runs:

- Real code: 409 for the save and for the rename, a 201 when the landed name differs, and a 404
  when the landed write deletes the stack being renamed.
- Mutant: 201 and 200, so the account holds the name twice.

The probe is not committed. Specs are the tester's.

## Fix Applied

None — discovery only. The guard is in `stacks.ts`; the probe and its two runs are in the
SERVER-10 hand-off.

## Proposed Standard

In `standards/editor-and-worker.md`, a new section: "A worker spec that claims two requests race
must land one inside the other". `Promise.all` over `SELF` does not interleave D1 calls, so such a
spec must make the race certain. It wraps `env.DATABASE.prepare` to land the competing write
before the statement under test, and it asserts that the landing happened. A Stryker run on the
file (`bun run mutation stryker.server.config.mjs --mutate apps/server/src/stacks.ts`) is the
check that would show the guard's mutants surviving. This does not conflict with that document's
rule against `vi.mock` of a module `src/index` imports, because it replaces a collaborator through
its binding, which is what that rule asks for.

## Correction

"Never interleave" is too strong. Against a copy with `noNewNameSince` returning `` sql`1` ``, the
`Promise.all` spec alone (`vitest run src/stacks.test.ts -t 'two saves sent together'`) failed 4
of 10 runs on 2026-10-26 with `expected [ 201, 201 ] to strictly equal [ 201, 409 ]` (a sample, not
a census). So the requests do sometimes interleave, and the spec catches the guard's removal only
by chance. Against the real worker it passed 10 of 10. The conclusion stands: only the forced
interleave catches the removal on every run.
