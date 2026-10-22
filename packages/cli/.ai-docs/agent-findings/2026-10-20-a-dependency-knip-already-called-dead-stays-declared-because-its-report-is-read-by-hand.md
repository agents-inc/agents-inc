---
type: standard-gap
severity: low
affected_files:
  - package.json
  - knip.jsonc
  - apps/editor/package.json
  - packages/cli/package.json
standards_docs:
  - docs/architecture.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  knip's file and dependency sections were emptied on 2026-10-20: knip.jsonc names the tool entries
  it could not find, and the dead entries are gone. Nothing holds them empty. `deps:dead` is still
  read by hand, so the next stale entry is reported only to whoever next reads it.
---

## What Was Wrong

`bun run deps:dead` (knip) is report-only. The root `package.json` note says "Not a gate: its output
is read by hand." So a dead entry it reports stays until someone acts on the report. Census of the
knip run on 2026-10-20, owned sections only:

- `gray-matter`, a published `dependency` of `packages/cli`, and
  `packages/cli/src/cli/lib/operations/types.ts`. Both were graded CONFIRMED-DEAD in
  `todo/plans/CLI-464-dead-code-baseline-2026-08-09.md`. Both were still on disk ten weeks later.
- `hono` and `server` in `apps/editor/package.json`. They were added in `e7e2169f`, when the editor
  built its hono client itself. `051dddf1` moved the client into `@workspace/api`, and the editor
  kept both entries. `bunx turbo run typecheck --filter=editor --dry=json` shows that
  `editor#typecheck` still waits for `server#build` without them, through the no-op
  `@workspace/api#build`.
- Most of the 40 "unused files" were tool entries knip did not know about, so the real dead file
  was hidden among them: the Stryker configs, every `vitest.mutation.config.ts`, the hand-run
  scripts and `stand-in-command.mjs`.

## Fix Applied

`knip.jsonc` now names the tool entries: a root `stryker` plugin config, a `vitest` plugin config
for each workspace, and entries for the hand-run scripts. It also names the false positives:
`openssl`, a regex for the status lists the mutation-ranges spec passes to `bun`, `scripts/dev.ts`
spawned with its own working directory, `@openai/codex` reached through `createRequire`, and
`prettier-plugin-tailwindcss`, which Prettier imports from its working directory. The dead entries
were removed and the unlisted ones declared. `npx knip --files --dependencies` exits 0.

Pitfall: a plugin key at the top level of `knip.jsonc` turns that plugin on in every workspace. The
check is `if (this.config[pluginName])` in `WorkspaceWorker.determineEnabledPlugins`. So a top-level
`vitest` key would load the root `vitest.config.mjs`, which exists to throw. The vitest override is
written once per workspace for that reason.

## Proposed Standard

Add `knip --files --dependencies` to `deps:check` in the root `package.json`. That is the script
`docs/architecture.md` › Gates already runs in pre-commit, pre-push and CI `check-web`. This
**conflicts with the root `//deps:dead` note** and would reverse a deliberate decision, so it is
the owner's call. The narrowed run prints one configuration hint, `src/vendor/**` "Remove from
ignore" for `packages/matrix`. That ignore exists for the export sections, which this command
leaves out. The hint does not change the exit code. Export sections stay report-only until the
per-directory sweep empties them.
