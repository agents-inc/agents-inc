---
type: anti-pattern
severity: low
affected_files:
  - e2e/interactive/edit-plugin-hard-error.e2e.test.ts
  - e2e/interactive/edit-eject-migration-reports-copies.e2e.test.ts
  - e2e/interactive/edit-migration-eject-to-plugin-no-marketplace.e2e.test.ts
  - e2e/interactive/edit-from-plugin-migration.e2e.test.ts
  - e2e/lifecycle/eject-migration-failure-hard-error.e2e.test.ts
  - e2e/fixtures/codex-on-path.ts
  - e2e/global-setup.ts
  - e2e/handrun-journeys.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-11-03
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  REPO-55 follow-ups (2026-11-03): the five specs remove their project folders; `e2e/global-setup.ts`
  and `withSharedFixtures` in `e2e/handrun-journeys.ts` each call the remover `installCodexOnPath`
  returns; `standards/e2e/README.md`'s `project-builder.ts` line carries the cleanup rule.
---

## What Was Wrong

A full e2e run left 8 `ai-e2e-*` folders and `agents-inc-e2e-codex-bin` in TMPDIR. This is a census:
one locked run, `--maxWorkers=4`, into an empty TMPDIR.

Every `ai-e2e-*` folder held a `project/` built by `ProjectBuilder.pluginProject`,
`localProjectWithMarketplace` or `editable`. Each of those calls `createTempDir()` itself and returns
only `<temp>/project`, so a spec never writes the `createTempDir` that the pre-commit checklist pairs
with `cleanupTempDir`. Five specs (8 tests) never removed `path.dirname(project.dir)`; they cleaned
their marketplace sources only. `eject-migration-failure-hard-error` used that folder as HOME, and
its comment on `WRITABLE_DIR` claimed a cleanup that did not exist.

`installCodexOnPath` wrote a fixed `/tmp/agents-inc-e2e-codex-bin`, and nothing removed it. Removing
it at teardown would have pulled the shim out from under a concurrent run or a hand-run, because both
write that same path.

## Fix Applied

Each of the five specs pushes `path.dirname(project.dir)` onto a `tempDirs` list as soon as the
factory returns, and its `afterEach` clears the list with `cleanupTempDir`. The codex shim is now one
`mkdtemp` folder per run. Its workers learn its path from `AGENTS_INC_E2E_CODEX_BIN`, and
`installCodexOnPath` returns the remover that globalSetup's teardown calls. Re-running the five specs
into an empty TMPDIR leaves no `ai-e2e-*` or shim folder. The `jiti`, `node-compile-cache` and
`tsx-1000` folders that remain are tool caches.

## Proposed Standard

`standards/e2e/README.md`, under fixtures: a `ProjectBuilder` factory hands its caller a folder to
remove, and the caller pushes `path.dirname(project.dir)` onto its cleanup in the same statement
group. No lint or grep would catch a regression. `eject-migration-failure-hard-error` reads
`path.dirname(project.dir)` for HOME, so a grep for that expression passes a spec that never cleans
it. Only a run into an empty TMPDIR finds a leak:
`TMPDIR=<empty> bun run test:e2e --filter=agents-inc --env-mode=loose`, then `ls -A "$TMPDIR"`.
