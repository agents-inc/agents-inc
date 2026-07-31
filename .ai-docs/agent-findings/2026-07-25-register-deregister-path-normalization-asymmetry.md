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
status: resolved
resolved_by: normalizeProjectPath() extracted in local-installer.ts and called by both ends — see Resolution Note below
supersedes: 2026-04-21-d233-projects-normalization-asymmetry.md
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

## Resolution Note (2026-07-30)

`normalizeProjectPath()` was extracted in
`src/cli/lib/installation/local-installer.ts`. `registerProjectPath`,
`deregisterProjectPath`, and the current-project skip in
`propagateGlobalChangesToProjects` all call it, so the rule has exactly one
implementation.

**The Proposed Standard above was deliberately NOT adopted verbatim.** Its
parenthetical — fall back to `path.resolve` when the path no longer exists — is a
multi-tier resolution chain, which CLAUDE.md forbids. `normalizeProjectPath` lets
a non-existent path throw instead; the one caller that must survive it
(`uninstall`'s deregistration) already wraps the call in a warn-and-continue
guard. Do not "restore" the fallback believing it was overlooked. See
`2026-07-30-finding-proposed-standard-contradicted-a-never-rule.md`.

**Docs — DONE (verified 2026-07-30).** Both passages flagged here have since been
rewritten in `.ai-docs/reference/config/config-writer.md`. "`deregisterProjectPath`
— removal semantics" now states the normalization as `normalizeProjectPath` /
`fs.realpathSync`, and the callout beneath it reads "Normalization asymmetry —
CLOSED. Do not reintroduce it." A new "Path normalization — `normalizeProjectPath`"
subsection under `projects` Field Lifecycle carries the three call sites, the
no-fallback-tier rationale, and a where-the-throw-lands table. Nothing is pending
on the doc side.

**Duplicate linked (2026-07-30).** This finding supersedes
`2026-04-21-d233-projects-normalization-asymmetry.md` — an independent report of
the identical defect in the same file, filed three months earlier. It sat at
`status: partial` asserting the code fix was still pending long after this one was
resolved, because nothing in the findings pipeline compares lifecycle status
_between_ findings over the same symbol. It is now `superseded`, and the pair is
linked in both directions. See
`2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved.md` for the
proposed pipeline rule.
