---
type: convention-drift
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/interactive/from-refusals-come-before-the-question.e2e.test.ts
  - e2e/interactive/from-refuses-an-unwritable-pair-whether-its-skill-loads.e2e.test.ts
  - e2e/interactive/init-from-lists-then-asks.e2e.test.ts
  - e2e/interactive/init-from-prints-its-panel-whole.e2e.test.ts
  - e2e/interactive/init-from-panel-keeps-long-names-whole.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-26
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`snapshotInstallSurfaces` (with its `InstallSurfaces` type) is declared inside each `--from` spec
that asserts "writes nothing at either scope", rather than once in `e2e/helpers/`. Census:
`grep -rln 'async function snapshotInstallSurfaces' e2e`. The copies have already drifted: the one
in `from-refusals-come-before-the-question` also snapshots the Codex home (`codexHome(...)`), the
others read the project, `~/.claude` and `~/.agents-inc` only, so the same claim covers different
folders depending on which spec makes it.

`packages/cli/CLAUDE.md` says to grep `e2e/helpers/` and `e2e/fixtures/` before writing an E2E
helper. Each new copy obeyed that rule's wording, because no shared helper existed, and so the
rule never asked anyone to create one.

## Fix Applied

None. CLI-987 added the fifth copy (`init-from-panel-keeps-long-names-whole`), copying
`init-from-prints-its-panel-whole`, because `e2e/helpers/` was outside that lane.

## Proposed Standard

Move one `snapshotInstallSurfaces(environment, { codex?: boolean })` into `e2e/helpers/test-utils.ts`,
or into `e2e/fixtures/dual-scope-helpers.ts` beside `createTestEnvironment`, and import it in all
five specs. Then add one clause to the E2E helper rule in `CLAUDE.md`: a helper copied into a
second spec moves to `e2e/helpers/`. Weigh it alongside
`2026-10-26-a-tree-snapshot-of-files-reads-a-refused-run-that-left-empty-folders-behind-as-one-that-wrote-nothing`,
whose fix would also land in this helper.
