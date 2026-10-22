---
type: standard-gap
severity: low
affected_files:
  - vitest.mutation.config.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`READS_SOURCE_TEXT` in `vitest.mutation.config.ts` keeps out of every Stryker run the specs that
read source text, because in Stryker's sandbox they read instrumented source. Its comment says it
was found "by recording every read of a mutated file made in a test worker during a plain run". The
recording was not committed, and nothing re-runs it.

The REPO-44 lanes then split mixed spec files and deleted one. Re-measured on 2026-10-21 by
recording the reads again over all CLI test files (a census), the 26-entry list held:

- one file no longer on disk (`edit-decides-scope-once.test.ts`);
- twelve files that no longer read any mutated file: the seven `scripts/` checker specs whose
  repository half moved into an `-against-this-repository` or `-against-this-package` file, and five
  `src/cli/lib` specs whose source-reading half moved into a new file (`e2e-runner-environment`,
  `config-gate-enforcement`, `config-types-agent-defs-agree`, `home-dir-read-at-call-time`,
  `config-types-writer`);
- and it lacked the twelve files those halves moved into.

Every listed-but-ordinary spec was left out of mutation runs for nothing. Every unlisted
source-reading spec ran against instrumented source. `e2e-runner-rosters-match-the-tree` went red in
a Stryker dry run for that reason.

No gate notices either half. A missing file in a vitest `exclude` is silently ignored.

## Fix Applied

The list is now exactly the 25 specs the recording found reading a mutated file, plus the new
`fast-glob-imports-are-funnelled.test.ts`, which lints with type information and so reads source.
The recorder was a scratch vitest setup file that wraps `fs` reads, records each path under
`packages/cli/src` with `__vitest_worker__.filepath`, and filters to Stryker's `mutate` set. Two
other kinds of read were judged not source text: `config-loader.test.ts` loads `config-exports.ts`
through jiti, which runs the code, and the command specs read `dist/*.js.map`. Child processes are
outside the recording; none of the spawning specs reads mutated source.

## Proposed Standard

`docs/architecture.md` › Mutation testing: re-measure `READS_SOURCE_TEXT` whenever a spec that reads
source text is split, renamed or deleted, with the recorder committed as a script beside
`run-mutation-summary.ts`. A spec that every entry names a file on disk would catch the deleted-file
half cheaply. Nothing cheap catches a file that stopped reading source; only the recording does.
Committing a script is a new workflow, so this is the owner's call.
