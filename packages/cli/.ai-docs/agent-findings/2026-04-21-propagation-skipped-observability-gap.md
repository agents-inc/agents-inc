---
type: standard-gap
severity: medium
status: partial
partial_note: standards added (clean-code-standards § 15.6, config-writer § Propagation observability); code fix (Option A warn() at writeScopedConfigs call sites) pending
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
---

## Status (2026-04-21 residual audit)

- **Standards**: Landed. `.ai-docs/standards/clean-code-standards.md` § 15.6 "Return values must be consumed or removed" codifies the rule; `.ai-docs/reference/config/config-writer.md` § "Propagation observability" documents the gap.
- **Code fix**: NOT shipped. Both call sites in `writeScopedConfigs` (`src/cli/lib/installation/local-installer.ts` ~L784 and ~L838) still only read `result.updated.length` / `propagation.updated.length` behind `verbose()`. `skipped` is populated (L682, L690, L698, L731) and returned (L738) but never surfaced via `warn()`. Option A still owed.

## What Was Wrong

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
- `.ai-docs/agent-findings/2026-04-21-d233-projects-normalization-asymmetry.md` covers register/deregister path mismatch, not runtime-skip visibility.

## Fix Applied

None — discovery only. Documentation added under "Propagation observability" in `.ai-docs/reference/config/config-writer.md`.

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

Note: D-233 (`todo/D-233-dual-scope-spacebar-toggle.md`) already references `2026-04-21-d233-projects-normalization-asymmetry.md` — Option B should be landed after that normalization fix so `deregisterProjectPath` actually matches the registered (realpath'd) entry.

**Option C — bubble up as a command-layer warning.** Return the skipped count from `writeScopedConfigs` (currently `Promise<void>`) and have each oclif command (`cc init`, `cc edit`, `cc uninstall`, etc.) print a `warn()` summary. More invasive but gives each command the choice of how loudly to surface it.

### Recommended order

1. **Option A first** — trivial, unblocks user visibility immediately.
2. **Option B after D-233 lands** — self-healing for the permanent-loss case.
3. **Option C only if A+B prove insufficient** — don't thread a new return-type change unless needed.

### Where the rule belongs

Add to `.ai-docs/standards/clean-code-standards.md` under a new "Return values must be consumed or removed" bullet: functions that return a multi-field result must have every field read by at least one caller; a field that is architecturally orphaned is either (a) dead code to delete from the return type or (b) a missing observability hook. Cross-link from `.ai-docs/reference/config/config-writer.md` § Propagation observability.
