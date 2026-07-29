---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-07-25
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`registerProjectPath` and `deregisterProjectPath` (both in
`src/cli/lib/installation/local-installer.ts`) normalize the project path with
_different_ functions:

- `registerProjectPath` stores `fs.realpathSync(projectDir)` in the global
  config's `projects` array (resolves symlinks).
- `deregisterProjectPath` filters that array using `path.resolve(projectDir)`
  (does NOT resolve symlinks).

On Linux (and any layout where the project root has no symlinked ancestor)
`path.resolve(process.cwd())` already equals the realpath, so the two agree and
deregistration works. But where a symlink sits above the project root — most
notably macOS, whose `/tmp` is a symlink to `/private/tmp` — the stored realpath
and `path.resolve` diverge. `deregisterProjectPath` then finds no matching entry,
returns early, and the project is silently left in the registry.

This became load-bearing for D-274 requirement 4 ("project uninstall removes the
project's path from the global config's `projects` registry"). The behavior is
correct on the CI/dev Linux platform but is a latent silent no-op on macOS — the
exact "registry keeps propagating into an uninstalled project" failure the ticket
set out to prevent.

## Fix Applied

None — discovery only. D-274 shipped project deregistration by default and its
E2E coverage passes on Linux (`e2e/commands/uninstall-manifest-removal.e2e.test.ts`,
`e2e/lifecycle/uninstall-reinit-lifecycle.e2e.test.ts`,
`e2e/lifecycle/project-tracking-propagation.e2e.test.ts`). Changing the shared
`deregisterProjectPath` normalization was out of the ticket's scope, so it is
recorded here rather than silently altered.

## Proposed Standard

`deregisterProjectPath` should normalize with `fs.realpathSync(projectDir)` to
match `registerProjectPath` (falling back to `path.resolve` only if the path no
longer exists on disk). More generally: a value written to config under one
normalization must be read/filtered back under the _same_ normalization — this
belongs as an explicit note in `.ai-docs/reference/config/config-writer.md`
("Registration observability" section) alongside the existing stale-filter
guidance, so future edits to either half keep them symmetric.
