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
    reconcileProjectSplitAgainstGlobal,
    maskCollidingGlobalSkills,
    maskCollidingGlobalAgents,
    dropOrphanedDerivedMasks,
    buildProjectCollisionTest,
    isExclusiveCategory,
    regenerateScopeConfigTypes,
    pruneGlobalEntriesFromRegisteredProjects,
    ScopedConfigWriteResult,
    recompilePropagatedProjectAgents,
    normalizeProjectPath,
  ]
related:
  - reference/config/configuration.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-07-30
---

<!--
re-validated 2026-07-30 (product 0.146.0): corrected "writeScopedConfigs returns void" -> it returns
ScopedConfigWriteResult { propagatedProjects } (D-240); corrected "skipped is returned but never consumed"
-> the uninstall path now warns per skipped project via registeredProjectUpdateSkipped (D-274); added the
third production caller of propagateGlobalChangesToProjects (pruneGlobalEntriesFromRegisteredProjects);
closed the D-240 "compiled agents are not recompiled" Known Limitation with the recompile pipeline that
shipped; corrected deregisterProjectPath's trigger (`uninstall --all` is removed — a project uninstall
always deregisters); added regenerateScopeConfigTypes + the compile/uninstall/new-* config-types write
sites to the writer-selection table; added the D-279 reconciliation write-site inventory and recorded that
hasProjectItems is computed from the RECONCILED project config; refreshed the normalization-asymmetry
finding reference to the 2026-07-25 entry.
-->

<!--
2026-07-30 (incremental correction, same day): the register/deregister path-normalization asymmetry
was FIXED in local-installer.ts. Corrected deregisterProjectPath's normalization (`path.resolve` ->
the new module-private normalizeProjectPath helper, fs.realpathSync); rewrote the "Normalization
asymmetry (open)" callout as CLOSED-with-invariant rather than deleting it (documentation-bible
Known Limitations re-validation clause: a closed limitation removed outright gets silently
reintroduced); added a "Path normalization — normalizeProjectPath" section owning the rule for all
three projects[] registry sites, the deliberate no-fallback-tier decision (the 2026-07-25 finding's
proposed path.resolve fallback was NOT adopted — CLAUDE.md bans multi-tier resolution fallbacks),
and the verified throw trace into executeUninstall's pre-existing warn-and-continue guard;
downgraded the symlinked-no-op stale-sweep cause to historical-only.
-->

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
| `regenerateScopeConfigTypes` — home leg                          | `~/.claude-src/config-types.ts`               | (none — types only)                   | `writeStandaloneConfigTypes` |
| `regenerateScopeConfigTypes` — project leg                       | `<projectDir>/.claude-src/config-types.ts`    | (none — types only)                   | `regenerateConfigTypes`      |

`writeStandaloneConfigTypes` is a private helper. Only the three global-types write sites above invoke it; no code outside `local-installer.ts` calls it.

### `regenerateScopeConfigTypes` — the scope-dispatching entry point

```
regenerateScopeConfigTypes(projectDir, config, matrix, agents)
  isHomeDirectory(projectDir) → writeStandaloneConfigTypes(getProjectConfigPath(projectDir), matrix, agents, config)
  otherwise                   → regenerateConfigTypes(projectDir, Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)), buildProjectTypesExtras(config, matrix))
```

It exists so a caller holding a persisted `ProjectConfig` and nothing else applies the D-228 selection rule without re-deriving it. Exported from `local-installer.ts` and re-exported by `src/cli/lib/installation/index.ts`.

### Config-types write sites outside `local-installer.ts`

| Caller                                                       | Target                                         | Writer                       | Notes                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `Compile.refreshConfigTypes` (`src/cli/commands/compile.ts`) | the compiling pass's scope                     | `regenerateScopeConfigTypes` | Once per pass, including the `totalSkillCount === 0` early return. Failure warns. |
| `uninstall.tsx` → `pruneGlobalEntriesFromRegisteredProjects` | every registered project                       | `regenerateConfigTypes`      | Runs AFTER the global manifest removal so project types fall back to standalone.  |
| `src/cli/commands/new/skill.ts`                              | `<projectDir>/.claude-src/config-types.ts`     | `regenerateConfigTypes`      | Feature-gated command; passes the just-created skill as `extras`.                 |
| `src/cli/commands/new/agent.tsx`                             | `<projectDir>/.claude-src/config-types.ts`     | `regenerateConfigTypes`      | Feature-gated command; passes the just-created agent as `extras`.                 |
| `src/cli/commands/new/marketplace.ts`                        | `<marketplaceDir>/.claude-src/config-types.ts` | `regenerateConfigTypes`      | Feature-gated command; no extras.                                                 |

All five obey the rule by construction — none calls `writeStandaloneConfigTypes` (it is not exported).

`regenerateConfigTypes` calls are fed already-loaded matrix/agent data via helpers in `local-installer.ts`:

- `buildConfigTypesBackgroundData(matrix, agents)` — wraps loaded matrix + agents into `ConfigTypesBackgroundData` (no re-load).
- `buildProjectTypesExtras(finalConfig, matrix)` — derives project-only `extraSkillIds`, `extraAgentNames`, `extraCategories`, `extraDomains` from the project-scoped entries of the final config.

This rule was hardened under task D-228 (project-branch types must use `regenerateConfigTypes`, not `writeStandaloneConfigTypes`).

## `writeScopedConfigs` Branches

**Signature:** `writeScopedConfigs(finalConfig, matrix, agents, projectDir, projectConfigPath, projectInstallationExists): Promise<ScopedConfigWriteResult>`
where `ScopedConfigWriteResult = { propagatedProjects: string[] }` — the registered project directories this write's propagation rewrote. It is **not** `void`: the caller owns recompiling those projects' agents, because propagation touches only `.claude-src/*.ts` (D-240; see "Propagated-project recompilation" below).

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
3. If `finalConfig.projects` is empty or absent, return `{ propagatedProjects: [] }`. Otherwise call `propagateGlobalChangesToProjects` (no `currentProjectDir` — every registered project gets the propagation) and return `{ propagatedProjects: result.updated }`.

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

7. `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` → `reconciledProjectConfig`. Without this the raw split goes straight to the inlining writer and a project-owned skill plus a colliding live global install both land as active entries (D-279 — see "Cross-Scope Reconciliation" below).
8. `hasProjectItems` is computed from the **reconciled** config (`reconciledProjectConfig.skills.length > 0 || reconciledProjectConfig.agents.length > 0`), not from the raw split — reconciliation only ever adds mask rows, so it can flip the guard true but never false.
9. If `projectInstallationExists || hasProjectItems`, write `<projectDir>/.claude-src/config.ts` via `writeConfigFile(reconciledProjectConfig, ...)` with `isProjectConfig: true, globalConfig: effectiveGlobalConfig` (triggers `generateProjectConfigWithInlinedGlobal`).
10. Same guard: write `<projectDir>/.claude-src/config-types.ts` via `regenerateConfigTypes` using `buildConfigTypesBackgroundData` + `buildProjectTypesExtras(finalConfig, matrix)`. Note the extras are derived from `finalConfig` (the full cross-scope config), not from `reconciledProjectConfig`.
11. Else: verbose-log "Skipped project config".
12. Return `{ propagatedProjects }` (populated at step 6, otherwise `[]`).

### Parameter redundancy

The `projectInstallationExists` parameter is computed the same way as `isProjectContext` inside the function. In production it is always redundant with the local `isProjectContext`. It is retained because:

- Unit tests in `local-installer.test.ts` mock `fs.realpathSync` to force the home-context and project-context branches independently of the passed-in flag.
- The `|| hasProjectItems` escape hatch in the project-half guard lets tests exercise the "project items only, no installation" path without faking disk state.

## `propagateGlobalChangesToProjects`

**Purpose:** After a global-scope change, rewrite every registered project's `config.ts` (re-inlined global snapshot) and `config-types.ts` (import-from-global form).

**Callers (three production sites):**

1. `writeScopedConfigs` home-context branch — fires on home edits when `finalConfig.projects?.length`. Reachable now that `mergeConfigs` preserves `projects` (see below).
2. `writeScopedConfigs` project-context branch — fires on project edits that change global data (`globalDataChanged`). `projectDir` is passed as `currentProjectDir` so the current project is skipped (it is already being written in the enclosing flow).
3. `pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)` — the global-uninstall fan-out (D-274). It re-enters this same function with an EMPTIED global config (`{ ...globalConfig, skills: [], agents: [], selectedAgents: [] }`) and no `currentProjectDir`, so every global skill/agent reads as removed: inlined global rows and their tombstones drop out, `selectedAgents` and per-agent stack refs lose their global-only names/ids, and each project's `config-types.ts` is regenerated. `selectedAgents` must be emptied alongside the arrays because the project writer re-unions the global `selectedAgents` into the project's. Called from `uninstall.tsx::updateRegisteredProjects` AFTER the global `.claude-src` manifest is removed, so the regenerated project types fall back to the standalone form instead of importing a deleted global `config-types.ts`.

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

**What it rewrites:** only the two `.claude-src/*.ts` files (`config.ts` + `config-types.ts`). It never touches the project's `.claude/skills/` tree, and it never recompiles anything itself.

### Propagated-project recompilation (D-240 — closed)

Propagation being config-only used to leave a registered project's compiled `.claude/agents/<name>.md` embedding a removed global skill until that project was next edited directly. That gap is closed by a caller-side pipeline, not by propagation itself:

```
writeScopedConfigs        -> ScopedConfigWriteResult.propagatedProjects
writeProjectConfig        -> ConfigWriteResult.propagatedProjects
init.tsx / edit.tsx       -> recompilePropagatedProjectAgents(projectDirs)
                               -> recompileRegisteredProjectAgents(dir)   [per project]
```

`recompileRegisteredProjectAgents` (`src/cli/lib/operations/project/recompile-project-agents.ts`) compiles **project scope only** (`scopeFilter: "project"`) — the global agents were already recompiled by the triggering operation's own pass, and repeating a global pass per project would rewrite `~/.claude/agents` once per registered project for no gain. It passes `discoverInstalledSkills(projectDir).allSkills` explicitly, because the default fallback sees plugin skills only and would strip every global-local and project-local skill from the compiled output. Agent partials always come from the CLI itself, so no per-project marketplace resolution happens.

`recompilePropagatedProjectAgents(projectDirs)` loops sequentially with per-project failure isolation and returns `{ recompiledCount, failedCount, warnings }` — one project's unreadable config or broken template must not abort the loop. Warnings are surfaced by the calling command.

Finding: `.ai-docs/agent-findings/2026-07-18-propagation-skips-agent-recompile.md` (the original gap report).

**Dependency on `projects` field.** The whole flow is gated on `globalConfig.projects`. The array is maintained exclusively by `registerProjectPath` (during project-context writes in `writeScopedConfigs`) and `deregisterProjectPath` (called from `uninstall`). `mergeConfigs` now preserves `projects` from the existing config, so a home-context `cc edit` retains a `finalConfig.projects` array and the home-context propagation guard fires. The project-context branch was always reachable because it reads `projects` off `effectiveGlobalConfig`, which is built from a `...existing` spread that preserves the field.

## Cross-Scope Reconciliation — `reconcileProjectSplitAgainstGlobal` (D-279)

**File:** `src/cli/lib/installation/local-installer.ts`

One helper, called at **every** site that writes a project `config.ts` with the global config inlined. Enumerating the write sites by name is the checkable form of the claim: a grep for `writeConfigFile(..., { isProjectConfig: true, globalConfig })` that returns a third site with no reconciliation call is an immediately visible defect.

| Write site                                                                     | Reconciliation call                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `writeScopedConfigs` project-context branch (ordinary project `init` / `edit`) | `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` |
| `propagateGlobalChangesToProjects` per-project loop                            | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)`                |

Before D-279 only the propagation site reconciled, and only on identity. The `writeScopedConfigs` site performed none at all, so a project owning a skill at project scope while the same id was already active globally got TWO active entries in its own `config.ts` with no propagation involved. `doctor` reported the install clean and `validate` exited 0, because neither checks config semantics.

### Composition

```
reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)
  healedSkills = dropOrphanedDerivedMasks(projectSplit.skills, matrix)
  healedAgents = dropOrphanedDerivedAgentMasks(projectSplit.agents)
  skills = [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)]
  agents = [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)]
```

Self-heal runs BEFORE masking on both axes, so a mask whose collision has cleared is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees tombstones that are still warranted.

### The collision test — `buildProjectCollisionTest`

Shared by the mask producer and the self-heal so the two can never disagree about what a mask means. It closes over the project's OWN entries and returns `(id: SkillId) => boolean`:

| Kind         | Condition                                                                                                                               | Applies to     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **IDENTITY** | The project holds an active project-scope entry for the same id / name.                                                                 | skills, agents |
| **CATEGORY** | The project holds a different active project-scope skill in the same category AND the merged matrix declares that category `exclusive`. | skills only    |

Agents have no categories, so `maskCollidingGlobalAgents` / `dropOrphanedDerivedAgentMasks` are identity-only.

### Invariants

| Invariant                           | How it holds                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idempotent                          | `maskColliding*` skips ids/names already in `alreadyTombstoned`.                                                                                                                                       |
| Honours source-repo overrides       | `isExclusiveCategory(category, matrix)` reads `matrix.categories[category]?.exclusive`, not `defaultCategories`.                                                                                       |
| Undeclared flag is non-exclusive    | `?.exclusive === true`. A rule that masks persisted entries must only fire on a flag the data actually carries — deliberately unlike `build-step-logic.ts`'s `cat.exclusive ?? true` renderer default. |
| Never throws on custom skills       | `categoryOfSkill` returns `undefined` for an id absent from the matrix and for `LOCAL_PSEUDO_CATEGORY`; neither participates in category rules.                                                        |
| Never writes into the global config | Masking is applied to the project split only. The `globalConfig` argument is read, never rewritten — a tombstone never belongs in `~/.claude-src/config.ts`.                                           |
| The mask carries the global source  | Masks are built as `{ ...globalEntry, excluded: true }`.                                                                                                                                               |

**The project's own skill wins locally.** Deliberately asymmetric with `toggleTechnology`'s exclusive-swap guard, which refuses a user-initiated swap over a globally locked skill: there the user is displacing a shared install, whereas here a global install landed on top of existing project state and letting it win would silently uninstall the user's own skill. Relaxing the wizard-side guard is tracked as D-276.

### Mask lifetime

Since D-277 no store path can mint a BARE global tombstone: a project-scope deselect of a globally installed item is refused, and a domain deselect only drops what the project owns. The single remaining user route (`s`, G→P) always pairs the tombstone with an active project entry — an identity collision. Every bare mask is therefore machine-derived by construction, and one retention test suffices: **keep a mask only while the collision that would re-derive it still holds**, in `required` and optional categories alike.

This generalised the earlier `dropOrphanedDerivedMasks` rule, which was narrowed to categories that were both `exclusive` and `required` purely because a derived mask and a deliberate exclusion were byte-identical on disk. After D-277 they no longer coexist, so the narrowing and its trade-off paragraph are gone.

Findings: `2026-07-29-project-config-written-by-two-paths-only-one-reconciled.md`, `2026-07-29-category-exclusivity-enforced-only-in-a-keypress-handler.md`, `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable.md` (superseded by `2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md`).

## `projects` Field Lifecycle

The `projects: string[]` field on the GLOBAL `ProjectConfig` at `~/.claude-src/config.ts` is the registry of every project directory that has invoked `cc init` / `cc edit` and triggered a global write. It drives `propagateGlobalChangesToProjects` — the per-project types/config fan-out on global edits. Only two functions read or write the field, and both sit in `src/cli/lib/installation/local-installer.ts`.

### Ownership

| Function                           | Operation             | Trigger                                                                                    | Persists field? |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| `registerProjectPath`              | Append + stale-filter | `writeScopedConfigs` project-context branch (every project-context write)                  | Yes             |
| `deregisterProjectPath`            | Remove                | Every PROJECT `uninstall` (`src/cli/commands/uninstall.tsx`) — unconditional since D-274   | Yes             |
| `propagateGlobalChangesToProjects` | Read-only             | Post-global-write in `writeScopedConfigs` (both branches) and the global-uninstall fan-out | No              |

**D-274 changed the deregister trigger.** `uninstall --all` no longer exists; plain `uninstall` does what `--all` used to do, and the config manifest (`.claude-src/config.ts` + `config-types.ts`) is removed unconditionally, with `.claude-src/` itself removed once empty. A project uninstall therefore ALWAYS calls `deregisterProjectPath(projectDir)`. The call is wrapped in a `try/catch` that warns (`"Could not update the global project registry: ..."`) — a missing, project-less, or corrupt (`ConfigLoadError`) global config must never fail the uninstall. A GLOBAL uninstall does not deregister; it runs `pruneGlobalEntriesFromRegisteredProjects` instead.

No other code in the project writes `globalConfig.projects`. `generateConfigSource` in `config-writer.ts` strips `projects` from PROJECT config output via the shared `cleanForEmission(config, { dropProjects })` helper — a single `delete cleaned.projects` gated on `dropProjects`. The two project-config writers pass `dropProjects: true` (the inlined-global path cleans BOTH the project config and the inlined global snapshot; the global-import path cleans the project config), while the standalone writer passes `dropProjects: false`. The field is therefore emitted only in the GLOBAL (standalone) config source.

### Path normalization — `normalizeProjectPath`

Every value compared against `projects[]` goes through **one module-private helper** in `src/cli/lib/installation/local-installer.ts`:

```
normalizeProjectPath(projectDir) -> fs.realpathSync(projectDir)
```

| Site                                                      | What it normalizes                                            |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `registerProjectPath`                                     | The path matched against, and appended to, `projects[]`       |
| `deregisterProjectPath`                                   | The path the `projects[]` filter removes                      |
| `propagateGlobalChangesToProjects` — current-project skip | `currentProjectDir`, compared against each `projects[]` entry |

**Rule going forward: any site that matches a directory against the `projects[]` registry MUST call `normalizeProjectPath` and must not roll its own normalization.** Entries are written and read back under a single rule, so a path stored by one site matches byte-for-byte at the others. The helper is not exported; a fourth site therefore either lives in `local-installer.ts` or forces a deliberate export — which is the point at which the rule gets re-examined rather than silently forked.

**Scope of the rule.** It governs the `projects[]` registry only. `isHomeDirectory` (`src/cli/lib/installation/is-home-directory.ts`) also compares symlink-resolved directories, but against `$HOME` rather than against a persisted registry, and it keeps its own plain-string `catch` fallback. Do not unify the two — nothing `isHomeDirectory` compares was ever written to disk under a normalization that must be matched later.

**Single rule, no fallback tier — deliberate, not an oversight.** `normalizeProjectPath` THROWS when the directory does not exist; there is no `path.resolve` second tier. Finding `2026-07-25-register-deregister-path-normalization-asymmetry.md` proposed precisely that fallback ("normalize with `fs.realpathSync` ... falling back to `path.resolve` only if the path no longer exists on disk"), and it was **deliberately not implemented**. A two-tier resolution chain is banned by CLAUDE.md's Data Integrity rule ("NEVER build multi-tier resolution fallbacks ... Data matches on the first lookup or it's an error"), so building it would have placed the banned pattern inside the very helper written to unify the rule — the second tier is exactly where the asymmetry would grow back. Do NOT restore the fallback believing it was overlooked: see that finding's **Resolution Note** and finding `2026-07-30-finding-proposed-standard-contradicted-a-never-rule.md`.

**Where the throw lands.** The helper is reached late on every path, so a non-existent directory degrades rather than crashing an operation mid-write:

| Caller                                                    | Reached only after                                                                                                                         | On throw                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registerProjectPath`                                     | n/a — normalizes first                                                                                                                     | Propagates; the directory is the one currently being written to, so it exists                                                                                                                                      |
| `deregisterProjectPath`                                   | the `loadProjectConfigFromDir(homeDir)` global-config load AND the `!existingGlobal?.config?.projects?.length` empty-registry early return | Propagates uncaught to the **pre-existing** warn-and-continue guard in `executeUninstall` (`src/cli/commands/uninstall.tsx`): `Could not update the global project registry: <reason>`. The uninstall never fails. |
| `propagateGlobalChangesToProjects` — current-project skip | the `projects.length === 0` early return, and only when `currentProjectDir` was passed                                                     | Propagates to the caller (`writeScopedConfigs`); the directory is the project being installed, so it exists                                                                                                        |

### `registerProjectPath` — stale-filter semantics

Normalization: `normalizeProjectPath(projectDir)` — `fs.realpathSync`, resolves symlinks (see above).

Stale-filter pass: before appending, every entry in the existing `projects` list is tested with `fileExists(<entry>/.claude-src/config.ts)`. Missing files are dropped. This is the only place stale entries are collected — they accumulate in the global config across sessions and are swept on the next project-context write.

Append rule:

- If the normalized current path is already in the filtered list, skip the append. `changed` is true iff any stale entry was removed this pass.
- Otherwise append the normalized path. `changed` is always true.

The stale filter does not warn, error, or deregister — it silently drops. A project that was deleted on disk without `cc uninstall` has its global registration harvested on the next unrelated project write.

### `deregisterProjectPath` — removal semantics

Normalization: `normalizeProjectPath(projectDir)` — `fs.realpathSync`, resolves symlinks. The **same** helper `registerProjectPath` stored the entry under, so the filter matches.

**Normalization asymmetry — CLOSED. Do not reintroduce it.** `deregisterProjectPath` previously normalized with `path.resolve`, which does not resolve symlinks, while `registerProjectPath` stored `fs.realpathSync`. Where a symlink sat above the project root the registered entry (realpath) never matched the deregister input, so the deregister was a silent no-op — the exact "registry keeps propagating into an uninstalled project" failure D-274 set out to prevent. On Linux with no symlinked ancestor the two agreed, which is why the Linux E2E coverage passed throughout; macOS (`/tmp` → `/private/tmp`) and any `~/dev/repo` → `/data/repo` layout leaked registrations forever.

**The invariant that now holds:** all three registry sites call the single `normalizeProjectPath` helper (see "Path normalization" above), so there is one implementation of the rule and no second one to drift against. This entry is kept rather than deleted because the constraint is invisible in the fixed code — a future edit that inlines `path.resolve` at either end reads as harmless and silently restores the defect.

The general rule, still binding: **a value written to config under one normalization must be read back and filtered under the same normalization.** See findings `2026-07-25-register-deregister-path-normalization-asymmetry.md` (status `resolved`; its Resolution Note records the deliberately-omitted fallback tier) and `2026-04-21-d233-projects-normalization-asymmetry.md` (the original report, filed three months earlier against the same two functions; status `superseded`, linked to the 2026-07-25 finding in both directions as of 2026-07-30).

> **Correction (2026-07-30):** this paragraph previously described the 2026-04-21 finding as "still marked `partial` on disk, and its `partial_note` describing `path.resolve` as current code is now stale". That was accurate when written and has since been acted on — the finding is now `superseded`, and the false `partial_note` (which also pinned two line numbers that had both moved) was removed rather than rewritten. The two findings had never been cross-linked, which is why resolving one left the other asserting a live bug; see `2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved.md` for the proposed pipeline rule.

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

The function never throws and never deregisters stale entries — a skipped project remains in `globalConfig.projects` until `registerProjectPath` sweeps it on the next project-context write. The two sets are returned as `{ updated: string[]; skipped: string[] }`. Whether `skipped` reaches the user depends entirely on which caller invoked the function (below).

### Propagation observability — caller-dependent since D-274

`skipped` is no longer architecturally orphaned; it is consumed by exactly one of the three production callers.

| Caller                                                                                     | Reads `updated`                                                          | Reads `skipped`                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `writeScopedConfigs` home-context branch                                                   | `result.updated.length` → `verbose()` + returned                         | **No** — never referenced                                                           |
| `writeScopedConfigs` project-context branch                                                | `propagation.updated.length` → `verbose()` + returned                    | **No** — never referenced                                                           |
| `uninstall.tsx::updateRegisteredProjects` (via `pruneGlobalEntriesFromRegisteredProjects`) | `result.updated.length > 0` → `logSuccess(registeredProjectsUpdated(n))` | **Yes** — one `this.warn(registeredProjectUpdateSkipped(path))` per skipped project |

So a skipped project is **user-visible on a global uninstall** and **invisible on every init/edit propagation**. Both `writeScopedConfigs` branches now also surface `updated` upward via `ScopedConfigWriteResult.propagatedProjects`, which the commands consume for recompilation — but `skipped` still stops at the function boundary on those paths.

**Per-branch user-visible signal on the init/edit paths.** `verbose()` only prints when the user passed `--verbose`. Without that flag, every skip branch is invisible and the process exit code is unaffected — `writeScopedConfigs` resolves normally regardless of skip count.

| Skip branch                                                         | `verbose()` log line                                                        | User-visible without `--verbose` | Exit code impact | Return-value signal                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------------------ |
| `fileExists(projectConfigPath)` false (config.ts missing on disk)   | `"Skipped propagation to ${projectPath} (config not found)"`                | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| `loadProjectConfigFromDir` returns `null`/no `config`               | None — push-and-`continue` with no log                                      | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| `loadProjectConfigFromDir` throws (or any writer throws downstream) | `"Failed to propagate to ${projectPath}: ${message}"` (caught)              | No (uninstall path: **yes**)     | None             | Pushed to `skipped`; warned only on the uninstall path |
| Happy path — writes succeed                                         | `"Propagated global changes to ${projectPath}"` + aggregate count at caller | No                               | None             | Pushed to `updated`                                    |

Note the `loadProjectConfigFromDir` throw branch now also covers `ConfigLoadError` (D-273): a registered project whose `config.ts` is corrupt is caught by the per-project `try`, pushed to `skipped`, and never aborts the fan-out.

**What this means for the user.** On `init` / `edit`, a project that fell out of propagation — directory deleted, config manually removed, or parse failure — produces no standard-output warning, no non-zero exit, and no persistent marker. The project remains in `globalConfig.projects` (the per-loop skip does NOT deregister), so it is retried on the next global write. The stale-filter sweep in `registerProjectPath` harvests entries whose `config.ts` is missing, but only on the _next_ project-context write. On a global `uninstall` the same skip is named explicitly.

**What this means for a debugger.** Reproducing a silent skip on the init/edit paths requires `--verbose` or direct inspection of `skipped` in a unit test. E2E tests that assert propagation succeeded (e.g., `e2e/lifecycle/project-tracking-propagation.e2e.test.ts`) verify `updated` side effects on disk, not `skipped`. A regression that causes all registered projects to silently skip would still pass every test that only checks `updated` for the current project and the exit code.

**Gap summary.** On the two `writeScopedConfigs` paths there is still no standard-output warning, no non-zero exit, no persistent marker, and no E2E assertion that a skipped project fell out of propagation. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md`; the uninstall path is the pattern the other two could adopt.

**No pre-existing ticket covers this observability gap.** D-216 (`todo/D-216-global-config-propagation.md`) tracks the propagation feature mechanics (scope defaults, `writeStandaloneConfigTypes`-vs-`regenerateConfigTypes` at project branch). The `mergeConfigs`-drops-projects finding (`.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md`, now fixed — see `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`) tracked one historical reason home-context propagation did not fire, but not the missing signal when per-project skips occur. The normalization-asymmetry findings (`2026-04-21-d233-projects-normalization-asymmetry.md`, `2026-07-25-register-deregister-path-normalization-asymmetry.md`) cover a register/deregister path mismatch — now closed by `normalizeProjectPath` — not the runtime-skip visibility. See finding `.ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md` for the proposed remediation options.

### Registration observability

Same architectural class as Propagation observability above (silent drop, caller cannot distinguish, no user signal), different trigger surface. `registerProjectPath`'s stale-filter sweep harvests `projects` entries whose `<entry>/.claude-src/config.ts` is missing on disk. The sweep is the only place stale entries are collected — it runs on every project-context write to global config.

**What gets dropped.** Any `projects` entry whose joined `<entry>/<CLAUDE_SRC_DIR>/<STANDARD_FILES.CONFIG_TS>` fails `fileExists`. Cause is deterministic-only: the config file is absent from disk. Causes in practice: project directory deleted without running `uninstall`, `.claude-src/` manually removed, or path renamed on disk after registration. A fourth cause — a symlinked project whose `deregisterProjectPath` silently no-op'd — is **historical only**: the normalization asymmetry that produced it is closed (see "Path normalization" above), so no new such entries are created; a registry written before the fix may still carry one, and the sweep harvests it like any other.

**How many are dropped.** The count is computed implicitly as `existing.length - valid.length` but is never stored, returned, or logged. The returned `changed` flag collapses "N stale entries swept" and "current path was appended" into a single boolean — callers cannot distinguish a sweep from an append.

**User-visible signal.**

| Surface                                              | Signal on sweep                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside-loop log (`verbose()` / `warn()`)             | None — the filter has zero log statements                                                                                                   |
| Return value                                         | Dropped count not returned; `changed` is a union of "swept" + "appended"                                                                    |
| Caller (`writeScopedConfigs` project-context branch) | Reads only `regResult.changed` as part of `needsGlobalWrite = globalDataChanged \|\| regResult.changed`. Never branches on sweep-vs-append. |
| Standard output                                      | None                                                                                                                                        |
| Exit code                                            | None — `writeScopedConfigs` resolves normally; its `ScopedConfigWriteResult` carries only `propagatedProjects`, never registration deltas   |
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

Since D-273 that load THROWS `ConfigLoadError` on a corrupt global config instead of returning `null`. `deregisterProjectPath` does not catch it — `uninstall.tsx` wraps the call and warns, so a corrupt global config degrades to "registry not updated" rather than a failed uninstall. `resolveEffectiveGlobalConfig`'s caller in `writeScopedConfigs` does NOT wrap its `loadProjectConfigFromDir(homeDir)`, so a corrupt global config aborts a project write before anything is persisted.

**History:** the home-context path previously dropped `projects` in `mergeConfigs`, making the `if (finalConfig.projects?.length)` propagation guard vacuously falsy for a `cc edit` at HOME. That is fixed (finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`); the earlier D-228 "vacuous pass" E2E workaround in `.ai-docs/agent-findings/2026-04-21-d228-e2e-vacuous-pass-via-home-edit.md` is the historical record.

## `buildProjectTypesExtras`

**Purpose:** Derive the four extras that `regenerateConfigTypes` needs to extend the global unions with project-only additions.

**Filters.** Input is `finalConfig` (the full cross-scope config, not the project split). The function selects entries passing `isActiveAt(entry, "project")` (`scope-predicates.ts`) from both `skills` and `agents`. Excluded tombstones are dropped — their type should still flow in from the global union, not be re-declared as a project-local extra.

**Derivation rules.** Returns `Required<ConfigTypesExtras>`; the two derived sets go through the shared exported helpers in `config-types-writer.ts`, not inline expressions:

| Extra             | Source                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `extraSkillIds`   | `unique(projectSkills.map(s => s.id))`                                                                                             |
| `extraAgentNames` | `unique(projectAgents.map(a => a.name))`                                                                                           |
| `extraCategories` | `deriveCategories(projectSkills.map(s => s.id), matrix)` — `matrix.skills[id]?.category` filtered by `isNonLocalCategory`, deduped |
| `extraDomains`    | `deriveDomains(projectCategories, matrix)` — `matrix.categories[cat]?.domain`, `undefined` dropped, deduped                        |

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
