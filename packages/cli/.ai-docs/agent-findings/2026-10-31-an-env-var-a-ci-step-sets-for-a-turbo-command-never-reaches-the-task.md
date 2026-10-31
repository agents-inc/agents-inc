---
type: missing-standard
severity: medium
affected_files:
  - .github/workflows/ci.yml
  - turbo.json
standards_docs:
  - docs/architecture.md
date: 2026-10-31
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: >-
  check-cli's unit step passes `--env-mode=loose`, so the TMPDIR it sets reaches vitest. No written
  rule says an env var set for a turbo-run command needs that, or a `passThroughEnv` entry.
---

## What Was Wrong

The planned fix for "nothing in CI runs the CLI unit suite with a symlinked temp folder" set
`TMPDIR` on the check-cli step running `bun run test --filter=agents-inc`, which is `turbo test`.
Turbo 2's default strict env mode hands a task only the variables `turbo.json` declares, and this
repository declares no `TMPDIR`, so the step would have stayed green whatever the specs did, and
nothing reports the drop. A direct `npx vitest run` with `TMPDIR` set does see it, which is how the
row's own evidence was taken.

Measured 2026-10-31, turbo 2.10.8 (the repository's `node_modules/.bin/turbo`), `<folder>` a real
directory and `<folder>-link` a symlink to it:

- A throwaway workspace whose task prints `process.env.TMPDIR`: strict printed
  `TMPDIR=undefined tmpdir=/tmp`; `--env-mode=loose`, and separately `passThroughEnv: ["TMPDIR"]`,
  printed the link.
- Here, with `vitest.setup.ts`'s default HOME put back to a raw `mkdtemp` under `os.tmpdir()` and
  `TMPDIR` at the link: `bun run test --filter=agents-inc -- --maxWorkers=4
src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts` passed, "Tests 3 passed (3)";
  `bun run test --filter=agents-inc --env-mode=loose -- --maxWorkers=4` failed that spec (Expected
  `<folder>`, Received `<folder>-link`), "Test Files 1 failed | 332 passed (333)". Unmutated, the
  loose command gave "Test Files 333 passed (333)".

## Fix Applied

check-cli runs `bun run test --filter=agents-inc --env-mode=loose` with `TMPDIR` at
`$RUNNER_TEMP/tmp-link`, a symlink the step before it makes.

## Proposed Standard

`docs/architecture.md` -> "Gates": an env var a CI step or hook sets for a command that runs turbo
reaches the task only through `--env-mode=loose`, the task's `env` / `passThroughEnv`, or
`globalPassThroughEnv`; show it arriving with a mutant that reddens only when it does. No conflict
found with either `CLAUDE.md` or the standards.
