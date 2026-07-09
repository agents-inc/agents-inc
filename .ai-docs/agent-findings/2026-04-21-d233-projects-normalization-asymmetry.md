---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: Docs landed — `config-writer.md` `projects` Field Lifecycle section documents the asymmetry and cross-references this finding. Code fix pending — `registerProjectPath` still uses `fs.realpathSync` (L622) while `deregisterProjectPath` still uses `path.resolve` (L651) in `local-installer.ts`; one-line unify via cli-developer.
---

## What Was Wrong

`registerProjectPath` and `deregisterProjectPath` in
`src/cli/lib/installation/local-installer.ts` normalize the project
directory argument with DIFFERENT functions before comparing / storing:

- `registerProjectPath`: `fs.realpathSync(projectDir)` — resolves
  symlinks to the canonical absolute path.
- `deregisterProjectPath`: `path.resolve(projectDir)` — resolves to an
  absolute path but does NOT follow symlinks.

Consequence: if a user's project directory is reached via a symlink
(e.g., `~/dev/repo` → `/data/repo`), `registerProjectPath` stores
`/data/repo` in `globalConfig.projects`, but when `cc uninstall --all`
is later run from `~/dev/repo`, `deregisterProjectPath` attempts to
filter out `~/dev/repo` — which does not match — and silently no-ops.
The registration then leaks forever; it is only eventually harvested
by `registerProjectPath`'s stale-filter pass on the next project-context
write, but only if `<realpath>/.claude-src/config.ts` has also been
deleted.

This is not a new bug — it is pre-existing drift that was never
documented. It surfaces rarely (most installs do not use symlinks),
but it is a correctness gap between two functions that share a
single-writer contract over the same field.

## Fix Applied

None — discovery only. Documented the asymmetry and downstream impact
in `.ai-docs/reference/config/config-writer.md` under the new
`projects` Field Lifecycle section.

Actual code fix is a one-line change — use `fs.realpathSync` in
`deregisterProjectPath` too — but the current agent is a documentation
specialist; the fix should go through the cli-developer agent if the
user wants to prioritize it.

## Proposed Standard

Add to CLAUDE.md under "Data Integrity":

> NEVER use different normalization functions (`fs.realpathSync` vs
> `path.resolve`) on the two sides of a lookup/comparison. If one
> writer normalizes via realpath, every reader and deleter must also
> use realpath. Symlink-mismatch bugs are silent and rare, so they
> accumulate uncaught.

Cross-reference: the `registerProjectPath` / `deregisterProjectPath`
pair is the canonical example; note it in the projects-lifecycle
section of `config-writer.md` (already done).
