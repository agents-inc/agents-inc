---
type: anti-pattern
severity: medium
affected_files:
  - e2e/commands/search-static.e2e.test.ts
  - src/cli/commands/search.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed 2026-10-20. The three border-bounded assertions in search-static.e2e.test.ts are
  now space-bounded and hold in both renderings. Standard side open. No rule tells a spec author
  that output a dependency renders differently under CI is asserted on what both renderings share.
---

## What Was Wrong

`search` prints through `printTable` from `@oclif/table` (0.5.9). When `CI` is truthy,
`shouldUsePlainTable()` in its `lib/utils.js` is true, and `printTable` renders plain text with
space-padded cells, a dashes rule and no box characters. The library README documents this as
"CI-safe output", with `OCLIF_TABLE_SKIP_CI_CHECK=1` as the override. The e2e runners pass `CI`
through on purpose (`standards/e2e/README.md`, runner-environment paragraph), so under GitHub
Actions the child prints the plain table.

`search-static.e2e.test.ts` bounded the Origin cell with the border: `toContain("│ <name> │")`.
Under `CI=true` the positive failed: CI's `check-cli` job logged it on both of the last two pushes
to main that were examined. Its two negatives, `not.toContain("│ … │")`, passed there without
checking anything, because no `│` was printed at all. Locally, with `CI`
unset, all three held. Toggling one variable at a time showed `CI` was the only cause. `TERM`, a
`claude` binary on `PATH` and `GITHUB_ACTIONS` changed nothing.

## Fix Applied

Each cell is now bounded by spaces: `toContain(" <name> ")` and the matching negatives. Both
renderers pad every cell by at least one space (the `padding` default is 1, and `search` sets
none). Every fixture id carries the marketplace name followed by `-`, so the id cell cannot match.

Red, measured 2026-10-20 against a rebuilt `dist`, with the spec run under both `CI=true` (plain)
and `CI` unset (boxed), and the mutation reverted afterwards:

- `activeSourceName` returning `agents-inc`: the positive fails in both renderings.
- `activeSourceName` returning `<real name> agents-inc e2e-test-fixture`: the positive passes, and
  each negative is the first assertion to fail in its test, in both renderings.

Green: 10/10 under both envs.

Census, 2026-10-20:

- `grep -rln 'printTable\|makeTable' packages/cli/src` returns `search.ts` alone.
- `grep -rn '│' packages/cli/e2e --include='*.ts'` returns one hit, the comment explaining this
  fix. Before the fix it returned the three assertions.

The other e2e specs that run `search` assert on cell content only.

## Proposed Standard

In `.ai-docs/standards/e2e/README.md`, beside the runner-environment paragraph: because `CI`
reaches the child, an assertion on output a dependency renders differently under CI is written
against what both renderings share, never against the decoration. `@oclif/table` drops its borders
under CI, so a table cell is bounded by whitespace, never by `│`. The census is the second grep
above.

Cross-checked against `CLAUDE.md` "NEVER broaden an assertion to make a failing test pass". There
is no conflict, because the cause was investigated and the predicate is no wider on this fixture.
It does admit one case the border form did not: the bare marketplace name as a standalone word in
another cell of the same row.

Hardening verdict: there is no honest cheap gate. `e2e-runner-environment.test.ts` scans
`process.env` reads in `src/cli` only, so it cannot see a dependency reading `env.CI`. Running a
new output spec once with `CI=true` before landing would have caught this.
