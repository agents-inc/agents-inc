---
scope: reference
area: config
keywords:
  [
    config-writer,
    generateConfigSource,
    generateProjectConfigWithInlinedGlobal,
    config-types-writer,
    scope-split,
    global-config,
    writeScopedConfigs,
    propagateGlobalChangesToProjects,
    buildProjectTypesExtras,
    projectInstallationExists,
  ]
related:
  - reference/config/configuration.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-04-21
---

# Config Writer (Detailed)

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Extracted from:** `reference/features/configuration.md` (Config Writer and Config Types Writer sections).

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. Generates TypeScript source strings from `ProjectConfig`.

| Function                                 | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| `generateConfigSource()`                 | Main entry: generates config.ts source string              |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)                         |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)                |
| `ensureBlankGlobalConfig()`              | Creates blank global config at `~/.claude-src/` if missing |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`                  |

The `generateConfigSource()` function accepts an optional `ConfigSourceOptions` parameter:

- When `isProjectConfig: true` (no `globalConfig`): generates a config that imports from the global config and spreads global arrays into skills, agents, and domains.
- When `isProjectConfig: true` with `globalConfig` provided: generates a self-contained config snapshot via `generateProjectConfigWithInlinedGlobal()`. Both global and project entries for the same skill ID are preserved (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`. Excluded global entries (tombstones) replace their active global counterparts in the global section while the active project entry appears separately in the project section. Stack entries are filtered to project-scoped agents only.

## Config Types Writer

**File:** `src/cli/lib/configuration/config-types-writer.ts`

Generates `config-types.ts` files with typed union types narrowed to installed items.

| Function                             | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `generateConfigTypesSource()`        | Generate standalone config-types.ts from matrix   |
| `generateProjectConfigTypesSource()` | Generate project config-types.ts extending global |
| `regenerateConfigTypes()`            | Full regeneration with background matrix loading  |
| `loadConfigTypesDataInBackground()`  | Kick off background matrix/agent loading          |
| `getGlobalConfigTypesPath()`         | Check if global config-types.ts exists            |

When a global installation exists, project `config-types.ts` imports from global and extends with project-only types. Types are narrowed to only installed items (not the full matrix).

## Writer Selection Rule

When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the global install root), call `regenerateConfigTypes`. When writing a GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), call `writeStandaloneConfigTypes` / `generateConfigTypesSource` directly. Never call `writeStandaloneConfigTypes` for a project path — it bypasses the import-from-global branch in `regenerateConfigTypes` and produces duplicated standalone unions.

Call sites in `src/cli/lib/installation/local-installer.ts`:

| Write site                                                       | Target path                                   | config.ts writer                      | config-types.ts writer       |
| ---------------------------------------------------------------- | --------------------------------------------- | ------------------------------------- | ---------------------------- |
| `writeScopedConfigs` — home-context branch (`!isProjectContext`) | `~/.claude-src/config.ts` + types             | `writeConfigFile`                     | `writeStandaloneConfigTypes` |
| `writeScopedConfigs` — project-context global write              | `~/.claude-src/config.ts` + types             | `writeConfigFile`                     | `writeStandaloneConfigTypes` |
| `writeScopedConfigs` — project-context project write             | `<projectDir>/.claude-src/config.ts` + types  | `writeConfigFile` (w/ `globalConfig`) | `regenerateConfigTypes`      |
| `propagateGlobalChangesToProjects` — per-project loop            | `<projectPath>/.claude-src/config.ts` + types | `writeConfigFile` (w/ `globalConfig`) | `regenerateConfigTypes`      |

`writeStandaloneConfigTypes` is a private helper. Only the two global-types write sites above invoke it; no code outside `local-installer.ts` calls it.

`regenerateConfigTypes` calls are fed already-loaded matrix/agent data via helpers in `local-installer.ts`:

- `buildConfigTypesBackgroundData(matrix, agents)` — wraps loaded matrix + agents into `ConfigTypesBackgroundData` (no re-load).
- `buildProjectTypesExtras(finalConfig, matrix)` — derives project-only `extraSkillIds`, `extraAgentNames`, `extraCategories`, `extraDomains` from the project-scoped entries of the final config.

See finding `.ai-docs/agent-findings/2026-04-20-d228-writeStandaloneConfigTypes-project-branch.md` for the drift that motivated this rule.

## `writeScopedConfigs` Branches

The function has a single top-level fork on `isProjectContext`. Every downstream branch below sits under one of the two top halves.

### Context detection — `projectInstallationExists` is a context flag, not a disk check

Both `writeScopedConfigs` and its upstream callers compute the "does a project installation exist?" signal the same way:

```
fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir())
```

This is evaluated three times in `local-installer.ts` / `write-project-config.ts`:

- `writeScopedConfigs` computes it locally as `isProjectContext` (shadowing the passed-in `projectInstallationExists` for the global-vs-project fork — see "Parameter redundancy" below).
- `installPluginConfig` computes it and passes it in as `projectInstallationExists`.
- `installEject` computes it and passes it in as `isProjectContext`.
- `writeProjectConfig` (operations layer, `src/cli/lib/operations/project/write-project-config.ts`) computes it as `isProjectContext` and passes it in.

**This is a context flag, not a disk check.** It returns `true` whenever `projectDir !== $HOME` after symlink resolution, regardless of whether `.claude-src/config.ts` actually exists on disk. A fresh `cc init` in a brand-new project directory sets the flag to `true` before any config file has been written. The variable name suggests disk presence but the implementation is "we are running inside a project, not from home".

Consequences for the `writeScopedConfigs` project-context skip branch:

```
if (projectInstallationExists || hasProjectItems) { /* write project config */ }
else { /* skipped */ }
```

In production the flag is always `true` for any `cc init` / `cc edit` invoked from a project directory — which is the only way to reach the `writeScopedConfigs` project-context path in the first place. The `else` branch is effectively unreachable from production entry points: if `isProjectContext` is `false`, the function returned in the home-context branch above; if `isProjectContext` is `true`, `projectInstallationExists` is also `true` (same computation), so the guard short-circuits. The `|| hasProjectItems` half of the guard exists for unit tests that call `writeScopedConfigs` directly with a mocked-out `projectInstallationExists = false` to exercise the project-items-only path.

**Debugger's trap:** if you are trying to observe the skip branch firing in a real scenario and cannot, it is because the flag is context-derived and always `true` in project-context calls. The skip branch is test-theatre surface area, not a runtime switch.

### Home-context branch (`!isProjectContext`)

Taken when `projectDir === $HOME`. Two actions:

1. `writeConfigFile(finalConfig, projectConfigPath)` — writes `~/.claude-src/config.ts` as a standalone config (no `globalConfig` option, so no inlining preamble).
2. `writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig)` — writes `~/.claude-src/config-types.ts`.
3. If `finalConfig.projects?.length`, call `propagateGlobalChangesToProjects` (no `currentProjectDir` — every registered project gets the propagation).

**Known bug gating step 3:** `mergeConfigs` drops the `projects` field from merged configs (see finding `2026-04-18-mergeConfigs-drops-projects-field.md`). This means `cc edit` at HOME goes through `buildAndMergeConfig → mergeConfigs`, the merged `finalConfig.projects` is `undefined`, the guard is falsy, and propagation silently never fires. The home-context propagation path is therefore unreachable in production until that merger bug is fixed. The only path that currently exercises `propagateGlobalChangesToProjects` is the project-context branch below, which reads `projects` off `effectiveGlobalConfig` (built via `...existing` spread that preserves the field).

### Project-context branch (`isProjectContext`)

Taken when `projectDir !== $HOME`. Splits the final config by scope and handles global and project halves separately.

**Global half:**

1. `splitConfigByScope(finalConfig)` → `{ global, project }`. Global half = entries with `scope === "global"`. See [scope-split.md](./scope-split.md) for the full partition rules (tombstone routing, stack partitioning, delta pipeline).
2. Load existing global config via `loadProjectConfigFromDir(homeDir)`.
3. If new global items exist, merge them via `mergeGlobalConfigs` (deep-additive, never removes — see [config-merger.md](./config-merger.md)). Tracks `globalDataChanged`.
4. `registerProjectPath(effectiveGlobalConfig, projectDir)` — adds the current project to the global `projects` array (normalized via `fs.realpathSync`, stale entries filtered).
5. If `globalDataChanged || regResult.changed`, write `~/.claude-src/config.ts` via `writeConfigFile` and `~/.claude-src/config-types.ts` via `writeStandaloneConfigTypes`.
6. If `globalDataChanged && effectiveGlobalConfig.projects?.length`, call `propagateGlobalChangesToProjects(..., projectDir)` — the `projectDir` argument ensures the current project is skipped in the loop.

**Project half:**

7. If `projectInstallationExists || hasProjectItems`, write `<projectDir>/.claude-src/config.ts` via `writeConfigFile` with `isProjectConfig: true, globalConfig: effectiveGlobalConfig` (triggers `generateProjectConfigWithInlinedGlobal`).
8. Same guard: write `<projectDir>/.claude-src/config-types.ts` via `regenerateConfigTypes` using `buildConfigTypesBackgroundData` + `buildProjectTypesExtras`.
9. Else: verbose-log "Skipped project config".

### Parameter redundancy

The `projectInstallationExists` parameter is computed the same way as `isProjectContext` inside the function. In production it is always redundant with the local `isProjectContext`. It is retained because:

- Unit tests in `local-installer.test.ts` mock `fs.realpathSync` to force the home-context and project-context branches independently of the passed-in flag.
- The `|| hasProjectItems` escape hatch in the project-half guard lets tests exercise the "project items only, no installation" path without faking disk state.

## `propagateGlobalChangesToProjects`

**Purpose:** After a global-scope change, rewrite every registered project's `config.ts` (re-inlined global snapshot) and `config-types.ts` (import-from-global form).

**Callers (two write sites):**

1. `writeScopedConfigs` home-context branch — fires on home edits when `finalConfig.projects?.length`. **Currently unreachable in production** due to the `mergeConfigs` drops-projects bug.
2. `writeScopedConfigs` project-context branch — fires on project edits that change global data. `projectDir` is passed as `currentProjectDir` so the current project is skipped (it is already being written in the enclosing flow).

**Per-project loop logic:**

- **Skip if stale.** `fileExists(projectConfigPath)` guard — if `<projectPath>/.claude-src/config.ts` is missing, the project is skipped (not deregistered; stale entries accumulate until `registerProjectPath` filters them on the next global write).
- **Skip if load fails.** `loadProjectConfigFromDir(projectPath)` returning null or throwing pushes the path onto `skipped` and continues.
- **Project split.** `projectSplit` = the loaded project config filtered via `isProjectOwnedEntry` (keeps `scope === "project"` entries and `scope === "global"` entries with `excluded: true` — i.e., project-local tombstones over global items).
- **Overwrite config.ts.** `writeConfigFile(projectSplit, projectConfigPath, { isProjectConfig: true, globalConfig })` — re-inlines the new global data.
- **Overwrite config-types.ts.** `regenerateConfigTypes(projectPath, bgData, buildProjectTypesExtras(projectSplit, matrix))` — emits the import-from-global form with project-only extras.

**What it never touches:** project-owned scope entries (preserved via `projectSplit`), the project's `.claude/skills/` tree, agent markdown. Only the two `.claude-src/*.ts` files are rewritten.

**Dependency on `projects` field.** The whole flow is gated on `globalConfig.projects`. The array is maintained exclusively by `registerProjectPath` (during project-context writes in `writeScopedConfigs`) and `deregisterProjectPath` (called from `cc uninstall`-style flows). `mergeConfigs` does not preserve `projects` from the existing config when merging against a new project config (see finding `2026-04-18-mergeConfigs-drops-projects-field.md`). Result: a home-context `cc edit` passes a `finalConfig` with `projects: undefined` into `writeScopedConfigs`, so the home-context propagation guard is falsy and the loop never runs. The project-context branch is unaffected because it reads `projects` off `effectiveGlobalConfig`, which is built from a `...existing` spread that preserves the field.

## `projects` Field Lifecycle

The `projects: string[]` field on the GLOBAL `ProjectConfig` at `~/.claude-src/config.ts` is the registry of every project directory that has invoked `cc init` / `cc edit` and triggered a global write. It drives `propagateGlobalChangesToProjects` — the per-project types/config fan-out on global edits. Only two functions read or write the field, and both sit in `src/cli/lib/installation/local-installer.ts`.

### Ownership

| Function                           | Operation             | Trigger                                                                   | Persists field? |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------- | --------------- |
| `registerProjectPath`              | Append + stale-filter | `writeScopedConfigs` project-context branch (every project-context write) | Yes             |
| `deregisterProjectPath`            | Remove                | `cc uninstall --all` (`src/cli/commands/uninstall.tsx`)                   | Yes             |
| `propagateGlobalChangesToProjects` | Read-only             | Post-global-write in `writeScopedConfigs` (both branches)                 | No              |

No other code in the project writes `globalConfig.projects`. `generateConfigSource` in `config-writer.ts` strips `projects` from PROJECT configs via three `delete cleanedX.projects` / `delete cleaned.projects` calls — the field is emitted only in the GLOBAL config source.

### `registerProjectPath` — stale-filter semantics

Normalization: `fs.realpathSync(projectDir)` — resolves symlinks.

Stale-filter pass: before appending, every entry in the existing `projects` list is tested with `fileExists(<entry>/.claude-src/config.ts)`. Missing files are dropped. This is the only place stale entries are collected — they accumulate in the global config across sessions and are swept on the next project-context write.

Append rule:

- If the normalized current path is already in the filtered list, skip the append. `changed` is true iff any stale entry was removed this pass.
- Otherwise append the normalized path. `changed` is always true.

The stale filter does not warn, error, or deregister — it silently drops. A project that was deleted on disk without `cc uninstall` has its global registration harvested on the next unrelated project write.

### `deregisterProjectPath` — removal semantics

Normalization: `path.resolve(projectDir)` — does NOT resolve symlinks.

**Normalization asymmetry.** `registerProjectPath` uses `fs.realpathSync`, `deregisterProjectPath` uses `path.resolve`. If the project directory is a symlink, the registered entry (realpath) will not match the deregister input (symlink-unresolved), and the deregister becomes a no-op. In practice CI and home installs rarely use symlinks, but a `~/dev/repo` → `/data/repo` symlink setup will leak registrations forever. See finding `2026-04-21-d233-projects-normalization-asymmetry.md`.

Filter rule: removes any `projects` entry equal to the normalized path. Writes the updated global config only if the filter actually shortened the array. Early-returns silently if no global config exists or `projects` is empty.

Does NOT touch `propagateGlobalChangesToProjects` — deregistration is a pure removal and does not rebuild other projects' configs.

### `propagateGlobalChangesToProjects` — filter/skip semantics

Per entry in `globalConfig.projects`:

| Condition                                            | Action                                                        | Observable                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `projectPath === currentNormalized`                  | Skip (no pushed entry)                                        | Silent (it is already being written in the enclosing flow) |
| `<projectPath>/.claude-src/config.ts` missing        | Push to `skipped`, verbose-log                                | Verbose only                                               |
| `loadProjectConfigFromDir(projectPath)` returns null | Push to `skipped`, continue                                   | Silent                                                     |
| `loadProjectConfigFromDir` throws                    | Push to `skipped`, verbose-log, continue                      | Verbose only                                               |
| Load succeeds                                        | Write both `config.ts` + `config-types.ts`, push to `updated` | Verbose only                                               |

The function never throws and never deregisters stale entries — a skipped project remains in `globalConfig.projects` until `registerProjectPath` sweeps it on the next project-context write. The two sets are returned as `{ updated: string[]; skipped: string[] }` but no caller in production inspects `skipped`; only the `updated.length > 0` branch emits a verbose log.

### Propagation observability

**`skipped` is returned but never consumed.** Both call sites in `writeScopedConfigs` (home-context branch and project-context branch) bind the return value and read only `result.updated.length` / `propagation.updated.length` to emit a verbose success log. Neither call site references `result.skipped` or surfaces it at any higher layer. Grep for `propagateGlobalChangesToProjects` confirms these are the only two production callers; the rest are test invocations in `local-installer.test.ts`.

**Per-branch user-visible signal.** `verbose()` only prints when the user passed `--verbose`. Without that flag, every skip branch is invisible and the process exit code is unaffected — the enclosing `writeScopedConfigs` returns `void` regardless of skip count.

| Skip branch                                                         | `verbose()` log line                                                        | User-visible without `--verbose` | Exit code impact | Return-value signal          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- | ---------------- | ---------------------------- |
| `fileExists(projectConfigPath)` false (config.ts missing on disk)   | `"Skipped propagation to ${projectPath} (config not found)"`                | No                               | None             | Pushed to `skipped`, ignored |
| `loadProjectConfigFromDir` returns `null`/no `config`               | None — push-and-`continue` with no log                                      | No                               | None             | Pushed to `skipped`, ignored |
| `loadProjectConfigFromDir` throws (or any writer throws downstream) | `"Failed to propagate to ${projectPath}: ${message}"` (caught)              | No                               | None             | Pushed to `skipped`, ignored |
| Happy path — writes succeed                                         | `"Propagated global changes to ${projectPath}"` + aggregate count at caller | No                               | None             | Pushed to `updated`          |

**What this means for the user.** A project that fell out of propagation — whether because its directory was deleted, its config was manually removed, or the config file parse failed mid-update — produces no standard-output warning, no non-zero exit, and no persistent marker. The project remains in `globalConfig.projects` (the per-loop skip does NOT deregister), so it will be retried on the next global write. The stale-filter sweep in `registerProjectPath` harvests entries whose `config.ts` is missing but only on the _next_ project-context write, not at propagation time.

**What this means for a debugger.** Reproducing a silent-skip requires `--verbose` or direct inspection of `skipped` in a unit test. E2E tests that assert propagation succeeded (e.g., `e2e/lifecycle/project-tracking-propagation.e2e.test.ts`) verify `updated` side effects on disk, not `skipped`. A regression that causes all registered projects to silently skip would pass every test that only checks `updated` for the current project and the exit code.

**Gap summary.** There is no standard-output warning, no non-zero exit, no persistent marker, and no E2E assertion that a skipped project fell out of propagation. The `skipped` array exists in the type signature but is architecturally orphaned.

**No pre-existing ticket covers this observability gap.** D-216 (`todo/D-216-global-config-propagation.md`) tracks the propagation feature mechanics (scope defaults, `writeStandaloneConfigTypes`-vs-`regenerateConfigTypes` at project branch). The `mergeConfigs`-drops-projects finding (`.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md`) tracks one reason propagation never fires but not the missing signal when per-project skips occur. The normalization-asymmetry finding (`.ai-docs/agent-findings/2026-04-21-d233-projects-normalization-asymmetry.md`) covers a register/deregister path mismatch, not the runtime-skip visibility. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md` for the proposed remediation options.

### Registration observability

Same architectural class as Propagation observability above (silent drop, caller cannot distinguish, no user signal), different trigger surface. `registerProjectPath`'s stale-filter sweep harvests `projects` entries whose `<entry>/.claude-src/config.ts` is missing on disk. The sweep is the only place stale entries are collected — it runs on every project-context write to global config.

**What gets dropped.** Any `projects` entry whose joined `<entry>/<CLAUDE_SRC_DIR>/<STANDARD_FILES.CONFIG_TS>` fails `fileExists`. Cause is deterministic-only: the config file is absent from disk. Causes in practice: project directory deleted without `cc uninstall --all`, `.claude-src/` manually removed, or path renamed on disk after registration.

**How many are dropped.** The count is computed implicitly as `existing.length - valid.length` but is never stored, returned, or logged. The returned `changed` flag collapses "N stale entries swept" and "current path was appended" into a single boolean — callers cannot distinguish a sweep from an append.

**User-visible signal.**

| Surface                                              | Signal on sweep                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside-loop log (`verbose()` / `warn()`)             | None — the filter has zero log statements                                                                                                   |
| Return value                                         | Dropped count not returned; `changed` is a union of "swept" + "appended"                                                                    |
| Caller (`writeScopedConfigs` project-context branch) | Reads only `regResult.changed` as part of `needsGlobalWrite = globalDataChanged \|\| regResult.changed`. Never branches on sweep-vs-append. |
| Standard output                                      | None                                                                                                                                        |
| Exit code                                            | None — `writeScopedConfigs` returns `void`                                                                                                  |
| Persistent marker                                    | None — the entry is removed from the next-written global config silently                                                                    |

**What this means for the user.** A project that fell off disk is harvested from `globalConfig.projects` on the next unrelated project-context write. Nothing tells the user the registry shrank. If the user later restores the project directory or moves it back, they must re-run `cc init` / `cc edit` from inside it to re-register — the stale sweep gives no warning that this step is needed.

**What this means for a debugger.** There is no way to observe the sweep from outside without diffing `globalConfig.projects` across writes. The `changed: true` return value fires for both "appended normalized path" and "swept N stale entries" and the writer runs unconditionally in either case, so inspecting the write path cannot localize the cause.

**Relation to propagation observability.** The two observability gaps are complementary: `propagateGlobalChangesToProjects` silently skips per-project when `config.ts` is missing but never deregisters; `registerProjectPath` silently deregisters those same entries on the next project-context write. A project that went missing experiences a skipped-propagate run first, then (potentially much later) an unnoticed sweep. Neither event produces a user-visible signal. See finding `.ai-docs/agent-findings/2026-04-21-registerProjectPath-sweep-observability-gap.md` for the remediation options.

### Interaction with the `mergeConfigs`-drops-projects bug

`mergeConfigs` in `src/cli/lib/configuration/config-merger.ts` returns `{ ...newConfig, ...preservedFields }` but does not preserve `existingConfig.projects`. `newConfig` originates from `buildEjectConfig` which never sets `projects`. Result: any path that routes a global write through `mergeConfigs` drops the field.

| Write path                                  | Goes through `mergeConfigs`?                                           | `projects` preserved? | Propagation reachable? |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------- | ---------------------- |
| `writeScopedConfigs` project-context global | No — uses `mergeGlobalConfigs` with `{ ...existing, ... }` spread      | Yes (via spread)      | Yes                    |
| `writeScopedConfigs` home-context           | Yes — `buildAndMergeConfig → mergeConfigs` before `writeScopedConfigs` | No                    | No (guard is falsy)    |
| `registerProjectPath` output                | No — direct `{ ...globalConfig, projects: [...] }` spread              | Yes                   | n/a (writes only)      |
| `deregisterProjectPath` output              | No — direct `{ ...existingGlobal.config, projects: filtered }` spread  | Yes                   | n/a                    |

Why `register`/`deregister` are immune: both load GLOBAL config fresh from disk via `loadProjectConfigFromDir(homeDir)`, spread the full loaded object, overwrite only `projects`, and call `writeConfigFile` directly. They never invoke `mergeConfigs`. The merger drop only bites the home-context edit path where `buildAndMergeConfig` is the entry point.

**Downstream impact.** The home-context propagation guard `if (finalConfig.projects?.length)` is currently unreachable in production for any global edit performed via `cc edit` at HOME — `finalConfig.projects` is `undefined` post-merge. See D-228 Scenario B "vacuous pass" and the E2E workaround documented in `.ai-docs/agent-findings/2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md`.

## `buildProjectTypesExtras`

**Purpose:** Derive the four extras that `regenerateConfigTypes` needs to extend the global unions with project-only additions.

**Filters.** Input is `finalConfig` (the full cross-scope config, not the project split). The function selects `scope === "project" && !excluded` entries from both `skills` and `agents`. Excluded tombstones are dropped — their type should still flow in from the global union, not be re-declared as a project-local extra.

**Derivation rules:**

| Extra             | Source                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `extraSkillIds`   | `unique(projectSkills.map(s => s.id))`                                                                        |
| `extraAgentNames` | `unique(projectAgents.map(a => a.name))`                                                                      |
| `extraCategories` | `unique(projectSkills.map(s => matrix.skills[s.id]?.category).filter(c => c !== undefined && c !== "local"))` |
| `extraDomains`    | `unique(projectCategories.map(c => matrix.categories[c]?.domain).filter(d => d !== undefined))`               |

**Category/domain derivation via matrix lookup.** Categories and domains are not stored on `SkillConfig` — they are attributes of the matrix entry keyed by skill ID. The derivation walks:

```
project SkillConfig.id  -->  matrix.skills[id].category  -->  matrix.categories[category].domain
```

The `"local"` category is excluded because it is a catch-all sentinel, not a real narrowed type. A project skill whose matrix entry is absent (optional-chaining to `undefined`) is silently dropped — in practice all project skill IDs should resolve against the merged matrix, and absence indicates a stale config; the silent drop is defensive.

The `extraDomains` derivation is category-sourced, not skill-sourced: it maps over `projectCategories` (already deduped and de-"local"'d), not over `projectSkills`. A domain is included iff at least one project-scoped skill belongs to a category in that domain.

## `buildConfigTypesBackgroundData`

Simple passthrough wrapper. Accepts an already-loaded `matrix` and `agents` record, returns `ConfigTypesBackgroundData` = `{ matrix, agentNames, customAgentNames }` where:

- `agentNames = typedKeys(agents)`
- `customAgentNames = agentNames.filter(name => agents[name]?.custom === true)`

`regenerateConfigTypes` accepts its background data as a promise. The two project-types call sites in `local-installer.ts` wrap the synchronous helper output in `Promise.resolve(...)` because no background loading is needed — the caller has already resolved the matrix and agents for use in the enclosing `writeScopedConfigs` flow.
