---
scope: reference
area: features
keywords: [operations, composable, source, skills, project]
related:
  - reference/architecture-overview.md
  - reference/dependency-graph.md
  - reference/commands/index.md
  - reference/type-system.md
last_validated: 2026-04-21
---

# Operations Layer

**Last Updated:** 2026-04-21

## Overview

**Purpose:** Composable building blocks between CLI commands and lower-level lib functions. Each operation wraps one or more lib calls into a single typed function with explicit options/result types.
**Entry Point:** `src/cli/lib/operations/index.ts` (barrel export)
**Types Re-export:** `src/cli/lib/operations/types.ts`
**Key Files:** 19 production (2 root + 3 subdomain barrels + 14 operation files), 10 co-located test files

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

| File                                                          | Purpose                                                                                  | Subdomain |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| `src/cli/lib/operations/index.ts`                             | Barrel: re-exports all functions and types from subdomains                               | root      |
| `src/cli/lib/operations/types.ts`                             | Type-only re-exports for convenience imports                                             | root      |
| `src/cli/lib/operations/source/index.ts`                      | Barrel for source subdomain                                                              | source    |
| `src/cli/lib/operations/source/load-source.ts`                | Load skills matrix from resolved source                                                  | source    |
| `src/cli/lib/operations/source/ensure-marketplace.ts`         | Register/update marketplace with Claude CLI                                              | source    |
| `src/cli/lib/operations/skills/index.ts`                      | Barrel for skills subdomain                                                              | skills    |
| `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way merge skill discovery (global plugin, global local, project plugin, project local) | skills    |
| `src/cli/lib/operations/skills/collect-scoped-skill-dirs.ts`  | List local skill directories with scope annotations                                      | skills    |
| `src/cli/lib/operations/skills/copy-local-skills.ts`          | Copy local-source skills to scope-appropriate directories                                | skills    |
| `src/cli/lib/operations/skills/compare-skills.ts`             | Compare local skills against source versions                                             | skills    |
| `src/cli/lib/operations/skills/find-skill-match.ts`           | Find skill by exact ID, partial name, or directory name                                  | skills    |
| `src/cli/lib/operations/skills/install-plugin-skills.ts`      | Install skill plugins via Claude CLI by scope                                            | skills    |
| `src/cli/lib/operations/skills/uninstall-plugin-skills.ts`    | Uninstall skill plugins via Claude CLI by scope                                          | skills    |
| `src/cli/lib/operations/project/index.ts`                     | Barrel for project subdomain                                                             | project   |
| `src/cli/lib/operations/project/detect-project.ts`            | Detect installation + load project config                                                | project   |
| `src/cli/lib/operations/project/detect-both-installations.ts` | Detect global and project installations independently                                    | project   |
| `src/cli/lib/operations/project/compile-agents.ts`            | Compile agent markdown from templates + skills                                           | project   |
| `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI built-in and source agent definitions                                   | project   |
| `src/cli/lib/operations/project/write-project-config.ts`      | Build, merge, and write scoped project config files                                      | project   |

## Exported Types

### Source Types

| Type                | File                           | Fields                                                              |
| ------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `LoadSourceOptions` | `source/load-source.ts`        | `sourceFlag?, projectDir, forceRefresh?, captureStartupMessages?`   |
| `LoadedSource`      | `source/load-source.ts`        | `sourceResult: SourceLoadResult, startupMessages: StartupMessage[]` |
| `MarketplaceResult` | `source/ensure-marketplace.ts` | `marketplace: string \| null, registered: boolean`                  |

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

| Type                   | File                                   | Fields                                                                                                         |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DetectedProject`      | `project/detect-project.ts`            | `installation: Installation, config: ProjectConfig \| null, configPath: string \| null`                        |
| `BothInstallations`    | `project/detect-both-installations.ts` | `global: Installation \| null, project: Installation \| null, hasBoth: boolean`                                |
| `CompileAgentsOptions` | `project/compile-agents.ts`            | `projectDir, sourcePath, pluginDir?, skills?, agentScopeMap?, agents?, scopeFilter?, outputDir?, installMode?` |
| `CompilationResult`    | `project/compile-agents.ts`            | `compiled: AgentName[], failed: AgentName[], warnings: string[]`                                               |
| `ConfigWriteOptions`   | `project/write-project-config.ts`      | `wizardResult: WizardResultV2, sourceResult, projectDir, sourceFlag?, agents?`                                 |
| `ConfigWriteResult`    | `project/write-project-config.ts`      | `config: ProjectConfig, configPath, globalConfigPath?, wasMerged, existingConfigPath?, filesWritten`           |
| `AgentDefs`            | `project/load-agent-defs.ts`           | `agents: Record<AgentName, AgentDefinition>, sourcePath, agentSourcePaths`                                     |

## Exported Functions

### Source Operations

| Function            | Signature                                                        | Wraps                                                                                                           | Purpose                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSource`        | `(options: LoadSourceOptions) => Promise<LoadedSource>`          | `loadSkillsMatrixFromSource()` from `loading/index.js`, logger buffering utils                                  | Loads skills matrix; optionally captures startup messages via buffer mode                                                                                                                                                                                                              |
| `ensureMarketplace` | `(sourceResult: SourceLoadResult) => Promise<MarketplaceResult>` | `fetchMarketplace()` from `loading/index.js`, `claudePluginMarketplaceExists/Add/Update()` from `utils/exec.js` | Registers or updates marketplace with Claude CLI; lazy-resolves `sourceResult.marketplace` via `fetchMarketplace()` when undefined (mutates `sourceResult.marketplace` in place); returns `{ marketplace: null, registered: false }` when fetch fails; silent (callers decide logging) |

### Skills Operations

| Function                     | Signature                                                                                                 | Wraps                                                                                                                      | Purpose                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discoverInstalledSkills`    | `(projectDir: string) => Promise<DiscoveredSkills>`                                                       | `discoverAllPluginSkills()` from `plugins/index.js`, `loadSkillsFromDir()` (local), `discoverLocalProjectSkills()` (local) | 4-way merge: global plugins + global local + project plugins + project local                                                                                                                                                                       |
| `loadSkillsFromDir`          | `(skillsDir: string, pathPrefix?: string) => Promise<SkillDefinitionMap>`                                 | `glob()` from `utils/fs.js`, `parseFrontmatter()` from `loading/index.js`                                                  | Scans a directory for SKILL.md files and parses frontmatter                                                                                                                                                                                        |
| `discoverLocalProjectSkills` | `(projectDir: string) => Promise<SkillDefinitionMap>`                                                     | `loadSkillsFromDir()`                                                                                                      | Convenience wrapper: discovers from `<projectDir>/.claude/skills/`                                                                                                                                                                                 |
| `mergeSkills`                | `(...skillSources: SkillDefinitionMap[]) => SkillDefinitionMap`                                           | None (pure merge)                                                                                                          | Merges skill maps; later sources take precedence                                                                                                                                                                                                   |
| `collectScopedSkillDirs`     | `(projectDir: string) => Promise<ScopedSkillDirsResult>`                                                  | `fileExists()`, `listDirectories()` from `utils/fs.js`                                                                     | Lists local skill dirs from project and global scopes with dedup                                                                                                                                                                                   |
| `copyLocalSkills`            | `(skills: SkillConfig[], projectDir: string, sourceResult: SourceLoadResult) => Promise<SkillCopyResult>` | `resolveInstallPaths()` from `installation/index.js`, `copySkillsToLocalFlattened()` from `skills/index.js`                | Splits by scope, copies from source to local dirs                                                                                                                                                                                                  |
| `compareSkillsWithSource`    | `(projectDir: string, sourcePath: string, matrix: MergedSkillsMatrix) => Promise<SkillComparisonResults>` | `compareLocalSkillsWithSource()` from `skills/index.js`, `collectScopedSkillDirs()`                                        | Compares local skills (both scopes) against source; project takes precedence                                                                                                                                                                       |
| `buildSourceSkillsMap`       | `(matrix: MergedSkillsMatrix) => Record<string, {path: string}>`                                          | None (pure transform)                                                                                                      | Builds ID-to-path map of non-local skills from matrix                                                                                                                                                                                              |
| `findSkillMatch`             | `(skillName: string, results: SkillComparisonResult[]) => SkillMatchResult`                               | None (pure lookup)                                                                                                         | Exact ID -> partial name -> directory name -> fuzzy suggestions                                                                                                                                                                                    |
| `installPluginSkills`        | `(skills: SkillConfig[], marketplace: string, projectDir: string) => Promise<PluginInstallResult>`        | `claudePluginInstall()` from `utils/exec.js`, `getErrorMessage()` from `utils/errors.js`                                   | Installs marketplace-sourced skills (filters `source !== "eject"`) via Claude CLI with correct scope; per-skill errors collected into `failed[]` rather than thrown (D-229: callers MUST hard-error on non-empty `failed[]` before writing config) |
| `uninstallPluginSkills`      | `(skillIds: SkillId[], oldSkills: SkillConfig[], projectDir: string) => Promise<PluginUninstallResult>`   | `claudePluginUninstall()` from `utils/exec.js`, `getErrorMessage()` from `utils/errors.js`                                 | Uninstalls skills via Claude CLI using scope from `oldSkills` config; per-skill errors collected into `failed[]` (diagnostic only per D-229 — do not orphan-hard-error)                                                                            |

### Project Operations

| Function                  | Signature                                                        | Wraps                                                                                                                                                                                                                                                   | Purpose                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectProject`           | `(projectDir?: string) => Promise<DetectedProject \| null>`      | `detectInstallation()` from `installation/index.js`, `loadProjectConfig()` from `configuration/index.js`                                                                                                                                                | Detects installation + loads config; returns null if none found                                                                                                                                                                                                                                                                                                  |
| `detectBothInstallations` | `(projectDir: string) => Promise<BothInstallations>`             | `detectGlobalInstallation()`, `detectProjectInstallation()` from `installation/index.js`                                                                                                                                                                | Checks global and project independently; skips project when projectDir is home                                                                                                                                                                                                                                                                                   |
| `compileAgents`           | `(options: CompileAgentsOptions) => Promise<CompilationResult>`  | `recompileAgents()` from `agents/index.js`, `loadProjectConfigFromDir()` from `configuration/index.js`, `buildAgentScopeMap()` from `installation/index.js`                                                                                             | Compiles agent markdown; supports scopeFilter for dual-pass compilation                                                                                                                                                                                                                                                                                          |
| `loadAgentDefs`           | `(options?: {projectDir?, forceRefresh?}) => Promise<AgentDefs>` | `getAgentDefinitions()` from `agents/index.js`, `loadAllAgents()` from `loading/index.js`                                                                                                                                                               | Merges CLI built-in agents with source agents (source overrides CLI). Internally passes `undefined` as the remote source — callers cannot override.                                                                                                                                                                                                              |
| `writeProjectConfig`      | `(options: ConfigWriteOptions) => Promise<ConfigWriteResult>`    | `buildAndMergeConfig()` + `writeScopedConfigs()` + `resolveInstallPaths()` from `installation/index.js`, `loadAllAgents()` from `loading/index.js`, `ensureBlankGlobalConfig()` from `configuration/config-writer.js`, `ensureDir()` from `utils/fs.js` | Full config pipeline: build -> merge -> write scoped `config.ts` + `config-types.ts`. Project-scope `config-types.ts` emits import-from-global form (D-228 writer-selection rule — `writeScopedConfigs` routes project path through `regenerateConfigTypes`, never `writeStandaloneConfigTypes`). `filesWritten = 4` (project+global) or `2` (global-root only). |

## Command Consumers

| Command   | File                          | Operations Used                                                                                                                                                                                          |
| --------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`    | `src/cli/commands/init.tsx`   | `loadSource`, `loadAgentDefs`, `copyLocalSkills`, `ensureMarketplace`, `installPluginSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`                                           |
| `edit`    | `src/cli/commands/edit.tsx`   | `detectProject`, `loadSource`, `copyLocalSkills`, `ensureMarketplace`, `installPluginSkills`, `uninstallPluginSkills`, `loadAgentDefs`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills` |
| `compile` | `src/cli/commands/compile.ts` | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                   |
| `update`  | `src/cli/commands/update.tsx` | `loadSource`, `compareSkillsWithSource`, `compileAgents`, `collectScopedSkillDirs`, `findSkillMatch`, `discoverInstalledSkills`                                                                          |
| `doctor`  | `src/cli/commands/doctor.ts`  | `loadSource`, `detectProject`                                                                                                                                                                            |
| `search`  | `src/cli/commands/search.ts`  | `loadSource`                                                                                                                                                                                             |
| `eject`   | `src/cli/commands/eject.ts`   | `loadSource`                                                                                                                                                                                             |

## Data Flow

### Init Command Flow

```
init.run()
  |-> loadSource({ projectDir, sourceFlag, captureStartupMessages: true })
  |     -> loadSkillsMatrixFromSource() -> SourceLoadResult
  |     -> buffer/drain startup messages
  |-> render(<Wizard />) -> WizardResultV2
  |-> ensureMarketplace(sourceResult)
  |     -> claudePluginMarketplaceExists/Add/Update
  |-> copyLocalSkills(skills, projectDir, sourceResult)
  |     -> resolveInstallPaths() per scope
  |     -> copySkillsToLocalFlattened() per scope
  |-> installPluginSkills(skills, marketplace, projectDir)
  |     -> claudePluginInstall() per skill
  |-> writeProjectConfig({ wizardResult, sourceResult, projectDir })
  |     -> buildAndMergeConfig() -> config
  |     -> ensureBlankGlobalConfig()
  |     -> writeScopedConfigs() -> config.ts + config-types.ts
  |-> compileAgents({ projectDir, sourcePath })
        -> recompileAgents() -> agent .md files
```

### Compile Command Flow (Dual-Pass)

```
compile.run()
  |-> detectBothInstallations(projectDir)
  |     -> detectGlobalInstallation() + detectProjectInstallation()
  |-> loadAgentDefs(agentSource)
  |     -> getAgentDefinitions() + loadAllAgents() x2
  |-> discoverInstalledSkills(projectDir)
  |-> if hasBoth:
  |     compileAgents({ scopeFilter: "global", ... })
  |     compileAgents({ scopeFilter: "project", ... })
  |   else:
  |     compileAgents({ ... })  // single pass
```

### Edit Command Flow

```
edit.run()
  |-> detectProject(projectDir)
  |     -> detectInstallation() + loadProjectConfig()
  |-> loadSource({ projectDir, sourceFlag, captureStartupMessages: true })
  |-> discoverInstalledSkills(projectDir)
  |-> render(<Wizard />) -> WizardResultV2
  |-> ensureMarketplace(sourceResult)
  |-> uninstallPluginSkills(removedIds, oldSkills, projectDir)
  |-> copyLocalSkills(skills, projectDir, sourceResult)
  |-> installPluginSkills(skills, marketplace, projectDir)
  |-> writeProjectConfig({ wizardResult, sourceResult, projectDir, agents })
  |-> compileAgents({ projectDir, sourcePath })
```

## Lower-Level Lib Dependencies

| Operations Module                      | Imports From                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source/load-source.ts`                | `lib/loading/index.js` (`loadSkillsMatrixFromSource`), `utils/logger.js` (buffering)                                                                                                                                        |
| `source/ensure-marketplace.ts`         | `utils/exec.js` (Claude CLI marketplace commands), `lib/loading/index.js` (`fetchMarketplace`), `utils/logger.js`                                                                                                           |
| `skills/discover-skills.ts`            | `lib/plugins/index.js` (`discoverAllPluginSkills`), `utils/fs.js`, `lib/loading/index.js` (`parseFrontmatter`), `utils/logger.js` (verbose, warn), `utils/typed-object.js` (typedEntries, typedKeys), `consts.js`           |
| `skills/collect-scoped-skill-dirs.ts`  | `utils/fs.js` (`fileExists`, `listDirectories`), `consts.js`                                                                                                                                                                |
| `skills/copy-local-skills.ts`          | `lib/installation/index.js` (`resolveInstallPaths`), `lib/skills/index.js` (`copySkillsToLocalFlattened`), `utils/fs.js` (`ensureDir`)                                                                                      |
| `skills/compare-skills.ts`             | `lib/skills/index.js` (`compareLocalSkillsWithSource`), `utils/typed-object.js`, `skills/collect-scoped-skill-dirs.js` (internal)                                                                                           |
| `skills/find-skill-match.ts`           | `lib/skills/index.js` (types only: `SkillComparisonResult`)                                                                                                                                                                 |
| `skills/install-plugin-skills.ts`      | `utils/exec.js` (`claudePluginInstall`), `utils/errors.js`                                                                                                                                                                  |
| `skills/uninstall-plugin-skills.ts`    | `utils/exec.js` (`claudePluginUninstall`), `utils/errors.js`                                                                                                                                                                |
| `project/detect-project.ts`            | `lib/installation/index.js` (`detectInstallation`), `lib/configuration/index.js` (`loadProjectConfig`)                                                                                                                      |
| `project/detect-both-installations.ts` | `lib/installation/index.js` (`detectGlobalInstallation`, `detectProjectInstallation`)                                                                                                                                       |
| `project/compile-agents.ts`            | `lib/agents/index.js` (`recompileAgents`), `lib/configuration/index.js` (`loadProjectConfigFromDir`), `lib/installation/index.js` (`buildAgentScopeMap`)                                                                    |
| `project/load-agent-defs.ts`           | `lib/agents/index.js` (`getAgentDefinitions`), `lib/loading/index.js` (`loadAllAgents`), `consts.js`                                                                                                                        |
| `project/write-project-config.ts`      | `lib/installation/index.js` (`buildAndMergeConfig`, `writeScopedConfigs`, `resolveInstallPaths`), `lib/loading/index.js` (`loadAllAgents`), `lib/configuration/config-writer.js` (`ensureBlankGlobalConfig`), `utils/fs.js` |

## Design Conventions

- **Pure options/result types** -- Every operation defines explicit option and result types. No raw primitives or tuples.
- **Silent by default** -- Operations use `verbose()` for diagnostics. Commands decide what to log to the user based on result fields.
- **Scope-aware** -- Operations that touch the filesystem split by `"project" | "global"` scope. See `copyLocalSkills`, `installPluginSkills`, `collectScopedSkillDirs`.
- **Non-throwing where possible** -- `detectProject` returns `null` instead of throwing. `ensureMarketplace` catches fetch failures gracefully. Plugin install/uninstall collect failures into result arrays.
- **Internal cross-references** -- Operations may call other operations in the same subdomain (e.g., `compareSkillsWithSource` calls `collectScopedSkillDirs`).

## Related Findings

| Finding | Affects                                        | Contract Rule                                                                                                                                                              |
| ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-217   | `installPluginSkills`                          | Per-skill plugin reference format is `{skillId}@{marketplace}` — see `installPluginSkills` plugin ref construction.                                                        |
| D-228   | `writeProjectConfig`                           | Project `config-types.ts` must be written via `regenerateConfigTypes` (import-from-global), never `writeStandaloneConfigTypes`. `writeScopedConfigs` enforces this.        |
| D-229   | `installPluginSkills`, `uninstallPluginSkills` | `failed[]` on `PluginInstallResult` MUST trigger `this.error(...)` before `writeProjectConfig` in callers. Uninstall `failed[]` is diagnostic-only — no hard-error needed. |
