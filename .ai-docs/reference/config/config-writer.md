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
    resolveEffectiveGlobalConfig,
    buildCompileAgents,
    buildAgentScopeMap,
    config-to-compile-bridge,
    formatSectionedUnion,
    collectCustomDomains,
    buildSkillsByCategory,
    computeRemovedGlobalSkillIds,
    retainReconciledStack,
  ]
related:
  - reference/config/configuration.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-07-30
---

# Config Writer (Detailed)

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Extracted from:** `reference/features/configuration.md` (Config Writer and Config Types Writer sections).

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. Generates TypeScript source strings from `ProjectConfig`.

| Function                                 | Purpose                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generateConfigSource()`                 | Main entry: generates config.ts source string                                                                                                    |
| `writePartialProjectConfig()`            | Writes a `Partial<ProjectConfig>` to `.claude-src/config.ts`, filling `skills`/`agents` defaults; optional `fallbackName` invents a missing name |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)                                                                                                               |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)                                                                                                      |
| `ensureBlankGlobalConfig()`              | Creates blank global config at `~/.claude-src/` if missing                                                                                       |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`                                                                                                        |

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

### Union Emission Internals

The four narrowed unions (`SkillId`, `AgentName`, `Domain`, `Category`) in a standalone `config-types.ts` are rendered by a shared formatting stack in `config-types-writer.ts`. Each union is split into a **Custom** group and a **Marketplace** group and annotated with `// Custom` / `// Marketplace` section comments so a reader can tell user-authored entities apart from marketplace-installed ones.

| Function                                                        | Contract                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatMaybeSectionedUnion(members, isCustom)`                  | Entry point per union. Empty → `EMPTY_UNION_TYPE`. No custom members → plain `formatUnion` (keeps single-line form while `quoted.length < MULTI_LINE_THRESHOLD`, = 6). Any custom members → `formatSectionedUnion`. |
| `formatSectionedUnion(custom, marketplace)`                     | Emits section comments. One group present → single header (`// Custom` **or** `// Marketplace`) with that group's members. Both groups present → custom block first, then marketplace block, always multi-line.     |
| `collectCustomDomains(matrix, customCategorySet, extraDomains)` | Applies the subtraction rule (below); returns the set of domains treated as custom.                                                                                                                                 |
| `buildSkillsByCategory(skillIds, categories, matrix)`           | Groups eligible skills into `Map<Category, SkillId[]>` for `generateStackAgentConfig`.                                                                                                                              |

`generateConfigTypesSource` first computes `customSkillSet`, `customAgentSet`, and `customCategorySet` (a member is custom when its matrix entry has `custom === true`, or it was passed as an `extras.*` addition), then calls `formatMaybeSectionedUnion` once per union with the matching membership predicate.

**`collectCustomDomains` — the subtraction rule.** A domain is custom only if it NEVER appears on a non-custom (marketplace) category. The function partitions matrix categories into marketplace (`!customCategorySet.has(key)`) and custom, collects the marketplace categories' domains into `marketplaceDomains`, then keeps only custom-category domains absent from that set. Explicitly-passed `extraDomains` are always folded in as custom. This prevents a domain that spans both a marketplace and a custom category from being mislabelled custom.

**`buildSkillsByCategory` — eligibility filter.** For each skill id it looks up `matrix.skills[id]?.category` and keeps only entries whose category is defined, is not `LOCAL_PSEUDO_CATEGORY` (`"local"` in `consts.ts`), and is in the passed `categories` set, then groups by category. The result drives `generateStackAgentConfig`, which emits a per-category-constrained `StackAgentConfig` — or the loose `STACK_AGENT_CONFIG_LOOSE_LINE` when the map is empty.

**`EMPTY_UNION_TYPE` handling.** The module-level constant `EMPTY_UNION_TYPE = "never"` is returned by `formatUnion`, `formatMaybeSectionedUnion`, and `formatSectionedUnion` for an empty member list. `never` is the union identity element: an empty install accepts no member, and a project union that extends an empty global union (`never | "web-framework-react"`) still narrows correctly. Emitting `string` instead would absorb every literal and silently disable type-checking of the generated `config.ts`. This matches `generateBlankGlobalConfigTypesSource`, which emits `never` for the same empty state.

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

This rule was hardened under task D-228 (project-branch types must use `regenerateConfigTypes`, not `writeStandaloneConfigTypes`).

## `writeScopedConfigs` Branches

The function has a single top-level fork on `isProjectContext`. Every downstream branch below sits under one of the two top halves.

### Context detection — `projectInstallationExists` is a context flag, not a disk check

Both `writeScopedConfigs` and its upstream callers compute the "does a project installation exist?" signal via `!isHomeDirectory(projectDir)`, whose body is the symlink-resolved comparison (with a plain-string fallback when a path cannot be resolved):

```
fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir())
```

It is computed at these call sites in `local-installer.ts` / `write-project-config.ts`:

- `writeScopedConfigs` computes it locally as `isProjectContext` (shadowing the passed-in `projectInstallationExists` for the global-vs-project fork — see "Parameter redundancy" below).
- `installPluginConfig` and `installEject` each compute it as `isProjectInstall` and thread it through `writeConfigAndCompileAgents` into the `projectInstallationExists` parameter.
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

Taken when `projectDir === $HOME`. Up to three actions:

1. `writeConfigFile(finalConfig, projectConfigPath)` — writes `~/.claude-src/config.ts` as a standalone config (no `globalConfig` option, so no inlining preamble).
2. `writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig)` — writes `~/.claude-src/config-types.ts`.
3. If `finalConfig.projects?.length`, call `propagateGlobalChangesToProjects` (no `currentProjectDir` — every registered project gets the propagation).

**Step 3 is now reachable (was previously gated by a merger bug):** `mergeConfigs` used to drop the `projects` field from merged configs, so `cc edit` at HOME left `finalConfig.projects` `undefined`, the guard was falsy, and home-context propagation never fired. `mergeConfigs` now preserves `existingConfig.projects` (see [config-merger.md](./config-merger.md) → "`projects` Field Preservation" and finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`), so a `cc edit` at HOME whose merged config carries registered projects does reach `propagateGlobalChangesToProjects`.

### Project-context branch (`isProjectContext`)

Taken when `projectDir !== $HOME`. Splits the final config by scope and handles global and project halves separately.

**Global half** (steps 3–4 are delegated to the `resolveEffectiveGlobalConfig` helper, which returns `{ config, globalDataChanged, changed }`; step 2's load runs in `writeScopedConfigs` and is passed into the helper as `existingGlobalConfig`):

1. `splitConfigByScope(finalConfig)` → `{ global, project }`. Global half = entries with `scope === "global"`. See [scope-split.md](./scope-split.md) for the full partition rules (tombstone routing, stack partitioning, delta pipeline).
2. Load existing global config via `loadProjectConfigFromDir(homeDir)` (in `writeScopedConfigs`, before calling the helper).
3. In `resolveEffectiveGlobalConfig`: if the global split has skills/agents, merge them into the existing global via `mergeGlobalConfigs` (deep-additive, never removes; also fill-only for `marketplace`/`source` — see [config-merger.md](./config-merger.md)); when there are no global items the existing config is used unchanged (`changed: false`). Tracks `globalDataChanged` (= the merge's `changed`).
4. Still in the helper: `registerProjectPath(mergedConfig, projectDir)` — adds the current project to the global `projects` array (normalized via `fs.realpathSync`, stale entries filtered). `needsGlobalWrite = globalDataChanged || registration.changed`.
5. If `needsGlobalWrite`, `ensureDir` then write `~/.claude-src/config.ts` via `writeConfigFile` and `~/.claude-src/config-types.ts` via `writeStandaloneConfigTypes`.
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

1. `writeScopedConfigs` home-context branch — fires on home edits when `finalConfig.projects?.length`. Reachable now that `mergeConfigs` preserves `projects` (see below).
2. `writeScopedConfigs` project-context branch — fires on project edits that change global data (`globalDataChanged`). `projectDir` is passed as `currentProjectDir` so the current project is skipped (it is already being written in the enclosing flow).

**Per-project loop logic:**

- **Skip current project.** If `currentProjectDir` is set and `projectPath === fs.realpathSync(currentProjectDir)`, `continue` (no push).
- **Skip if stale.** `fileExists(projectConfigPath)` guard — if `<projectPath>/.claude-src/config.ts` is missing, the project is pushed to `skipped` and verbose-logged (not deregistered; stale entries accumulate until `registerProjectPath` filters them on the next global write).
- **Skip if load fails.** `loadProjectConfigFromDir(projectPath)` returning null (pushed, `continue`) or throwing (caught, pushed, verbose-logged) skips the project.
- **Reconcile the project split against the new global data.** `projectSplit` is the loaded project config with four fields reconciled — it is NOT a simple project-owned filter:
  - `skills`: `retainProjectOwnedSkills` — keeps project-scoped entries and drops any global tombstone whose masked global is no longer active (`globalHasActiveSkill`).
  - `agents`: `retainProjectOwnedAgents` — same rule for agents (`globalHasActiveAgent`).
  - `stack`: `retainReconciledStack` — prunes assignments referencing a global skill just removed at global scope (`computeRemovedGlobalSkillIds` from `projectConfig.skills` vs the new `globalConfig`); untouched projects get byte-identical output.
  - `selectedAgents`: `retainReconciledSelectedAgents` — drops names not backed by a project-owned active agent or a still-active global agent.
- **Self-heal, then re-mask.** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` drops masks whose collision has cleared (`dropOrphanedDerivedMasks` for skills, `dropOrphanedDerivedAgentMasks` for agents — D-277) and then re-derives masks for live global entries the project still collides with (`maskCollidingGlobalSkills` / `maskCollidingGlobalAgents`). Self-heal runs first on both axes so a cleared collision is removed rather than immediately re-derived.
- **Overwrite config.ts.** `writeConfigFile(projectSplit, projectConfigPath, { isProjectConfig: true, globalConfig })` — re-inlines the new global data.
- **Overwrite config-types.ts.** `regenerateConfigTypes(projectPath, Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)), buildProjectTypesExtras(projectSplit, matrix))` — emits the import-from-global form with project-only extras.

### Stack reconciliation — `computeRemovedGlobalSkillIds` + `retainReconciledStack` (D-233 Scenario C)

The `stack` field of `projectSplit` is not a simple filter — it is reconciled against the now-current global data so a project-scoped agent stops referencing a global skill that was just removed at global scope. Two helpers do this:

- `computeRemovedGlobalSkillIds(priorProjectSkills, globalConfig)` — returns the skill ids the project inherited from global scope that are **no longer active at global scope** AND that the project does **not** own at project scope. It keys on the pre-reconciliation `projectConfig.skills`: a just-removed global skill still appears there as a `scope: "global"`, non-excluded entry (the signal). Project-scoped skills and user-authored local skills (which carry no `SkillConfig` entry at all) are never in the set, so both are always preserved.
- `retainReconciledStack(stack, removedGlobalSkillIds)` — drops only assignments whose `id` is in `removedGlobalSkillIds`; every other assignment is kept verbatim, in order, with its `preloaded` flag untouched. Categories and agents left empty by the pruning are removed.

**Byte-identical-for-unaffected-projects invariant.** `retainReconciledStack` early-returns the **same** `stack` reference when `!stack || removedGlobalSkillIds.size === 0`. A propagation triggered by a global change that removes no skill the project references therefore yields an identical `stack` object, and the re-emitted `config.ts` is byte-for-byte unchanged. Only projects that actually referenced a removed global skill see a diff. This is what lets a single global edit fan out across every registered project without churning configs that were not affected.

**What it rewrites:** only the two `.claude-src/*.ts` files (`config.ts` + `config-types.ts`). It never touches the project's `.claude/skills/` tree.

**Known Limitation — compiled agents are not recompiled (D-240):** propagation is config-only. A registered project's compiled `.claude/agents/<name>.md` still embeds a removed global skill until that project is next edited/installed/compiled directly. The persisted `config.ts` (source of truth) and the compiled artifact drift until then. Tracked as `todo/TODO.md` D-240; see finding `.ai-docs/agent-findings/2026-07-18-propagation-skips-agent-recompile.md`.

**Dependency on `projects` field.** The whole flow is gated on `globalConfig.projects`. The array is maintained exclusively by `registerProjectPath` (during project-context writes in `writeScopedConfigs`) and `deregisterProjectPath` (called from `cc uninstall`-style flows). `mergeConfigs` now preserves `projects` from the existing config, so a home-context `cc edit` retains a `finalConfig.projects` array and the home-context propagation guard fires. The project-context branch was always reachable because it reads `projects` off `effectiveGlobalConfig`, which is built from a `...existing` spread that preserves the field.

## `projects` Field Lifecycle

The `projects: string[]` field on the GLOBAL `ProjectConfig` at `~/.claude-src/config.ts` is the registry of every project directory that has invoked `cc init` / `cc edit` and triggered a global write. It drives `propagateGlobalChangesToProjects` — the per-project types/config fan-out on global edits. Only two functions read or write the field, and both sit in `src/cli/lib/installation/local-installer.ts`.

### Ownership

| Function                           | Operation             | Trigger                                                                   | Persists field? |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------- | --------------- |
| `registerProjectPath`              | Append + stale-filter | `writeScopedConfigs` project-context branch (every project-context write) | Yes             |
| `deregisterProjectPath`            | Remove                | `cc uninstall --all` (`src/cli/commands/uninstall.tsx`)                   | Yes             |
| `propagateGlobalChangesToProjects` | Read-only             | Post-global-write in `writeScopedConfigs` (both branches)                 | No              |

No other code in the project writes `globalConfig.projects`. `generateConfigSource` in `config-writer.ts` strips `projects` from PROJECT config output via the shared `cleanForEmission(config, { dropProjects })` helper — a single `delete cleaned.projects` gated on `dropProjects`. The two project-config writers pass `dropProjects: true` (the inlined-global path cleans BOTH the project config and the inlined global snapshot; the global-import path cleans the project config), while the standalone writer passes `dropProjects: false`. The field is therefore emitted only in the GLOBAL (standalone) config source.

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

**No pre-existing ticket covers this observability gap.** D-216 (`todo/D-216-global-config-propagation.md`) tracks the propagation feature mechanics (scope defaults, `writeStandaloneConfigTypes`-vs-`regenerateConfigTypes` at project branch). The `mergeConfigs`-drops-projects finding (`.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md`, now fixed — see `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`) tracked one historical reason home-context propagation did not fire, but not the missing signal when per-project skips occur. The normalization-asymmetry finding (`.ai-docs/agent-findings/2026-04-21-d233-projects-normalization-asymmetry.md`) covers a register/deregister path mismatch, not the runtime-skip visibility. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md` for the proposed remediation options.

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

### `projects` Preservation Across the Merge Paths

`mergeConfigs` in `src/cli/lib/configuration/config-merger.ts` builds `const merged = { ...newConfig }` and copies `existingConfig.projects` forward via `if (existingConfig.projects && !newConfig.projects)`. `newConfig` originates from `buildEjectConfig`, which never sets `projects`, so the guard always fires when the existing global config had registrations. Every write path now preserves the field.

| Write path                                  | Goes through `mergeConfigs`?                                           | `projects` preserved? | Propagation reachable? |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------- | ---------------------- |
| `writeScopedConfigs` project-context global | No — uses `mergeGlobalConfigs` with `{ ...existing, ... }` spread      | Yes (via spread)      | Yes                    |
| `writeScopedConfigs` home-context           | Yes — `buildAndMergeConfig → mergeConfigs` before `writeScopedConfigs` | Yes (guard copies it) | Yes                    |
| `registerProjectPath` output                | No — direct `{ ...globalConfig, projects: [...] }` spread              | Yes                   | n/a (writes only)      |
| `deregisterProjectPath` output              | No — direct `{ ...existingGlobal.config, projects: filtered }` spread  | Yes                   | n/a                    |

`register`/`deregister` load GLOBAL config fresh from disk via `loadProjectConfigFromDir(homeDir)`, spread the full loaded object, overwrite only `projects`, and call `writeConfigFile` directly — they never invoke `mergeConfigs`.

**History:** the home-context path previously dropped `projects` in `mergeConfigs`, making the `if (finalConfig.projects?.length)` propagation guard vacuously falsy for a `cc edit` at HOME. That is fixed (finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`); the earlier D-228 "vacuous pass" E2E workaround in `.ai-docs/agent-findings/2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md` is the historical record.

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

## Config-to-Compile Bridge — `buildCompileAgents` / `buildAgentScopeMap`

**File:** `src/cli/lib/installation/local-installer.ts`

After `writeScopedConfigs` persists `config.ts`, the same final `ProjectConfig` is converted into the shape the agent compiler consumes. Both helpers are called from the shared install tail `writeConfigAndCompileAgents`: `buildCompileAgents(finalConfig, agents)` fills `CompileConfig.agents`, and `buildAgentScopeMap(finalConfig)` is threaded into `compileAndWriteAgents`. This is the bridge from the persisted config (source of truth) to the compiler's per-agent skill inputs.

### `buildCompileAgents(config, agents)`

Returns `Record<string, CompileAgentConfig>` (`CompileAgentConfig = { skills?: SkillReference[] }`, `src/cli/types/config.ts`). It emits one entry per **active** agent — `config.agents` filtered to `!excluded`, then further filtered to names present in the loaded `agents` record. For each agent it reads `config.stack?.[name]`; a missing stack yields `{}` (no skills). Otherwise it expands the stack via `buildSkillRefsFromConfig` (`src/cli/lib/resolver.ts`, returns `SkillReference[]`) and applies two filters plus one enrichment:

| Step                      | Rule                                                                                                                                                                                                                                   | Predicate / source                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Exclusion filter          | Drop refs whose id is in `effectivelyExcludedSkillIds(config.skills)`.                                                                                                                                                                 | `effectivelyExcludedSkillIds` (`scope-predicates.ts`) |
| D7 cross-scope safety net | A `scope === "global"` agent only keeps refs whose id is in `globalSkillIds` (`config.skills` active at `"global"`), so a global agent never carries a project-only skill. Project-scoped agents keep all non-excluded refs.           | `isActiveAt(s, "global")` (`scope-predicates.ts`)     |
| D-217 per-skill `source`  | Each surviving ref gets `source: sourceById.get(ref.id)` from a `Map<SkillId, string>` built off `config.skills`. Missing entries are intentional — user-authored local skills have no `SkillConfig` and legitimately carry no source. | `SkillReference.source` (`src/cli/types/skills.ts`)   |

The per-skill `source` lets the compiler choose, per skill, between plugin ref format (`${id}:${id}`) and a bare id (eject) — `"eject"` means the skill is ejected to `.claude/skills/`, any other value (a marketplace name) means plugin-installed.

### `buildAgentScopeMap(config)`

Thin wrapper returning `activeAgentScopeMap(config.agents)` (`scope-predicates.ts`) — a `Map<AgentName, SkillScope>` of active (non-excluded) agents to their scope. Passed to `compileAndWriteAgents` so the compiler resolves each agent's skills against the correct (project vs global) install path.
