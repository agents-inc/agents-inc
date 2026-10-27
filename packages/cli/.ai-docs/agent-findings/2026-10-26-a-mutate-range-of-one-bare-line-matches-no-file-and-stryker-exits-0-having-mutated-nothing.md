---
type: standard-gap
severity: low
affected_files:
  - docs/architecture.md
  - todo/server.md
standards_docs:
  - docs/architecture.md
date: 2026-10-26
reporting_agent: api-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

SERVER-08 in `todo/server.md` says to run `bun run mutation stryker.server.config.mjs --mutate
apps/server/src/crawl.ts:<the FIRST_HEADING_PATTERN line>`. Stryker 10 reads a bare `file:58` as a
glob. It matches no file, does a dry run, prints an all-zero table and exits 0. Run 2026-10-26 from
the repository root, with the server first pass's outputs moved out of `reports/`:

```
bun run mutation <server first pass> --mutate apps/server/src/crawl.ts:58
WARN ProjectReader Glob pattern "apps/server/src/crawl.ts:58" did not result in any files.
INFO Instrumenter Instrumented 0 source file(s) with 0 mutant(s)
exit=0
```

`apps/server/src/crawl.ts:58-58` instruments that line's 6 mutants. `docs/architecture.md`
("Mutation testing") warns that an empty `--mutate` dry-runs to exit 0, but never gives the range
form, so one line written the obvious way falls into the same silence.

The row's command is also only the first pass. The pattern is a module-level constant, so its 6
mutants are static and the first pass reports all of them Ignored: 0 killed, 0 survived. That half
is already covered: the doc says to run the static config on the first pass's Ignored and Survived
mutants.

## Fix Applied

None. Discovery only; the lane owned `apps/server/src/crawl.test.ts` alone.

## Proposed Standard

In `docs/architecture.md` -> "Mutation testing", beside the empty-`--mutate` warning: a range is
`file:L-L` or `file:L:C-L:C`. A bare `file:L` matches no file and exits 0 having mutated nothing,
so read the `Instrumented N source file(s) with M mutant(s)` line before trusting the table.
Checked against both `CLAUDE.md` files and `standards/briefing.md`: no conflict.
