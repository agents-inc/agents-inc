---
type: standard-gap
severity: medium
status: partial
partial_note: >-
  Standards landed. Code side half-landed, in the shape the finding listed as its Option C rather
  than its Option A - the wizard write returns a gate report instead of void, and two of the four
  commands that fan out read the skipped list off it and warn once per project, naming the path.
  Still open on the other two, which are the surfaces this finding was actually written about. The
  init and edit paths take the same report and hand it to the shared recompile reporter on the base
  command, which reads only the updated list, so a project skipped during an install or an edit is
  still invisible without the verbose flag. The wizard-write wrapper in `local-installer.ts` does
  not bind the report at all, which is why a grep for the field names does not reach that site.
affected_files:
  - src/cli/base-command.ts
  - src/cli/commands/compile.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/config-gate/index.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/operations/project/write-project-config.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
---

## Status (2026-08-19 re-derivation against source)

The two earlier status blocks were written when the subject was one function in one file. Both the
function and the file have moved, so this section is re-derived rather than amended, and it replaces
what was here.

- **Standards**: Landed, unchanged. `.ai-docs/standards/clean-code-standards.md` § 15.6 "Return
  values must be consumed or removed" codifies the rule; `.ai-docs/reference/config/config-writer.md`
  § "Propagation observability" documents the gap.
- **The subject moved.** `propagateGlobalChangesToProjects` lives in
  `src/cli/lib/config-gate/propagate.ts`, not in `local-installer.ts`. The entry point this finding
  named — the wizard write it called `writeScopedConfigs` — no longer exists under that name and
  returns a gate report rather than `void`; a spec in `src/cli/lib/__tests__/` holds the old spelling
  as its own example of a name nothing declares. The file list above is repaired to what a grep over
  the propagation result actually returns today: 29 hits in 9 files.
- **Why the repair mattered beyond accuracy.** This finding and its sibling
  (`2026-04-21-registerProjectPath-sweep-observability-gap.md`) both named `local-installer.ts` and
  nothing else, both `enforcement-gap`, both the same day, and neither cross-linked the other — the
  exact tuple a duplicate-filing scan reports. They are not duplicates; both file lists were four
  months stale in the same direction, because the module they described was split and neither
  finding was re-derived. A stale file list does not merely mislead a reader, it manufactures a
  false positive in a scan that has no way to tell which half is wrong.
- **Half the code fix shipped, and not the half proposed.** Option A was "warn at the two call
  sites"; what landed is nearer Option C. The gate returns the result up, and two commands read it:
  `compile` and `uninstall` each iterate the skipped list and warn once per project, naming the path
  through one shared message. That is stronger than the summary count Option A asked for.
- **Still open, on the two surfaces this finding was about.** `init` and `edit` receive the same
  report and pass it to the shared recompile reporter on the base command, which returns early unless
  something was UPDATED and never reads `skipped`. So the original consequence stands exactly as
  written for an install or an edit: a project whose directory was renamed, deleted or moved falls
  out of propagation, and nothing says so without `--verbose`.
- **One site is invisible to the grep**, and it is worth naming because it is the shape that hides:
  the wizard-write wrapper in `src/cli/lib/installation/local-installer.ts` calls the gate and
  discards the returned report entirely. A discarded return has no field name to search for, so
  every census written around `propagated.skipped` passes straight over it.

## What Was Wrong

_As observed on 2026-04-21 and left as written. Every path and entry-point name below is superseded
by the re-derivation above; the observation is what this section is for._

`propagateGlobalChangesToProjects` in `src/cli/lib/installation/local-installer.ts` returns `{ updated: string[]; skipped: string[] }`, but no production caller inspects `skipped`.

Both call sites in `writeScopedConfigs` bind the return value and read only `result.updated.length` / `propagation.updated.length` for a verbose-gated success log. Neither surfaces `skipped` to the command layer, to standard output, or to the exit code.

Three silent-skip branches inside the per-project loop:

1. `fileExists(projectConfigPath)` false — `config.ts` missing on disk. Emits a `verbose()` log, pushes to `skipped`, continues.
2. `loadProjectConfigFromDir(projectPath)` returns `null` / missing `config` — pushes to `skipped` with NO log, continues.
3. `loadProjectConfigFromDir` (or any nested writer) throws — caught, emits a `verbose()` log, pushes to `skipped`, continues.

`verbose()` in `src/cli/utils/logger.ts` only prints when `verboseMode` is set (via `--verbose`). Without the flag, every skip branch is invisible:

- No standard-output warning.
- No non-zero exit code (the enclosing `writeScopedConfigs` returns `void`).
- No persistent on-disk marker.
- Project stays in `globalConfig.projects` — no runtime deregistration. It will be retried on the next global write and only swept by `registerProjectPath`'s stale-filter when the project-context branch next runs (which may be never if the project is gone).

**Consequence.** A user who renames, deletes, or moves a project directory — or whose project `config.ts` fails to parse — can have every subsequent global edit silently fall out of propagation to that project. Nothing tells them. The only way to observe the skip is `--verbose` at invocation time or direct unit-test inspection of `skipped`. E2E tests that assert propagation (e.g., `e2e/lifecycle/project-tracking-propagation.e2e.test.ts`) verify `updated` side effects on disk, not `skipped`, so a regression that causes all non-current projects to skip would pass tests that only assert the current project's state.

No pre-existing ticket covers this gap:

- `todo/D-216-global-config-propagation.md` tracks propagation feature mechanics (scope defaults, `writeStandaloneConfigTypes` at project branch), not skip visibility.
- The merger gap that dropped `projects` from a HOME-context write was one reason propagation never fired at all — since closed, `mergeConfigs` now carries `existingConfig.projects` forward — and it was never about per-project skip visibility.
- The register/deregister path-normalization mismatch — since closed, both ends now normalize through a single `normalizeProjectPath` helper — was about whether a stored path matches on lookup, not about runtime-skip visibility.

## Fix Applied

Discovery only when written — documentation added under "Propagation observability" in
`.ai-docs/reference/config/config-writer.md`. Since then the per-project warning has landed on two of
the four fan-out surfaces and not on the two this finding was about; the re-derivation at the top of
this file is the current statement and this line is not.

## Proposed Standard

Pick one (in increasing order of user-visible behavior change):

**Option A — surface at command layer (lowest-risk, highest-value).** In both `writeScopedConfigs` call sites, replace the current `if (result.updated.length > 0)` verbose log with an unconditional summary when `result.skipped.length > 0`:

```ts
if (result.skipped.length > 0) {
  warn(
    `Propagation skipped ${result.skipped.length} project(s): ${result.skipped.join(", ")}. Run with --verbose for details.`,
  );
}
```

`warn()` in `src/cli/utils/logger.ts` is always-visible. This preserves exit code and all current success paths; it only adds a user-visible signal when something was skipped. No architectural change.

**Option B — auto-deregister permanently-missing paths.** When `fileExists(projectConfigPath)` is false (skip branch #1, the deterministic "project was deleted on disk" case), call `deregisterProjectPath(globalConfig, projectPath)` inline and rewrite `~/.claude-src/config.ts`. Treat `loadProjectConfigFromDir` null/throw as transient (do NOT deregister — could be a transient FS / parse issue). This plus Option A gives "silent on transient failures, self-healing on permanent loss."

Note: Option B depends on `deregisterProjectPath` actually matching the registered (realpath'd) entry, and that dependency is now satisfied. `registerProjectPath`, `deregisterProjectPath` and the current-project skip in `propagateGlobalChangesToProjects` — all in `src/cli/lib/config-gate/propagate.ts` — normalize through one `normalizeProjectPath` helper, which resolves symlinks and throws on a missing directory rather than falling back to a weaker second tier.

**Option C — bubble up as a command-layer warning.** Return the skipped count from `writeScopedConfigs` (currently `Promise<void>`) and have each oclif command (`cc init`, `cc edit`, `cc uninstall`, etc.) print a `warn()` summary. More invasive but gives each command the choice of how loudly to surface it.

### Recommended order

1. **Option A first** — trivial, unblocks user visibility immediately.
2. **Option B after D-233 lands** — self-healing for the permanent-loss case.
3. **Option C only if A+B prove insufficient** — don't thread a new return-type change unless needed.

### Where the rule belongs

Add to `.ai-docs/standards/clean-code-standards.md` under a new "Return values must be consumed or removed" bullet: functions that return a multi-field result must have every field read by at least one caller; a field that is architecturally orphaned is either (a) dead code to delete from the return type or (b) a missing observability hook. Cross-link from `.ai-docs/reference/config/config-writer.md` § Propagation observability.
