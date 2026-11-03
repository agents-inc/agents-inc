---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/config-gate/classify.ts
  - src/cli/lib/seed/config-to-seed.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-11-02
reporting_agent: cli-developer
category: complexity
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Code half done: classify.ts's two diffs share `changedEntries`, and `readStack` in
  seed/config-to-seed.ts partitions its rows. packages/cli/CLAUDE.md names `mapInTurn`
  (utils/in-turn.ts) for steps that must run in turn; the 8.6 clarification in
  clean-code-standards.md is not written.
---

## What Was Wrong

`diffSkills` in `config-gate/classify.ts` declared `sourceChanged` and `otherChanged` empty, walked
the new entries in a `for` loop, skipped unchanged ones with `continue`, and `push`ed each changed
id into one list or the other depending on whether its `origin` moved. `diffAgents` beside it found
the same changed entries again with its own multi-line filter. CLAUDE.md ("NEVER build intermediate
data structures imperatively") and `clean-code-standards.md` 8.6 both forbid the push loop. Nothing
runs either rule.

## Fix Applied

REPO-55's third round, config-loading lane. `changedEntries(before, after)` returns, with
`flatMap`, the entries both sides hold that differ. `diffSkills` splits them with remeda's
`partition` on `movedOrigin`, and `diffAgents` maps the same helper's keys. The round's report says
no test was rewritten.

Class census, 2026-11-02, from `packages/cli`:

```
grep -rnE 'const [a-zA-Z]+: [^=]+\[\] = \[\];' src/cli --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.|__tests__'
```

It found 18 hits in 14 files, and each one was opened. Seventeen are filled inside a loop that
awaits each step in turn (four in `update.ts`, two in `skill-plugin-compiler.ts`, and one each in
the rest). One has the shape `diffSkills` had: `readStack` in `seed/config-to-seed.ts`, a
synchronous loop that fills a map and pushes refusals into `unwritable`. It was outside the round's
lane and was not changed. The grep misses an accumulator written without a type annotation, so it
is a floor.

## Proposed Standard

8.6 names no exception for the awaited case. The seventeen read as correct, because their steps
must run one at a time and in order. 8.6 should either say that a loop awaiting each step in turn
is outside it, or name a sequential map to use instead (`flatMapInTurn` in `commands/doctor.ts` is
one). This is a proposal. It narrows or completes 8.6 and conflicts with nothing in CLAUDE.md.
