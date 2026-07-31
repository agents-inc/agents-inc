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
status: superseded
superseded_by: 2026-07-25-register-deregister-path-normalization-asymmetry.md
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

## Closure Note (amended 2026-07-30)

**This finding is closed and superseded. Everything above is a historical
record of the 2026-04-21 state; do not act on it.**

The defect is fixed. `normalizeProjectPath()` — a module-private helper in
`src/cli/lib/installation/local-installer.ts` wrapping `fs.realpathSync` — is
now called by `registerProjectPath`, `deregisterProjectPath`, AND the
current-project skip in `propagateGlobalChangesToProjects`, so the rule has
exactly one implementation and no second one to drift against.

Three corrections to what this file used to claim:

1. **The former `partial_note` was false.** It stated "Code fix pending —
   `registerProjectPath` still uses `fs.realpathSync` while
   `deregisterProjectPath` still uses `path.resolve`". That stopped being true
   when the fix shipped; the note was removed rather than rewritten, because
   `partial_note:` is a claim about what is pending _right now_, and there is
   nothing pending.
2. **Its source line numbers were removed.** The note pinned `L622` / `L651`.
   Both had moved, and line numbers in `.ai-docs/` are against project
   convention — doubly so inside a lifecycle field a reader takes as current
   state.
3. **`status:` moved `partial` → `superseded`,** paired with `superseded_by:`
   per `TEMPLATE.md` rule 3. The duplicate — filed independently three months
   later against the same file and the same two functions — is
   `2026-07-25-register-deregister-path-normalization-asymmetry.md`, which
   carries the authoritative Resolution Note. The pair was never linked until
   now, which is why closing one left this one asserting a live bug.

**The Proposed Standard above was adopted in spirit but NOT verbatim, and the
divergence is deliberate.** The fix has no `path.resolve` fallback tier:
`normalizeProjectPath` throws when the directory does not exist. A two-tier
resolution chain is banned by CLAUDE.md's Data Integrity rule, and building one
inside the very helper written to unify the rule is where the asymmetry would
have grown back. The one caller that must survive the throw (`uninstall`'s
deregistration) already wraps it in a warn-and-continue guard. Do NOT "restore"
a fallback believing it was overlooked — see
`2026-07-30-finding-proposed-standard-contradicted-a-never-rule.md`.

Why this file is kept rather than deleted: the findings directory is
append-and-amend. It is cited by name from
`.ai-docs/reference/config/config-writer.md` and from the sibling finding;
moving or removing it breaks those links silently.

Meta-finding on how this stayed stale for the whole gap:
`2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved.md`.
