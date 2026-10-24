---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/installation/install-layout.ts
  - packages/cli/src/cli/hooks/init.ts
  - packages/cli/src/cli/lib/__tests__/helpers/cli-runner.ts
  - packages/cli/src/cli/lib/__tests__/commands/old-claude-src-folder.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e-testing-bible.md
date: 2026-10-24
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-968. The init hook calls forgetTheProviderChosenForThisRun() first, so every run through
  dist/ starts with no provider chosen. Pinned by a-provider-one-run-names-is-not-the-next-runs.test.ts
  (no reset reddens both rows, a reset after the old-folder line reddens the second), and by the
  reset's removal from TEST_ONLY_EXPORTS. CLI-967's row dropped its ordering and retry constraints
  and still fails both attempts against a hook that ignores argv.
---

## What Was Wrong

A member of `2026-10-22-a-provider-a-dist-run-names-outlives-its-spec-and-the-source-reset-cannot-reach-it`
(open) that its first proposal cannot cover. oclif loads the `init` hook from `./dist/hooks/init`
(`package.json`), so a hook spec has only the `runCliCommand` route. There, dist's
`providerChosenForThisRun` outlives the run that named it, and every later run in the worker reads
it: the old-folder line included.

Two consequences, both measured:

- **A spec can pass against the defect it is written for.** Before CLI-967 the hook read each root
  through `providerInUse`. So `init --from … --provider codex` printed `claude` in a fresh process,
  and `codex` wherever an earlier run in the worker had named codex. The cli-tester swapped the
  control twin ahead of the subject in "on the init --from run that names the provider it
  installs". The result was `11 passed` against the defect. With the `commands` project's
  `retry: 1`, the first attempt failed and the retry passed.
- **It survives CLI-967.** The hook now reads `--provider` off argv, but a run naming none still
  falls back to `providerInUse(root)`. Reproduced in one worker after the fix, in a Claude project
  holding `.claude-src/`:
  - `list`: the line names `.agents-inc/claude/` (the control);
  - `list --provider codex`: it names `.agents-inc/codex/`;
  - `list` again: it names `.agents-inc/codex/`.

  A fresh process names claude for the third run, as for the first.

So that row carries constraints it cannot enforce: it must be the worker's first `--provider` run,
it must take `retry: 0`, and it must be the last row in its file.

## Fix Applied

None. CLI-967's mechanism (argv in the hook) makes a run's own `--provider` immune. It does not
help a run that names none.

## Proposed Standard

The existing finding offers two options. This member rules out its first one (import the command
from source) for any spec of a hook, which leaves the reset that reaches `dist/`. Either:

- the `init` hook calls `forgetTheProviderChosenForThisRun()` before anything else. That is a
  no-op in production, where a process is one run. The function's `TEST_ONLY_EXPORTS` entry in
  `tested-exports-reach-production.test.ts` would then go.
- or `runCliCommand` imports dist's `install-layout.js` and resets it in `finally`.

Until one lands, record in `e2e-testing-bible.md`, or wherever command-spec conventions live, that
a hook spec over `--provider` is guarded by its e2e twin, since each e2e run is a fresh process.
Checked against CLAUDE.md: no conflict.
