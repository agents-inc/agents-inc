---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: Documentation verified present under "Registration observability" in `.ai-docs/reference/config/config-writer.md` (lines 251-273). Code-side fix NOT applied as of 2026-04-21 re-audit — `registerProjectPath` filter loop at `src/cli/lib/installation/local-installer.ts` lines 627-632 still has zero `verbose()`/`warn()`/`log()` statements, does not compute `dropped = existing.length - valid.length`, does not return a `droppedStale` array, and the returned `changed` flag still collapses sweep+append semantics. Return signature remains `{ config, changed }` (line 621). None of Options A/B/C applied.
---

## What Was Wrong

`registerProjectPath` in `src/cli/lib/installation/local-installer.ts` sweeps stale `projects` entries (paths whose `<entry>/.claude-src/config.ts` is missing on disk) before appending the current project. The sweep is the only harvest point for stale registrations — it runs on every project-context write to the global config.

Three silent behaviors compound:

1. **No inside-loop log.** The filter loop has zero `verbose()` / `warn()` / `log()` statements. A dropped entry emits nothing.
2. **Dropped count is never computed or returned.** It exists implicitly as `existing.length - valid.length` but is not captured anywhere.
3. **Return `changed` flag is a union signal.** `changed = valid.length !== existing.length` in the "already present" branch, or unconditionally `true` in the "append" branch. The single caller (`writeScopedConfigs` project-context branch) reads `regResult.changed` into `needsGlobalWrite = globalDataChanged || regResult.changed` — it cannot distinguish "swept N stale" from "appended current path" from "both".

**Consequence.** A user whose project directory was deleted without `cc uninstall --all` (or whose `.claude-src/` was manually removed, or whose project was renamed on disk) has that entry harvested from `globalConfig.projects` on the next unrelated project-context write. Nothing tells them the registry shrank. If they later restore the directory, they must re-run `cc init` / `cc edit` from inside it to re-register — and the sweep gave no warning that this step is needed.

**Relation to the propagation observability gap** (`.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md`). Same architectural class (silent drop, no caller signal, no user-visible output), different trigger surface. Propagation silently _skips_ missing projects per-write without deregistering; `registerProjectPath` silently _deregisters_ those same entries on the next project-context write. A project that went missing experiences a skipped-propagate run first, then (potentially much later) an unnoticed sweep. Neither event produces stdout, a non-zero exit, or a persistent marker.

No pre-existing ticket covers this gap. D-216 tracks propagation mechanics. The `mergeConfigs`-drops-projects finding tracks a separate field-preservation bug. The normalization-asymmetry finding (D-233) covers register-vs-deregister path mismatch, not sweep visibility.

## Fix Applied

None — discovery only. Documentation added under "Registration observability" (sibling to "Propagation observability") in `.ai-docs/reference/config/config-writer.md`.

## Proposed Standard

Pick one (ascending order of user-visible change):

**Option A — verbose log per sweep (lowest risk).** Inside the filter loop, when `fileExists(configPath)` is false, emit `verbose(\`Sweeping stale project registration: ${p} (config not found)\`)`. Preserves exit code, adds nothing without `--verbose`. Matches the existing `propagateGlobalChangesToProjects` skip-branch logging convention.

**Option B — stdout warn on non-zero sweep count.** After the loop, compute `dropped = existing.length - valid.length`; if `dropped > 0`, emit `warn(\`Deregistered ${dropped} stale project path(s) from global config\`)`. `warn()`in`src/cli/utils/logger.ts` is always-visible. Surfaces the harvest at command-layer visibility without changing return types.

**Option C — return the dropped list.** Change the return type from `{ config, changed }` to `{ config, changed, droppedStale: string[] }`. The sole caller (`writeScopedConfigs`) can then surface the count explicitly (`if (regResult.droppedStale.length > 0) warn(...)`) and callers that care about "new append vs sweep" get a discriminable signal. Pairs naturally with the same shape change proposed for `propagateGlobalChangesToProjects` in the sibling finding's Option C.

### Recommended order

1. **Option B first** — trivial, surfaces the harvest at command-layer visibility immediately. Parallel to Option A in the propagation finding (same `warn()` pattern at the caller).
2. **Option C if both `register` and `propagate` gain similar return-shape changes** — keep the two observability surfaces discriminable and consistent.
3. **Option A only if the above are rejected** — pure verbose logging is the weakest signal (invisible without `--verbose`) and mirrors the existing weakness in propagation.

### Cross-link

The "Return values must be consumed or removed" bullet proposed in the propagation finding (`.ai-docs/standards/clean-code-standards.md`) applies symmetrically here: the `changed` flag is not orphaned, but its "sweep" and "append" meanings are conflated — callers reading `changed` have no way to recover the two cases. Either split the flag into `{ appended: boolean; swept: number }` or add `droppedStale` alongside.
