---
type: convention-drift
severity: low
affected_files:
  - .husky/pre-commit
  - .husky/pre-push
  - packages/cli/scripts/pre-push-hook.test.ts
  - packages/cli/scripts/check-vitest-collects-every-test.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-31
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  Both hooks now run deps:check when a staged or pushed file is a *.test.ts or *.test.tsx, and
  pre-push-hook.test.ts and pre-commit-hook.test.ts each run their hook and pin that for a CLI and
  an app test file beside non-test controls. Pending: the Proposed Standard (a new deps:check step
  adds its file kinds to both hooks' trigger and a row to each spec in the same change) is written
  nowhere, and nothing checks that the trigger covers every file kind a deps:check step reads.
---

## What Was Wrong

`check-vitest-collects-every-test.ts` joined `bun run deps:check` and judges every `*.test.ts(x)`
outside `e2e/`. Both hooks decide whether to run `deps:check` from a hand-kept regex over the staged
or pushed paths (`run_deps` in `.husky/pre-commit` and `.husky/pre-push`), which listed manifests,
`bun.lock`, tsconfig, vitest and eslint configs only. So a commit or push adding nothing but an
uncollected test file passed both hooks, and only CI's `deps:check` refused it. The comment beside
each regex ("These files feed the cross-workspace checks wherever they sit") became false the day the
check landed, and nothing reported it.

Shown by running `.husky/pre-commit` at HEAD under `sh -e` with stand-ins for `git`, `bun` and
`bunx`, staging one file at a time: `source-validator.test.ts` and `skill-cell.test.tsx` gave
`deps_check=no`, `apps/editor/vitest.config.ts` gave `deps_check=yes`.

## Fix Applied

Added `|[^/]+\.test\.tsx?` to the final group of both `run_deps` regexes and reworded both comments
to "The cross-workspace checks read these files wherever they sit". `pre-push-hook.test.ts` gained
two rows (a CLI `.test.ts`, an app `.test.tsx`, each expecting `deps:check` before its side), red
before the hook change and green after; the existing "a change to the CLI" and "a change to an app"
rows are their non-test controls. `docs/architecture.md`'s pre-commit row names a test file as a
trigger.

## Proposed Standard

When a step is added to `deps:check`, the file kinds it reads join both hooks' `run_deps` regex and
get a row in `pre-push-hook.test.ts` in the same change. The cheap guard for pre-commit is a spec
mirroring `pre-push-hook.test.ts` (same stand-ins, `STAGED_FILES` in place of `PUSHED_FILES`); none
exists. No honest gate can derive the trigger from the checks, since each check's inputs live in its
own code, so the pairing is a rule a reviewer holds. Belongs beside the gates table in
`docs/architecture.md` if adopted.
