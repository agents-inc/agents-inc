---
scope: reference
area: features
keywords:
  [
    operations,
    composable,
    source,
    skills,
    project,
    recompile-project-agents,
    config-gate,
    GateReport,
    prune,
  ]
related:
  - reference/architecture-overview.md
  - reference/config/config-writer.md
  - reference/dependency-graph.md
  - reference/commands/index.md
  - reference/type-system.md
  - reference/types/operations-types.md
  - reference/features/compilation-pipeline.md
last_validated: 2026-07-30
---

# Operations Layer

## Overview

**Purpose:** Composable building blocks between CLI commands and lower-level lib functions. Each operation wraps one or more lib calls into a single typed function with explicit options/result types.
**Entry Point:** `src/cli/lib/operations/index.ts` (barrel export)
**Types Re-export:** `src/cli/lib/operations/types.ts`
**Key Files:** 22 production (2 root + 3 subdomain barrels + 17 operation files), 10 co-located test files

## Architectural Position

```
Commands (src/cli/commands/*.ts)
    |
    v
Operations (src/cli/lib/operations/**)    <-- THIS LAYER
    |
    v
Lib functions (src/cli/lib/{loading,installation,configuration,agents,skills,plugins}/**)
```

Commands import from `operations/index.js`. Operations import from lower-level lib modules. Commands should not bypass operations for functionality that an operation covers.

## File Structure

| File                                                          | Purpose                                                                                                                                                                                   | Subdomain |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `src/cli/lib/operations/index.ts`                             | Barrel: re-exports all functions and types from subdomains                                                                                                                                | root      |
| `src/cli/lib/operations/types.ts`                             | Convenience type-only re-exports — NON-exhaustive subset of `index.ts`; omits `MarketplaceRequirement`, `CompileAllScopesOptions`, `PropagatedRecompileSummary`, `CopyLocalSkillsOptions` | root      |
| `src/cli/lib/operations/source/index.ts`                      | Barrel for source subdomain                                                                                                                                                               | source    |
| `src/cli/lib/operations/source/load-source.ts`                | Load skills matrix from resolved source                                                                                                                                                   | source    |
| `src/cli/lib/operations/source/ensure-marketplace.ts`         | Register/update marketplace with Claude CLI                                                                                                                                               | source    |
| `src/cli/lib/operations/source/require-marketplace.ts`        | Resolve marketplace or return a hard-error requirement (plugin install intent)                                                                                                            | source    |
| `src/cli/lib/operations/skills/index.ts`                      | Barrel for skills subdomain                                                                                                                                                               | skills    |
| `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way merge skill discovery (global plugin, global local, project plugin, project local)                                                                                                  | skills    |
| `src/cli/lib/operations/skills/collect-scoped-skill-dirs.ts`  | List local skill directories with scope annotations                                                                                                                                       | skills    |
| `src/cli/lib/operations/skills/copy-local-skills.ts`          | Copy local-source skills to scope-appropriate directories                                                                                                                                 | skills    |
| `src/cli/lib/operations/skills/compare-skills.ts`             | Compare local skills against source versions                                                                                                                                              | skills    |
| `src/cli/lib/operations/skills/find-skill-match.ts`           | Find skill by exact ID, partial name, or directory name                                                                                                                                   | skills    |
| `src/cli/lib/operations/skills/install-plugin-skills.ts`      | Install skill plugins via Claude CLI by scope                                                                                                                                             | skills    |
| `src/cli/lib/operations/skills/uninstall-plugin-skills.ts`    | Uninstall skill plugins via Claude CLI by scope                                                                                                                                           | skills    |
| `src/cli/lib/operations/project/index.ts`                     | Barrel for project subdomain                                                                                                                                                              | project   |
| `src/cli/lib/operations/project/detect-project.ts`            | Detect installation + load project config                                                                                                                                                 | project   |
| `src/cli/lib/operations/project/detect-both-installations.ts` | Detect global and project installations independently                                                                                                                                     | project   |
| `src/cli/lib/operations/project/compile-agents.ts`            | Compile agent markdown from templates + skills; prune stale compiled agents on an authoritative pass                                                                                      | project   |
| `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Compile agents across every scope the context owns (home single-pass; project two-pass)                                                                                                   | project   |
| `src/cli/lib/operations/project/recompile-project-agents.ts`  | Recompile a registered project's project-scoped agents after propagation, and the failure-isolating loop over all propagated projects                                                     | project   |
| `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI built-in and source agent definitions                                                                                                                                    | project   |
| `src/cli/lib/operations/project/write-project-config.ts`      | Build, merge, and write scoped project config files; return the propagated project dirs                                                                                                   | project   |

## Exported Types

### Source Types

| Type                     | File                            | Fields                                                                                                        |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `LoadSourceOptions`      | `source/load-source.ts`         | `sourceFlag?, projectDir, forceRefresh?, captureStartupMessages?`                                             |
| `LoadedSource`           | `source/load-source.ts`         | `sourceResult: SourceLoadResult, startupMessages: StartupMessage[]`                                           |
| `MarketplaceResult`      | `source/ensure-marketplace.ts`  | `marketplace: string \| null, registered: boolean`                                                            |
| `MarketplaceRequirement` | `source/require-marketplace.ts` | Discriminated union: `{ ok: true; marketplace: string; registered: boolean } \| { ok: false; error: string }` |

### Skills Types

| Type                     | File                                  | Fields                                                                                                         |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DiscoveredSkills`       | `skills/discover-skills.ts`           | `allSkills, totalSkillCount, pluginSkillCount, localSkillCount, globalPluginSkillCount, globalLocalSkillCount` |
| `ScopedSkillDir`         | `skills/collect-scoped-skill-dirs.ts` | `dirName, localSkillsPath, scope: "project" \| "global"`                                                       |
| `ScopedSkillDirsResult`  | `skills/collect-scoped-skill-dirs.ts` | `dirs: ScopedSkillDir[], hasProject, hasGlobal, projectLocalPath, globalLocalPath`                             |
| `SkillCopyResult`        | `skills/copy-local-skills.ts`         | `projectCopied: CopiedSkill[], globalCopied: CopiedSkill[], totalCopied`                                       |
| `SkillComparisonResults` | `skills/compare-skills.ts`            | `projectResults, globalResults, merged: SkillComparisonResult[]`                                               |
| `SkillMatchResult`       | `skills/find-skill-match.ts`          | `match: SkillComparisonResult \| null, similar: string[]`                                                      |
| `PluginInstallResult`    | `skills/install-plugin-skills.ts`     | `installed: Array<{id, ref}>, failed: Array<{id, error}>`                                                      |
| `PluginUninstallResult`  | `skills/uninstall-plugin-skills.ts`   | `uninstalled: SkillId[], failed: Array<{id, error}>`                                                           |

### Project Types

| Type                         | File                                   | Fields                                                                                                |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DetectedProject`            | `project/detect-project.ts`            | `installation: Installation, config: ProjectConfig \| null, configPath: string \| null`               |
| `BothInstallations`          | `project/detect-both-installations.ts` | `global: Installation \| null, project: Installation \| null, hasBoth: boolean`                       |
| `CompileAgentsOptions`       | `project/compile-agents.ts`            | `projectDir, sourcePath, pluginDir?, skills?, agentScopeMap?, agents?, scopeFilter?, outputDir?`      |
| `CompilationResult`          | `project/compile-agents.ts`            | `compiled: AgentName[], failed: AgentName[], warnings: string[]`                                      |
| `CompileAllScopesOptions`    | `project/compile-agents-all-scopes.ts` | `projectDir, sourcePath, skills: SkillDefinitionMap, agentScopeMap: Map<AgentName, SkillScope>`       |
| `PropagatedRecompileSummary` | `project/recompile-project-agents.ts`  | `recompiledCount: number, failedCount: number, warnings: string[]`                                    |
| `ConfigWriteOptions`         | `project/write-project-config.ts`      | `wizardResult: WizardResultV2, sourceResult, projectDir, sourceFlag?, agents?, authoritativeScope?`   |
| `ConfigWriteResult`          | `project/write-project-config.ts`      | `config: ProjectConfig, configPath, wasMerged, existingConfigPath?, filesWritten, propagatedProjects` |
| `AgentDefs`                  | `project/load-agent-defs.ts`           | `agents: Record<AgentName, AgentDefinition>, sourcePath, agentSourcePaths`                            |

`ConfigWriteResult` carries **no** `globalConfigPath`. The field was declared optional, never populated by `writeProjectConfig` and never read by any caller, so it was deleted rather than left as dead surface a future reader could reach for.

## Exported Functions

### Source Operations

| Function             | Signature                                                                              | Wraps                                                                                                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSource`         | `(options: LoadSourceOptions) => Promise<LoadedSource>`                                | `loadSkillsMatrixFromSource()` from `loading/index.js`, logger buffering utils                                                                   | Loads skills matrix; optionally captures startup messages via buffer mode                                                                                                                                                                                                                                                                                              |
| `ensureMarketplace`  | `(sourceResult: SourceLoadResult) => Promise<MarketplaceResult>`                       | `fetchMarketplace()` from `loading/index.js`, `claudePluginMarketplaceExists/Add/Update()` from `utils/exec.js`, `warn()` from `utils/logger.js` | Registers or updates marketplace with Claude CLI; lazy-resolves `sourceResult.marketplace` via `fetchMarketplace()` when undefined (mutates `sourceResult.marketplace` in place); returns `{ marketplace: null, registered: false }` when fetch fails; silent (callers decide logging). Now consumed almost exclusively by `requireMarketplace`                        |
| `requireMarketplace` | `(sourceResult: SourceLoadResult, purpose: string) => Promise<MarketplaceRequirement>` | `ensureMarketplace()` (internal)                                                                                                                 | Resolves the marketplace required for plugin operations; returns `{ ok: true, marketplace, registered }` on success and `{ ok: false, error }` otherwise. Enforces plugin-install intent — callers (via `requireMarketplaceOrExit()` in `src/cli/base-command.ts`) MUST hard-error on `ok: false` BEFORE any filesystem mutation, never silently falling back to eject |

### Skills Operations

| Function                     | Signature                                                                                                                                   | Wraps                                                                                                                                                                                                      | Purpose                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discoverInstalledSkills`    | `(projectDir: string) => Promise<DiscoveredSkills>`                                                                                         | `discoverAllPluginSkills()` from `plugins/index.js`, `discoverLocalProjectSkills()` (internal), `isHomeDirectory()` from `installation/is-home-directory.js`                                               | 4-way merge: global plugins + global local + project plugins + project local (global scopes skipped when `projectDir` is home)                                                                                                                                                                                                             |
| `discoverLocalProjectSkills` | `(rootDir: string) => Promise<SkillDefinitionMap>`                                                                                          | `loadSkillsFromDir()` from `loading/index.js`                                                                                                                                                              | Discovers local skills from `<rootDir>/.claude/skills/`; used for both the project root and the global install root. (`loadSkillsFromDir` now lives in the `loading/` layer, not operations)                                                                                                                                               |
| `mergeSkills`                | `(...skillSources: SkillDefinitionMap[]) => SkillDefinitionMap`                                                                             | None (pure merge)                                                                                                                                                                                          | Merges skill maps; later sources take precedence                                                                                                                                                                                                                                                                                           |
| `collectScopedSkillDirs`     | `(projectDir: string) => Promise<ScopedSkillDirsResult>`                                                                                    | `fileExists()`, `listDirectories()` from `utils/fs.js`, `isHomeDirectory()` from `installation/is-home-directory.js`                                                                                       | Lists local skill dirs from project and global scopes with dedup (project wins on name conflict)                                                                                                                                                                                                                                           |
| `copyLocalSkills`            | `(skills: SkillConfig[], projectDir: string, sourceResult: SourceLoadResult, options?: CopyLocalSkillsOptions) => Promise<SkillCopyResult>` | `resolveInstallPaths()` from `installation/index.js`, `copySkillsToLocalFlattened()` + `deleteLocalSkill()` from `skills/index.js`, `ensureDir()` from `utils/fs.js`, `EJECT_SOURCE` from `consts.js`      | Splits by scope, copies from source to local dirs. `options.deleteAlternateSourceSkills` (default false) first deletes an already-present local copy whose config names a non-eject source — used by the eject installer; init/edit leave it off. `CopyLocalSkillsOptions` is exported from the module but not surfaced through the barrel |
| `compareSkillsWithSource`    | `(projectDir: string, sourcePath: string, matrix: MergedSkillsMatrix) => Promise<SkillComparisonResults>`                                   | `compareLocalSkillsWithSource()` from `skills/index.js`, `collectScopedSkillDirs()`                                                                                                                        | Compares local skills (both scopes) against source; project takes precedence. `current` / `outdated` / `local-only` classification rules: [skills/skill-primitives.md](../skills/skill-primitives.md)                                                                                                                                      |
| `buildSourceSkillsMap`       | `(matrix: MergedSkillsMatrix) => Partial<Record<SkillId, Pick<ResolvedSkill, "path">>>`                                                     | None (pure transform)                                                                                                                                                                                      | Builds ID-to-path map of non-local skills from matrix                                                                                                                                                                                                                                                                                      |
| `findSkillMatch`             | `(skillName: string, results: SkillComparisonResult[]) => SkillMatchResult`                                                                 | None (pure lookup)                                                                                                                                                                                         | Exact ID -> partial name -> directory name -> fuzzy suggestions                                                                                                                                                                                                                                                                            |
| `installPluginSkills`        | `(skills: SkillConfig[], marketplace: string, projectDir: string) => Promise<PluginInstallResult>`                                          | `claudePluginInstall()` from `utils/exec.js`, `buildMarketplacePluginRef()` + `toClaudePluginScope()` from `plugins/index.js`, `getErrorMessage()` from `utils/errors.js`, `EJECT_SOURCE` from `consts.js` | Installs marketplace-sourced skills (filters `source !== EJECT_SOURCE`) via Claude CLI with correct scope; per-skill errors collected into `failed[]` rather than thrown (callers MUST hard-error on non-empty `failed[]` before writing config)                                                                                           |
| `pluginInstallFailureError`  | `(failedCount: number) => string`                                                                                                           | None (pure message builder)                                                                                                                                                                                | Returns the actionable hard-error message init/edit raise when `installPluginSkills` reports a non-empty `failed[]`. Plugin install intent is inviolable — never fall back to eject                                                                                                                                                        |
| `uninstallPluginSkills`      | `(skillIds: SkillId[], oldSkills: SkillConfig[], marketplace: string, projectDir: string) => Promise<PluginUninstallResult>`                | `claudePluginUninstall()` from `utils/exec.js`, `buildMarketplacePluginRef()` + `toClaudePluginScope()` from `plugins/index.js`, `getErrorMessage()` from `utils/errors.js`                                | Uninstalls skills via Claude CLI using scope from `oldSkills` config; plugin ref is qualified `{skillId}@{marketplace}` to match the registry key; per-skill errors collected into `failed[]` (diagnostic only — do not orphan-hard-error)                                                                                                 |

### Project Operations

| Function                           | Signature                                                          | Wraps                                                                                                                                                                                                                                                             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectProject`                    | `(projectDir?: string) => Promise<DetectedProject \| null>`        | `detectInstallation()` from `installation/index.js`, `loadProjectConfig()` + `ConfigLoadError` from `configuration/index.js`                                                                                                                                      | Detects installation + loads config. Returns `null` for BOTH "no installation" and "config file present but corrupt" — it catches `ConfigLoadError` from `detectInstallation` so `doctor` and `edit` report a config/installation problem. `compile` deliberately does NOT use this wrapper; it detects scopes directly so it can hard-error on the corrupt case                                                                                                                                                                                                                                                                                                                                                                              |
| `detectBothInstallations`          | `(projectDir: string) => Promise<BothInstallations>`               | `detectGlobalInstallation()`, `detectProjectInstallation()`, `isHomeDirectory()` from `installation/index.js`                                                                                                                                                     | Checks global and project independently; skips project when projectDir is home. **Lets `ConfigLoadError` propagate** — its only caller, `compile`, catches it and hard-errors before any write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `compileAgents`                    | `(options: CompileAgentsOptions) => Promise<CompilationResult>`    | `recompileAgents()` from `agents/index.js`, `pruneStaleCompiledAgents()` from `agents/list-compiled-agents.js`, `loadProjectConfigFromDir()` from `configuration/index.js`, `buildAgentScopeMap()` from `installation/index.js`                                   | Compiles agent markdown; supports `scopeFilter` for dual-pass compilation (also auto-builds `agentScopeMap` from the loaded config when `scopeFilter` is set and no map was supplied). Afterwards `pruneStaleAgentsForPass()` deletes built-in-named `.md` files no longer in `compiled ∪ failed` — but ONLY on an authoritative pass (`outputDir` set AND no `scopeFilter`). Hand-authored agents are preserved by the `isAgentName` predicate                                                                                                                                                                                                                                                                                               |
| `compileAgentsAllScopes`           | `(options: CompileAllScopesOptions) => Promise<CompilationResult>` | `compileAgents()` (internal), `isHomeDirectory()` + `resolveInstallPaths()` from `installation/index.js`                                                                                                                                                          | Compiles agents for every scope the context owns. Home context: single pass to the home agents dir. Project context: a global pass (from home, `scopeFilter: "global"`) then a project pass (`scopeFilter: "project"`), results merged in pass order so the project pass cannot overwrite global agents with zero-skill versions. Used by `init` and `edit`                                                                                                                                                                                                                                                                                                                                                                                   |
| `recompileRegisteredProjectAgents` | `(projectDir: string) => Promise<CompilationResult>`               | `discoverInstalledSkills()` (skills subdomain), `loadAgentDefs()` (internal), `compileAgents()` (internal), `resolveInstallPaths()` from `installation/index.js`                                                                                                  | Recompiles ONE registered project's agents after propagation rewrote its `config.ts`. `scopeFilter: "project"` only (the global agents were already recompiled by the triggering pass). `skills` is passed explicitly — omitting it makes `recompileAgents` fall back to `discoverAllPluginSkills`, which would silently strip every local skill. Agent partials always come from the CLI (`getLocalAgentDefinitions` returns `sourcePath: PROJECT_ROOT`)                                                                                                                                                                                                                                                                                     |
| `recompilePropagatedProjectAgents` | `(projectDirs: string[]) => Promise<PropagatedRecompileSummary>`   | `recompileRegisteredProjectAgents()` (internal), `getErrorMessage()` from `utils/errors.js`                                                                                                                                                                       | Sequential loop with per-project failure isolation. A thrown error or a non-empty `result.failed` increments `failedCount` and pushes a warning; neither aborts the loop. Sequential so warnings keep a deterministic per-project order. Called only by `config-gate/recompile.ts` (lazily, to avoid the lib → operations cycle) — no command calls it directly. Commands `warn()` each entry of `GateReport.recompile.warnings` and log the recompiled/failed counts                                                                                                                                                                                                                                                                         |
| `loadAgentDefs`                    | `(options?: {projectDir?, forceRefresh?}) => Promise<AgentDefs>`   | `getAgentDefinitions()` from `agents/index.js`, `loadMergedAgents()` from `loading/index.js`                                                                                                                                                                      | Merges CLI built-in agents with source agents (source overrides CLI). Internally passes `undefined` as the remote source — callers cannot override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `writeProjectConfig`               | `(options: ConfigWriteOptions) => Promise<ConfigWriteResult>`      | `buildAndMergeConfig()` + `resolveInstallPaths()` + `isHomeDirectory()` from `installation/index.js`, `loadMergedAgents()` from `loading/index.js`, `ensureBlankPair()` + `writeScopedFromWizard()` from `config-gate/index.js`, `ensureDir()` from `utils/fs.js` | Full config pipeline: build -> merge -> write scoped `config.ts` + `config-types.ts` through the gate. `options.authoritativeScope` (Scenario C) threads into `buildAndMergeConfig` to control how `edit` treats deselected entries (`"all"`/`"owned"`/`undefined`). Project-scope `config-types.ts` emits import-from-global form (writer-selection rule — the gate routes project paths through `regenerateConfigTypes`, and the standalone renderer is private to `config-gate/pair-writer.ts`). `filesWritten = 4` (project+global) or `2` (global-root only). Returns `propagation: GateReport` — what moved, which registered projects the fan-out rewrote, and the recompile the GATE already performed in them; the caller renders it |

## Command Consumers

| Command     | File                             | Operations Used                                                                                                                                                                                                                                  |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `init`      | `src/cli/commands/init.tsx`      | `loadSource`, `requireMarketplace`†, `loadAgentDefs`, `copyLocalSkills`, `installPluginSkills`, `pluginInstallFailureError`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`                                           |
| `edit`      | `src/cli/commands/edit.tsx`      | `detectProject`, `loadSource`, `discoverInstalledSkills`, `requireMarketplace`†, `uninstallPluginSkills`, `copyLocalSkills`, `installPluginSkills`, `pluginInstallFailureError`, `loadAgentDefs`, `writeProjectConfig`, `compileAgentsAllScopes` |
| `compile`   | `src/cli/commands/compile.ts`    | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                           |
| `update`    | `src/cli/commands/update.tsx`    | `loadSource`, `compareSkillsWithSource`, `compileAgents`, `collectScopedSkillDirs`, `findSkillMatch`, `discoverInstalledSkills`                                                                                                                  |
| `uninstall` | `src/cli/commands/uninstall.tsx` | `loadAgentDefs` (for `pruneGlobalEntriesFromRegisteredProjects` on a global uninstall)                                                                                                                                                           |
| `doctor`    | `src/cli/commands/doctor.ts`     | `loadSource`, `detectProject`                                                                                                                                                                                                                    |
| `search`    | `src/cli/commands/search.ts`     | `loadSource`                                                                                                                                                                                                                                     |
| `eject`     | `src/cli/commands/eject.ts`      | `loadSource`                                                                                                                                                                                                                                     |

† `requireMarketplace` is invoked through `requireMarketplaceOrExit()` on `BaseCommand` (`src/cli/base-command.ts`), not imported directly by the command file. The eject command consumes `copyLocalSkills` indirectly via `installEject` in `src/cli/lib/installation/local-installer.ts` (a lazy `await import(...)` — see Design Conventions).

## Data Flow

### Init Command Flow

```
init.run()
  |-> loadSource({ projectDir, sourceFlag, captureStartupMessages: true })
  |     -> loadSkillsMatrixFromSource() -> SourceLoadResult
  |     -> buffer/drain startup messages
  |-> render(<Wizard />) -> WizardResultV2
  |-> requireMarketplaceOrExit(sourceResult, ...)   // when plugin skills selected
  |     -> requireMarketplace() -> ensureMarketplace() (hard-error on ok:false)
  |-> copyLocalSkills(localSkills, projectDir, sourceResult)
  |     -> resolveInstallPaths() per scope
  |     -> copySkillsToLocalFlattened() per scope
  |-> installPluginSkills(pluginSkills, marketplace, projectDir)
  |     -> claudePluginInstall() per skill
  |     -> if failed[].length: this.error(pluginInstallFailureError(...))  // BEFORE config write
  |-> writeProjectConfig({ wizardResult, sourceResult, projectDir })
  |     -> buildAndMergeConfig() -> config
  |     -> config-gate::ensureBlankPair()
  |     -> config-gate::writeScopedFromWizard() -> config.ts + config-types.ts
  |          (reconcileProjectSplitAgainstGlobal runs immediately before the
  |           project-config write; classification decides the fan-out)
  |          -> propagateGlobalChangesToProjects() -> recompilePropagated()
  |     -> ConfigWriteResult.propagation: GateReport
  |-> loadAgentDefs() + discoverInstalledSkills(cwd)
  |-> compileAgentsAllScopes({ projectDir, sourcePath, skills, agentScopeMap })
  |     -> compileAgents() per owned scope -> agent .md files
  |-> reportPropagatedRecompile(configResult.propagation)   // renders; work already done
```

### Compile Command Flow (Dual-Pass)

```
compile.run()
  |-> detectBothInstallations(projectDir)
  |     -> detectGlobalInstallation() + detectProjectInstallation()
  |     -> ConfigLoadError => this.error(...) with EXIT_CODES.ERROR, before any write
  |-> resolveSource(sourceFlag)  // logged, not an operation
  |-> loadAgentDefs({ projectDir })
  |     -> getAgentDefinitions() + loadMergedAgents()
  |-> buildCompilePasses()  // scopeFilter set only when hasBoth
  |-> per pass:
  |     discoverInstalledSkills(passProjectDir)
  |       -> zero skills: refreshConfigTypes() then skip the pass
  |     warnUnresolvedStackSkills()
  |     compileAgents({ ..., outputDir, scopeFilter? })
  |       -> prunes stale compiled agents only when scopeFilter is absent
  |       -> zero agents on the Project pass: hintGlobalScopedAgents()
  |     refreshConfigTypes()                                 // config-gate::reconcileTypesFromDisk
  |       -> home pass: fan out to registered projects + recompile their agents
  |       -> reportPropagation(report)                      // skipped warns + recompile line
  |-> zero passes with skills => this.error(...)
```

`refreshConfigTypes` loads the matrix with `{ skipExtraSources: true, matrixOnly: true }` so the pass stays offline on a cold cache, then calls `reconcileTypesFromDisk(pass.projectDir, loaded.config, { matrix, agents }, { currentProjectDir: cwd })`. Failure is a warning, never fatal — the agents are already written. `reportPropagation` is deliberately OUTSIDE that catch: a project the fan-out could not reach is reported as that, not as a failure to refresh the unions, which did succeed. `currentProjectDir: cwd` keeps the home pass from reaching a registered project whose own pass is about to compile it. See the "`compile` Regenerates `config-types.ts`" section of [Compilation Pipeline](./compilation-pipeline.md).

### Edit Command Flow

```
edit.run()
  |-> detectProject()
  |     -> detectInstallation() + loadProjectConfig()
  |-> loadSource({ projectDir, sourceFlag, captureStartupMessages: true })
  |-> discoverInstalledSkills(projectDir)
  |-> render(<Wizard />) -> WizardResultV2
  |-> requireMarketplaceOrExit(sourceResult, ...)   // when plugin work required
  |-> uninstallPluginSkills(removedIds, oldSkills, marketplace, cwd)
  |-> copyLocalSkills(addedLocalSkills, cwd, sourceResult)
  |-> installPluginSkills(addedPluginSkills, marketplace, cwd)
  |     -> if failed[].length: this.error(pluginInstallFailureError(...))  // BEFORE config write
  |-> recordGlobalSourceMigrations()                                      // project scope only
  |     -> config-gate::mutateGlobal({ kind: "migrate-skill-sources", sources })
  |     -> reportPropagatedRecompile(report)   // T1: the gate already fanned out + recompiled
  |-> writeProjectConfig({ wizardResult, sourceResult, projectDir, agents, authoritativeScope })
  |     -> config-gate::writeScopedFromWizard() — classifies T4 after the migration above,
  |        so the byte-identical global pair is not re-written and nothing fans out twice
  |-> compileAgentsAllScopes({ projectDir, sourcePath, skills, agentScopeMap })
  |-> reportPropagatedRecompile(configResult.propagation)   // renders; work already done
```

## Lower-Level Lib Dependencies

| Operations Module                      | Imports From                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source/load-source.ts`                | `lib/loading/index.js` (`loadSkillsMatrixFromSource`), `utils/logger.js` (buffering)                                                                                                                                                                                                                            |
| `source/ensure-marketplace.ts`         | `utils/exec.js` (Claude CLI marketplace commands), `lib/loading/index.js` (`fetchMarketplace`), `utils/logger.js` (`warn`)                                                                                                                                                                                      |
| `source/require-marketplace.ts`        | `source/ensure-marketplace.js` (internal: `ensureMarketplace`)                                                                                                                                                                                                                                                  |
| `skills/discover-skills.ts`            | `lib/plugins/index.js` (`discoverAllPluginSkills`), `lib/installation/is-home-directory.js` (`isHomeDirectory`), `lib/loading/index.js` (`loadSkillsFromDir`), `utils/logger.js` (`verbose`), `utils/typed-object.js` (`typedEntries`, `typedKeys`), `consts.js`                                                |
| `skills/collect-scoped-skill-dirs.ts`  | `utils/fs.js` (`fileExists`, `listDirectories`), `lib/installation/is-home-directory.js` (`isHomeDirectory`), `consts.js`                                                                                                                                                                                       |
| `skills/copy-local-skills.ts`          | `lib/installation/index.js` (`resolveInstallPaths`), `lib/skills/index.js` (`copySkillsToLocalFlattened`, `deleteLocalSkill`), `utils/fs.js` (`ensureDir`), `utils/logger.js` (`verbose`), `consts.js` (`EJECT_SOURCE`)                                                                                         |
| `skills/compare-skills.ts`             | `lib/skills/index.js` (`compareLocalSkillsWithSource`), `utils/typed-object.js`, `skills/collect-scoped-skill-dirs.js` (internal)                                                                                                                                                                               |
| `skills/find-skill-match.ts`           | `lib/skills/index.js` (types only: `SkillComparisonResult`)                                                                                                                                                                                                                                                     |
| `skills/install-plugin-skills.ts`      | `utils/exec.js` (`claudePluginInstall`), `lib/plugins/index.js` (`buildMarketplacePluginRef`, `toClaudePluginScope`), `utils/errors.js`, `consts.js` (`EJECT_SOURCE`)                                                                                                                                           |
| `skills/uninstall-plugin-skills.ts`    | `utils/exec.js` (`claudePluginUninstall`), `lib/plugins/index.js` (`buildMarketplacePluginRef`, `toClaudePluginScope`), `utils/errors.js`                                                                                                                                                                       |
| `project/detect-project.ts`            | `lib/installation/index.js` (`detectInstallation`), `lib/configuration/index.js` (`loadProjectConfig`, `ConfigLoadError`)                                                                                                                                                                                       |
| `project/detect-both-installations.ts` | `lib/installation/index.js` (`detectGlobalInstallation`, `detectProjectInstallation`, `isHomeDirectory`)                                                                                                                                                                                                        |
| `project/compile-agents.ts`            | `lib/agents/index.js` (`recompileAgents`), `lib/agents/list-compiled-agents.js` (`pruneStaleCompiledAgents`), `lib/configuration/index.js` (`loadProjectConfigFromDir`), `lib/installation/index.js` (`buildAgentScopeMap`)                                                                                     |
| `project/compile-agents-all-scopes.ts` | `project/compile-agents.js` (internal: `compileAgents`), `lib/installation/index.js` (`isHomeDirectory`, `resolveInstallPaths`)                                                                                                                                                                                 |
| `project/recompile-project-agents.ts`  | `project/compile-agents.js` + `project/load-agent-defs.js` + `skills/index.js` (internal operations), `lib/installation/index.js` (`resolveInstallPaths`), `utils/errors.js` (`getErrorMessage`)                                                                                                                |
| `project/load-agent-defs.ts`           | `lib/agents/index.js` (`getAgentDefinitions`), `lib/loading/index.js` (`loadMergedAgents`)                                                                                                                                                                                                                      |
| `project/write-project-config.ts`      | `lib/installation/index.js` (`buildAndMergeConfig`, `resolveInstallPaths`, `isHomeDirectory`), `lib/loading/index.js` (`loadMergedAgents`), `lib/configuration/index.js` (type `AuthoritativeScope`), `lib/config-gate/index.js` (`ensureBlankPair`, `writeScopedFromWizard`, type `GateReport`), `utils/fs.js` |

## Design Conventions

- **Pure options/result types** -- Every operation defines explicit option and result types. No raw primitives or tuples.
- **Silent by default** -- Operations use `verbose()` for diagnostics. Commands decide what to log to the user based on result fields.
- **Scope-aware** -- Operations that touch the filesystem split by `"project" | "global"` scope. See `copyLocalSkills`, `installPluginSkills`, `collectScopedSkillDirs`.
- **Non-throwing where possible -- but the choice is per-operation, not per-layer** -- `detectProject` returns `null` instead of throwing(including for a corrupt config). `ensureMarketplace` catches fetch failures gracefully. Plugin install/uninstall collect failures into result arrays. `detectBothInstallations` deliberately does the opposite and lets `ConfigLoadError` escape, because its caller must hard-error rather than proceed config-less. When two operations wrap the same lower-level call with different error policies, say so at both sites — the difference IS the contract.
- **Internal cross-references** -- Operations may call other operations in the same subdomain (e.g., `compareSkillsWithSource` calls `collectScopedSkillDirs`; `requireMarketplace` calls `ensureMarketplace`; `compileAgentsAllScopes` calls `compileAgents`). `recompile-project-agents.ts` is the one operation that reaches ACROSS subdomains, calling `discoverInstalledSkills` from `skills/` — it needs the same 4-way merged skill set the wizard path compiles against, and duplicating that discovery inside `project/` would be the drift.
- **Failure isolation over abort** -- An operation that loops over independent targets (`recompilePropagatedProjectAgents` over registered projects) counts failures and collects warnings instead of throwing, so one unreachable target cannot leave the remaining ones stale. Contrast per-item install failures, which are collected but MUST hard-error in the caller.
- **Plugin-install intent is inviolable** -- `requireMarketplace` returns a discriminated `MarketplaceRequirement` and callers hard-error (via `requireMarketplaceOrExit` on `BaseCommand`) BEFORE any filesystem mutation when a marketplace cannot resolve. `installPluginSkills` collects per-skill failures; callers raise `pluginInstallFailureError(...)` on a non-empty `failed[]` BEFORE `writeProjectConfig`. Never silently fall back to eject.
- **No static lib → operations import** -- The operations layer sits ABOVE `lib` and imports `lib` freely, so a `lib` module that statically imports an operation forms a load-time cycle (`installation/index → local-installer → operations/skills/copy-local-skills → installation/index`) that corrupts Vitest module mocks. When a `lib` function must reuse an operation, use a lazy `await import(...)` inside the call site — see `installEject` in `src/cli/lib/installation/local-installer.ts` consuming `copyLocalSkills`, and `src/cli/lib/config-gate/recompile.ts` consuming `recompilePropagatedProjectAgents` (the whole reason that file exists is to hold that one lazy import) (matches the `configuration/config-types-writer.ts` precedent). Likewise, **commands should not bypass operations** for functionality an operation covers.

## Operation Contracts

| Affects                                                                                | Contract rule                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installPluginSkills`, `uninstallPluginSkills`                                         | Per-skill plugin reference format is `{skillId}@{marketplace}`, built via `buildMarketplacePluginRef()` from `plugins/index.js`.                                                                                                                                    |
| `writeProjectConfig`                                                                   | Project `config-types.ts` must be written via `regenerateConfigTypes` (import-from-global), never the standalone renderer. Structurally enforced: the standalone renderer is private to `config-gate/pair-writer.ts` and `regenerateConfigTypes` throws at `$HOME`. |
| `installPluginSkills`, `pluginInstallFailureError`, `requireMarketplace`               | `failed[]` on `PluginInstallResult` MUST trigger `this.error(pluginInstallFailureError(...))` before `writeProjectConfig` in callers. `requireMarketplace` hard-errors before any FS mutation. Uninstall `failed[]` is diagnostic-only — no hard-error needed.      |
| `writeProjectConfig` (`ConfigWriteOptions.authoritativeScope`)                         | `authoritativeScope` (`"all"`/`"owned"`/`undefined`) threads into `buildAndMergeConfig` to control whether `edit` drops deselected entries (Scenario C). `init` leaves it `undefined` (additive union-preserve).                                                    |
| `copyLocalSkills`, `local-installer.ts`                                                | `lib` modules must not statically import operations. `installEject` reuses `copyLocalSkills` via a lazy `await import(...)`; `copyLocalSkills` carries `deleteAlternateSourceSkills` for that call.                                                                 |
| `config-gate/`, `recompileRegisteredProjectAgents`, `recompilePropagatedProjectAgents` | A write that propagates RECOMPILES the propagated projects' agents itself and returns a `GateReport`; callers render the report. Per-project failures are isolated, never fatal.                                                                                    |
| `compileAgents`                                                                        | Only a scope-UNfiltered pass with an `outputDir` may prune its directory. Scope-filtered passes see one scope's roster and must never delete another scope's files. Hand-authored agents are excluded by the `isAgentName` predicate, not by an allowlist.          |
| `detectProject`, `detectBothInstallations`                                             | A corrupt config is `ConfigLoadError`, distinct from a missing one (`null`). `detectProject` converts it to `null` for `doctor`/`edit`; `detectBothInstallations` lets it propagate so `compile` hard-errors before any write.                                      |
| `writeProjectConfig`                                                                   | `reconcileProjectSplitAgainstGlobal` runs immediately before BOTH project-config writes (`writeScopedFromWizard`'s project branch and `propagateGlobalChangesToProjects`), each of which then calls the shared `writeProjectConfigPair`.                            |
