---
type: standard-gap
severity: low
affected_files:
  - apps/server/package.json
  - apps/editor/src/lib/api/configs.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: rule-not-visible
status: open
---

## What Was Wrong

`apps/server/package.json` exports its types from `./dist/index.d.ts` (gitignored, written by the
server's `build`), and `@workspace/api`'s `hc<AppType>` reaches the worker through it. After
`SEED_VERSION` went from 6 to 7, `tsc -b --noEmit` run inside `apps/editor` reported
`Type '7' is not assignable to type '6'` at `api.configs.$post` in `src/lib/api/configs.ts` — an
error in the editor's own call naming the old contract, while every source file said 7. `turbo run
typecheck` hides it, because `typecheck` depends on `^build`. Running the workspace's own script,
as `docs/architecture.md` says suites are run, does not rebuild the server first.

## Fix Applied

None in the tree. `bun run build` in `apps/server` rewrote the declarations and the error went.

## Proposed Standard

`docs/architecture.md` -> Tests, or the editor's typecheck note: after a change to anything the
worker's routes type (the seed contract, a route), rebuild `apps/server` or typecheck through turbo;
a type error naming the previous shape is a stale `dist/`, not a defect. A cheaper guard is an
editor `pretypecheck` that builds the server, at the cost of a build per typecheck. No conflict with
`CLAUDE.md`.
