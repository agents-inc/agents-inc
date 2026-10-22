---
type: standard-gap
severity: medium
affected_files:
  - CLAUDE.md
  - docs/architecture.md
  - src/cli/lib/testing/dist-staleness.ts
standards_docs:
  - CLAUDE.md
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

A hand mutant written into a source file makes that file newer than `dist/`. `assertDistIsFresh`
(`src/cli/lib/testing/dist-staleness.ts`), which `vitest.global-setup.ts` runs first, then refuses
the run before any spec is collected. Vitest 4.1.10 prints `No test files found, exiting with code
1` and `dist/ is stale`, and exits 1. A check of the exit code alone reads that as the mutant
killed. The expressive-ts lane reviews are briefed to "break a changed line in a scratch edit you
revert and show a test fails". The X2-configuration round 1 review's first pass of six mutants all
exited this way, and not one ran a test. Its second pass reset each mutated file's mtime
(`touch -r <backup> <file>`) and named the failing tests, and only that pass counted.

Reproduced 2026-10-21 under the dist lock, changing the mtime only and not the content. After a
build, `touch -d "now + 20 seconds" src/cli/lib/configuration/scope-diff.ts` then
`npx vitest run src/cli/lib/configuration/scope-diff.test.ts` exits 1 with zero tests. With the
mtime restored by `touch -r`, the same run exits 0 with 16 passed.

`CLAUDE.md` › Pre-Commit Checklist says the reverse: a guard-aborted run "collects ZERO tests, and a
zero-test run reads as a pass if only the exit code is checked". On this tree it reads as a failure.

The mtime reset has a limit of its own, and so does the Vite `transform` method of
`2026-10-21-a-hand-mutant-under-an-as-can-be-served-to-one-suite-without-writing-the-shared-tree`.
Either one reaches only specs that import source. Specs that call `runCliCommand` load commands from
`./dist/commands` (`oclif.commands.target` in `package.json`), so they run the unmutated build, and
a mutant that survives them is not evidence either.

## Fix Applied

None in the tree. This is a discovery only.

## Proposed Standard

- `docs/architecture.md` › "Mutation testing", where it says to break code under an `as` by hand:
  a hand mutant counts only when the run's output names a failing test, never on its exit code.
  Serve it without writing the file, or reset the file's mtime before the run. Judge it only against
  specs that import source, unless the run rebuilds `dist/` with the mutant in it.
- `CLAUDE.md` › Pre-Commit Checklist: delete "and a zero-test run reads as a pass if only the exit
  code is checked". It is false on Vitest 4.1.10.

Nothing checks either rule. The second one deletes a `CLAUDE.md` sentence and conflicts with
nothing else in it.
