---
type: standard-gap
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/interactive/from-refusals-come-before-the-question.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`readTreeSnapshot` in `e2e/helpers/test-utils.ts` keeps only the FILES under a directory
(`entries.filter((entry) => entry.isFile())`), keyed by path with content and mtime. Its name says
"tree", and the refusal specs use it as the whole of their "writes nothing" claim: in
`from-refusals-come-before-the-question.e2e.test.ts`, `snapshotInstallSurfaces` snapshots the
project, `~/.claude`, `~/.agents-inc` and the Codex home, and every refusal there asserts the
snapshot is unchanged and nothing else.

A run that fails part-way through a write can leave folders and no files. Measured on CLI-936
(2026-10-26, hand-run, no terminal): `init --from` a payload carrying a skill whose id is 257
bytes printed the panel, then `Error: ENAMETOOLONG: name too long, mkdir '<home>/project/.claude/skills/external-web-tooling-aaa…'`
and exited 1, leaving `.claude/` and `.claude/skills/` in the project, both empty. The project
holds no file afterwards that it did not hold before, so `snapshotInstallSurfaces` reads the
two runs as identical. The spec's own "writes nothing" would have stayed green over that write.

This is the rule in `packages/cli/CLAUDE.md` § Test Assertions — "NEVER let a shared assertion
helper's signature overstate what it checks" — met by a helper nobody re-read against it.

## Fix Applied

None to the helper: it is shared e2e infrastructure outside the CLI-936 lane, and widening it
changes what every caller's equality means. The two new CLI-936 refusal specs for `init --from`
(at a terminal and without one) assert `directoryExists(skillsPath(env.projectDir))` is false
beside the snapshot. Watched go red against the unguarded build by moving that one assertion
directly under the run (evidence: `probe-empty-folder.log` in the lane's evidence folder) —
see the lane report for the line.

## Proposed Standard

`.ai-docs/standards/e2e/assertions.md`, beside the `readTreeSnapshot` paragraph: a snapshot built
from it proves no FILE changed, not that nothing was written. A spec claiming "writes nothing"
over a run that can fail inside a `mkdir` pairs it with the absence of the folder the run would
have created. The alternative is to record directories in the snapshot (an entry per directory,
no content); that is the stronger fix and touches every caller, so it is a change to plan, not to
make in passing. Census of callers to weigh it against: `grep -rln 'readTreeSnapshot' e2e --include='*.ts'`.
