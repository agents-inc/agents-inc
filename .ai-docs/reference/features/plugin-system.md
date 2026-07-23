---
scope: reference
area: features
keywords: [plugins, manifest, marketplace, installation, discovery, per-skill-source, hard-error]
related:
  - reference/features/compilation-pipeline.md
  - reference/features/skills-and-matrix.md
  - reference/commands/index.md
  - reference/concepts/scope-system.md
last_validated: 2026-07-23
---

# Plugin System

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

## Overview

**Purpose:** Discover, validate, and manage Claude Code plugins (skills and agents packaged for native installation).

**Location:** `src/cli/lib/plugins/`

## Files

| File                        | Path                                            | Purpose                                                          |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `plugin-manifest.ts`        | `src/cli/lib/plugins/plugin-manifest.ts`        | Generate plugin.json manifests                                   |
| `plugin-manifest-finder.ts` | `src/cli/lib/plugins/plugin-manifest-finder.ts` | Find plugin manifest in directory                                |
| `plugin-finder.ts`          | `src/cli/lib/plugins/plugin-finder.ts`          | Locate plugin directories and files                              |
| `plugin-info.ts`            | `src/cli/lib/plugins/plugin-info.ts`            | Plugin info formatting/display                                   |
| `plugin-validator.ts`       | `src/cli/lib/plugins/plugin-validator.ts`       | Validate plugin structure/content                                |
| `plugin-discovery.ts`       | `src/cli/lib/plugins/plugin-discovery.ts`       | Discover all installed plugins                                   |
| `plugin-settings.ts`        | `src/cli/lib/plugins/plugin-settings.ts`        | Plugin settings/paths resolution                                 |
| `plugin-ref.ts`             | `src/cli/lib/plugins/plugin-ref.ts`             | Plugin-ref construction (`{id}@{marketplace}`) and scope mapping |
| `index.ts`                  | `src/cli/lib/plugins/index.ts`                  | Barrel exports                                                   |

## Plugin Structure

A Claude Code plugin has this structure:

```
.claude-plugin/
  plugin.json          # Plugin manifest
skills/
  {skill-name}/
    SKILL.md           # Skill content
    metadata.yaml      # Skill metadata
agents/
  {agent-name}.md      # Compiled agent prompt
```

### Plugin Manifest (`plugin.json`)

Type: `PluginManifest` (`src/cli/types/plugins.ts`)

```typescript
type PluginManifest = {
  name: string; // kebab-case (e.g., "skill-react")
  version?: string;
  description?: string;
  author?: PluginAuthor;
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  skills?: string | string[];
  hooks?: string | Record<string, AgentHookDefinition[]>;
};
```

## Plugin Locations

All location functions are in `src/cli/lib/plugins/plugin-finder.ts`:

| Function                   | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `getUserPluginsDir()`      | User-level plugins dir                      |
| `getCollectivePluginDir()` | Collective (shared) plugins dir             |
| `getProjectPluginsDir()`   | Project-level plugins: `.claude/plugins/`   |
| `getPluginSkillsDir()`     | Skills subdirectory within a plugin         |
| `getPluginAgentsDir()`     | Agents subdirectory within a plugin         |
| `getPluginManifestPath()`  | Path to plugin.json within a plugin dir     |
| `readPluginManifest()`     | Read and parse plugin.json from a dir       |
| `getPluginSkillIds()`      | Extract SkillIds from plugin SKILL.md files |

Note: `getPluginManifestPath()` is defined once (in `plugin-finder.ts`) and re-exported via the `plugins/index.ts` barrel; compilation (`stack-plugin-compiler.ts`) imports it from `../plugins` to resolve the output manifest path.

Plugin manifest directory: `.claude-plugin/` (`PLUGIN_MANIFEST_DIR` from `src/cli/consts.ts`)

## Plugin Manifest Finder

**File:** `src/cli/lib/plugins/plugin-manifest-finder.ts`

**Function:** `findPluginManifest(startDir)` - Walks up from `startDir` looking for `.claude-plugin/plugin.json`. Returns the manifest path or `null`.

## Plugin Discovery

**Function:** `discoverAllPluginSkills()` at `src/cli/lib/plugins/plugin-discovery.ts`

Discovers all installed skill plugins in a project directory:

1. Reads `.claude/settings.json` to find enabled plugins
2. Looks up install paths in global plugin registry
3. Loads skills from plugin cache directories
4. Returns `SkillDefinitionMap` (alias for `Partial<Record<SkillId, SkillDefinition>>`)

**Function:** `hasIndividualPlugins()` - Checks if any plugins exist (for init guard).

**Function:** `listPluginNames()` - List all plugin names.

## Plugin Info

**File:** `src/cli/lib/plugins/plugin-info.ts`

| Function                      | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `getPluginInfo()`             | Get plugin info (name, version, skill/agent count) |
| `formatPluginDisplay()`       | Format plugin info for terminal display            |
| `getInstallationInfo()`       | Get installation info (mode, paths, counts)        |
| `formatInstallationDisplay()` | Format installation info for terminal display      |

Types:

- `PluginInfo` - Plugin metadata with name, version, skill/agent counts, path
- `InstallationInfo` - Installation metadata with mode, paths, counts

## Plugin Validation

**Function:** `validatePlugin()` in `src/cli/lib/plugins/plugin-validator.ts`

Validates:

- Plugin structure via `validatePluginStructure()` (manifest dir exists)
- Plugin manifest via `validatePluginManifest()` (valid JSON, required fields)
- Skill files via `validatePluginSkillFiles()` (SKILL.md has valid frontmatter)
- Agent files via `validatePluginAgentFiles()` (agent .md files have valid frontmatter)

Individual frontmatter validators (exported):

- `validateSkillFrontmatter()` - Validate a single SKILL.md file
- `validateAgentFrontmatter()` - Validate a single agent .md file

**Function:** `validateAllPlugins()` - Validate all plugins in a directory.

**Function:** `printPluginValidationResult()` - Format validation results for display.

## Manifest Generation

| Function                        | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `generateSkillPluginManifest()` | Generate manifest for a skill plugin  |
| `generateAgentPluginManifest()` | Generate manifest for an agent plugin |
| `generateStackPluginManifest()` | Generate manifest for a stack plugin  |
| `writePluginManifest()`         | Write plugin.json to disk             |
| `getPluginDir()`                | Get plugin output directory path      |

Options types:

- `SkillManifestOptions`
- `AgentManifestOptions`
- `StackManifestOptions`

## Stack Plugin Compilation

**File:** `src/cli/lib/stacks/stack-plugin-compiler.ts` (re-exported via `src/cli/lib/stacks/index.ts`)

Compiles a stack (a named agent + skill bundle) into a self-contained Claude Code plugin directory: builds a `ProjectConfig` from the stack, resolves its agents and skills, copies each skill's source directory into `skills/`, renders every agent via `compileAgentForPlugin` (`src/cli/lib/compiler.ts`) into `agents/`, copies the stack's `CLAUDE.md` when present, then writes `plugin.json` + `README.md` with a content-hash-derived version.

| Symbol                                 | Kind     | Purpose                                                                                                             |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `compileStackPlugin(options)`          | function | Full compile of one stack into a plugin dir; returns `CompiledStackPlugin`                                          |
| `StackPluginOptions`                   | type     | `{ stackId, outputDir, projectRoot, agentSourcePath?, stack? }` — `stack?` bypasses loading from `config/stacks.ts` |
| `CompiledStackPlugin`                  | type     | `{ pluginPath, manifest, stackName, agents: AgentName[], skillPlugins: SkillId[], hasHooks }`                       |
| `printStackCompilationSummary(result)` | function | Log the compiled stack name, path, agent list, and included skills to stdout                                        |

**Version stamping:** `determinePluginVersion(newHash, pluginDir, getPluginManifestPath)` (`src/cli/lib/versioning.ts`) compares a private `hashStackConfig()` digest (name + description + sorted skill ids + sorted agent names) against the existing manifest's content hash; `writeContentHash()` persists the new hash. The manifest comes from `generateStackPluginManifest()` (see Manifest Generation).

**Consumers:** `src/cli/lib/stacks/stack-installer.ts` — `compileStackToTemp()` compiles into an `os.tmpdir()` directory and returns a `cleanup()`; `installStackAsPlugin()` either installs a marketplace-qualified ref (`buildMarketplacePluginRef(stackId, marketplace)`) or compiles locally to temp and runs `claudePluginInstall(result.pluginPath, "project", projectDir)`.

## Stale Plugin Pruning (`build plugins`)

**File:** `src/cli/commands/build/plugins.ts` (the `build plugins` command; `baseFlags = {}` so no `--source`).

After a clean full-scan skill compile (`compileAllSkillPlugins`), `pruneStaleSkillPlugins(outputDir, expectedSkillPlugins)` deletes plugin directories in `outputDir` that no longer map to a compiled skill. Guards:

- **Only skill plugins are pruned.** A directory is skipped when it has no `plugin.json` (`readPluginManifest()` returns `null`) or when the manifest declares `agents` (agent plugins are out of this run's authority).
- **Pruning is skipped entirely** (`compileSkills()` returns `null`) in single-skill mode (`--skill`, which would wipe every other plugin) or when any skill failed to compile (a failed skill is indistinguishable from a removed one, so the expected set would be incomplete).

## Plugin Settings

**File:** `src/cli/lib/plugins/plugin-settings.ts`

| Function                          | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `getEnabledPluginKeys()`          | Read enabled plugins from settings.json |
| `resolvePluginInstallPaths()`     | Resolve plugin paths from settings      |
| `getVerifiedPluginInstallPaths()` | Verified paths (check existence)        |

Types:

- `PluginKey` - Plugin identifier in settings
- `ResolvedPlugin` - Resolved plugin with path and metadata

## Marketplace

### Marketplace Type (`src/cli/types/plugins.ts`)

```typescript
type Marketplace = {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  owner: MarketplaceOwner;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePlugin[];
};
```

### Marketplace Generation

**File:** `src/cli/lib/marketplace-generator.ts`

Generates `marketplace.json` from a source directory containing skills. Exports: `generateMarketplace()` (build the `Marketplace` object), `writeMarketplace()` (write it to disk), and `getMarketplaceStats()` (plugin counts for display).

### Marketplace Commands (via Claude CLI)

Executed through `src/cli/utils/exec.ts`:

| Function                            | Shell Command                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudePluginInstall()`             | `claude plugin install {path} --scope {scope}`                                                                                                       |
| `claudePluginUninstall()`           | `claude plugin uninstall {name} --scope {scope}` (swallows "not installed"/"not found")                                                              |
| `claudePluginUninstallBestEffort()` | Calls `claudePluginUninstall({ref})` on the primary scope then the fallback scope, swallowing errors on each — for ambiguous/re-scoped registrations |
| `claudePluginMarketplaceList()`     | `claude plugin marketplace list --json`                                                                                                              |
| `claudePluginMarketplaceExists()`   | Checks if marketplace is registered (calls List)                                                                                                     |
| `claudePluginMarketplaceAdd()`      | `claude plugin marketplace add {source}`                                                                                                             |
| `claudePluginMarketplaceRemove()`   | `claude plugin marketplace remove {name}`                                                                                                            |
| `claudePluginMarketplaceUpdate()`   | `claude plugin marketplace update {name}`                                                                                                            |
| `isClaudeCLIAvailable()`            | `claude --version` (returns boolean)                                                                                                                 |

`claudePluginInstall()` and `claudePluginUninstall()` accept a `scope: ClaudePluginScope` (`"project" | "user"`, defined in `src/cli/types/config.ts`) and a `projectDir` parameter. User-scoped operations run from `os.homedir()` via `resolvePluginCwd()` (scope `"user"` -> `os.homedir()`, else `projectDir`) so Claude CLI writes to `~/.claude/settings.json`. All inputs validated for injection prevention (`validatePluginPath()` / `validatePluginName()`) before execution.

## Plugin Reference Formats

Two distinct plugin-ref shapes exist. They are NOT interchangeable -- each is consumed by a different system.

| Form                      | Where                                                           | Who emits                                       | Who consumes                                                              | Purpose                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `{skillId}@{marketplace}` | `installPluginSkills`, `uninstallPluginSkills`, `mode-migrator` | `buildMarketplacePluginRef()` (`plugin-ref.ts`) | `claude plugin install` / `claude plugin uninstall` shell commands        | Tells Claude CLI which marketplace to pull the plugin from (same qualified ref for install AND uninstall -- bare ids do not match the registry) |
| `${id}:${id}`             | `compileAgentForPlugin` via `derivePluginRef`                   | `compiler.ts` (both functions live here)        | Rendered agent prompt (frontmatter `skills:` + body `skill:` invocations) | Tells Claude Code that a referenced skill is plugin-installed (vs ejected)                                                                      |

**`plugin-ref.ts` helpers** (`src/cli/lib/plugins/plugin-ref.ts`, re-exported via `plugins/index.ts`):

- `buildMarketplacePluginRef(id, marketplace)` -> `${id}@${marketplace}` -- the registry form the Claude CLI expects.
- `parseMarketplacePluginRef(ref)` -> skill id (returns the whole string when no `@` is present) -- inverse of the above.
- `toClaudePluginScope(scope)` -> `ClaudePluginScope` -- maps cc `SkillScope` to Claude CLI scope (`"global"` -> `"user"`; anything else, including `undefined` -> `"project"`).

`derivePluginRef(skill)` (private to `src/cli/lib/compiler.ts`) returns `undefined` when `skill.source` is `"eject"` (`EJECT_SOURCE`) or `undefined`, producing a bare id in the compiled agent output. User-authored local skills (no `SkillConfig` entry, therefore no `source`) legitimately fall through to bare id -- this is the expected path, not a silent fallback.

### Verified benign: `sourceById` id-keyed map vs dual-scope same-id skills

`buildCompileAgents` (`local-installer.ts`) builds `sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.source]))` keyed by `SkillId` alone. The config's dual-scope compound key is `(id, scope)`, so a last-write-wins map could theoretically stamp the wrong `source` onto a compiled `SkillReference` when the same id appears twice (e.g. active project-eject entry + global tombstone with a different source).

**Verification (finding `2026-07-18-sourceById-collapse-unreachable-in-production.md`): the collapse is NOT reachable through any production command.** Two independent safeguards prevent it:

1. **Tombstones are filtered before `buildCompileAgents` in every live path.** `init`, `edit`, and `compile` all route through the operations-layer `compileAgents` -> `recompileAgents`, which calls `filterExcludedEntries(projectConfig)` (`agent-recompiler.ts`) -- keeping only `!s.excluded` skills -- BEFORE `buildCompileAgents`. The tombstone is dropped, so `sourceById` never sees two entries for one id.
2. **Config ordering makes last-write-wins safe even without the filter.** `generateProjectConfigWithInlinedGlobal` (`config-writer.ts`) always emits global entries first, project (active) entries second; the active project entry (serialized last) wins the map.

The only callers that pass an unfiltered config straight into `buildCompileAgents` are `installEject` and `installPluginConfig` (`local-installer.ts`), and both are currently dead code (no command or operation calls them). Empirically confirmed by the E2E regression test `e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`, which compiles a genuine dual-scope mixed-source config via `cc compile` and asserts the correct per-scope ref format in both directions. The format decision itself is `derivePluginRef` in `compiler.ts` (`source === undefined || "eject"` -> bare id; otherwise `id:id`).

## Installation Modes

### Plugin Mode

Skills installed as Claude Code plugins, agents compiled to `.claude/agents/`.

**Function:** `installPluginConfig()` in `src/cli/lib/installation/local-installer.ts`
(Re-exported from `src/cli/lib/installation/index.ts`)

### Eject Mode

Skills copied locally via eject workflow.

**Function:** `installEject()` (Re-exported from `src/cli/lib/installation/index.ts`)

> **Note (dead code):** `installPluginConfig()` and `installEject()` are still exported and re-exported but have NO command/operation callers (verified in finding `2026-07-18-sourceById-collapse-unreachable-in-production.md`). The live install paths run through the command steps (`installPluginsStep`/`copyEjectSkillsStep` in `init.tsx`, `applyPluginChanges` in `edit.tsx`) and the operations layer, then compile agents via `compileAgents` -> `recompileAgents`. These two wrappers are the only paths that would bypass `filterExcludedEntries` before `buildCompileAgents`.

### Scope-Aware Installation

`installPluginConfig()` uses `writeScopedConfigs()` to split config by scope:

- Global-scoped skills/agents go to `~/.claude-src/config.ts` and `~/.claude/agents/`
- Project-scoped skills/agents go to `{projectDir}/.claude-src/config.ts` and `{projectDir}/.claude/agents/`

Key helper functions in `local-installer.ts`:

| Function                | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `setConfigMetadata()`   | Set source/marketplace/domains on config         |
| `buildAndMergeConfig()` | Build config from wizard and merge with existing |
| `writeConfigFile()`     | Write config.ts using `generateConfigSource()`   |
| `buildCompileAgents()`  | Build agent compile config from ProjectConfig    |
| `buildAgentScopeMap()`  | Map agent names to their scope                   |
| `writeScopedConfigs()`  | Split and write configs by scope                 |

Path resolution moved out of `local-installer.ts`: `resolveInstallPaths(projectDir, scope)` (returns `InstallPaths`), `installBaseDir()`, and `isHomeDirectory()` now live in `src/cli/lib/installation/install-base-dir.ts` and `is-home-directory.ts` (both re-exported from `installation/index.ts`).

### Detection

**Function:** `detectInstallation()` in `src/cli/lib/installation/installation.ts`

Returns `Installation` type with `mode`, `configPath`, `agentsDir`, `skillsDir`, `projectDir`.

Detection logic:

1. Check for project-level installation via `detectProjectInstallation()`
2. If not found, fall back to global installation via `detectGlobalInstallation()`
3. Each checks for `.claude-src/config.ts` and loads config to determine mode

Install mode is derived at runtime from the skills array via `deriveInstallMode()`:

- Empty skills array = `"eject"` mode (default)
- All `source: "eject"` = `"eject"` mode
- All non-eject sources = `"plugin"` mode
- Mixed = `"mixed"` mode

**D-217 -- per-skill `source` is authoritative for compilation:** Aggregate `installMode` is a UI/logging convenience, NOT the input that drives agent compilation. `compileAgentForPlugin` (`src/cli/lib/compiler.ts`) calls `derivePluginRef(skill)` for each `SkillReference` and attaches `pluginRef` only when `skill.source` is a non-eject, non-undefined marketplace name. Mixed-mode agents (plugin and eject skills under the same agent) and dual-scope skills (same id, different scope, different sources) each render correctly from per-skill `source`.

**D-217 -- plumbing consolidated:** The vestigial `installMode?: InstallMode` parameter documented in finding `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` has since been removed. `compileAndWriteAgents` (now private in `local-installer.ts`) and `RecompileAgentsOptions` (`agent-recompiler.ts`) no longer carry it; the `CompileAndWriteParams` type no longer exists; and `installEject` / `installPluginConfig` no longer pass `deriveInstallMode(...)`. Aggregate `installMode` now survives only in genuine consumers: `init.tsx` computes `deriveInstallMode(activeSkills)` to drive the install plan/logging (`logInstallPlan`, choosing `copyEjectSkillsStep` vs `installPluginsStep`), and `SkillSource.installMode?` (`src/cli/types/matrix.ts`) is a per-source UI descriptor.

**Function:** `getInstallationOrThrow()` in `src/cli/lib/installation/installation.ts` - Same as `detectInstallation()` but throws if no installation found.

## Mode Migration

**File:** `src/cli/lib/installation/mode-migrator.ts`
(Re-exported from `src/cli/lib/installation/index.ts`)

Handles skill source and scope migrations when editing an installation:

| Function                                           | Purpose                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `detectMigrations()`                               | Compare old/new `SkillConfig[]` to detect source/scope changes             |
| `executeMigration(plan, projectDir, sourceResult)` | Execute per-skill migration: copy/delete locals, install/uninstall plugins |

`executeMigration` takes `sourceResult` (a `SourceLoadResult`) because plugin install/uninstall needs `sourceResult.marketplace` to build qualified refs. A missing marketplace is handled asymmetrically (finding `2026-07-20-migration-path-missing-marketplace-precondition.md`): the `toEject` branch warns and skips its (diagnostic-only) plugin uninstalls, whereas the `toPlugin` branch throws before any destructive step -- plugin install intent is inviolable, so it fails while the ejected working copies are still intact rather than deleting them and demoting the failure to a warning.

Types:

- `SkillMigration` - Single skill migration with `id`, `oldSource`/`newSource`, `oldScope`/`newScope`
- `MigrationPlan` - Contains `toEject`, `toPlugin`, `scopeChanges` arrays
- `MigrationResult` - Contains `ejectedSkills`, `pluginizedSkills`, `failedPluginInstalls`, `warnings`

Migration splits skills by scope before copying (project skills to `{projectDir}/.claude/skills/`, global to `~/.claude/skills/`). Plugin refs are qualified via `buildMarketplacePluginRef(migration.id, sourceResult.marketplace)`; the toEject branch uninstalls through `claudePluginUninstallBestEffort()` (a re-scoped plugin's registered scope is ambiguous), while toPlugin installs with `toClaudePluginScope(newScope)`. The toPlugin branch installs each plugin BEFORE deleting its ejected working copy (`deleteEjectedWorkingCopy()`), so a failed install destroys nothing -- per-skill failures accumulate in `MigrationResult.failedPluginInstalls` for the caller to hard-error on.

### Plugin Scope Migration (edit command)

`executeMigration` handles SOURCE changes (eject <-> plugin). SCOPE changes (project <-> global) for plugin-mode skills use a separate engine local to the `edit` command:

**Function:** `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` in `src/cli/commands/edit.tsx` (exported `@internal` for testing). Iterates `Map<SkillId, ScopeChange>`, skips eject-mode skills (those route through `migrateLocalSkillScope` in the same command), and for each plugin-mode skill installs the marketplace-qualified ref (`buildMarketplacePluginRef(skillId, marketplace)`) at the new Claude scope (`toClaudePluginScope(change.to)`):

- **project -> global:** uninstall the `"project"`-scope registration, then install at `"user"` scope.
- **global -> project:** keep the global registration (other projects still need it), just install the added project scope.

**Type:** `PluginScopeMigrationResult` — `{ migrated: SkillId[], failed: Array<{ id: SkillId; error: string }> }`. Per-skill install/uninstall errors accumulate in `failed`; the caller (`applyScopeChanges` in `edit.tsx`) warns per failure. The marketplace is resolved first via `requireMarketplaceOrExit()`, and only when at least one plugin-mode scope change exists.

## Operations Layer (Plugin Operations)

Plugin-related operations extracted to `src/cli/lib/operations/`:

### Install Plugin Skills

**File:** `src/cli/lib/operations/skills/install-plugin-skills.ts`

**Function:** `installPluginSkills(skills, marketplace, projectDir)` -- Installs non-local skills as Claude CLI plugins. Filters to `source !== EJECT_SOURCE`, builds refs via `buildMarketplacePluginRef(skill.id, marketplace)`, routes by `toClaudePluginScope(skill.scope)` (`"global"` -> `"user"` CLI scope, otherwise `"project"`). Errors from `claudePluginInstall` are captured per-skill; the function itself never throws.

**Type:** `PluginInstallResult` -- `{ installed: Array<{ id: SkillId; ref: string }>, failed: Array<{ id: SkillId; error: string }> }`

**Helper:** `pluginInstallFailureError(failedCount)` (exported from the same file) returns the canonical hard-error message callers pass to `this.error()`: _"Failed to install N plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, re-run with --refresh to update the marketplace, or switch affected skills to eject mode."_

**D-229 -- hard-error contract (callers):** When `PluginInstallResult.failed` is non-empty, callers MUST `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs. Otherwise `config.ts` claims plugin installation for skills that `claude plugin install` rejected, producing orphan entries that no `cc` command can self-heal (`detectInstallation` trusts `config.ts`). Enforced at every per-skill install site: `installPluginsStep` (`init.tsx`), `applyPluginChanges` (newly-added skills, `edit.tsx`), and `applyMigrations` (eject->plugin migrations, `edit.tsx` -- D-252 extends the same guard to the migration path via `MigrationResult.failedPluginInstalls`). Uninstall failures are diagnostic-only (no orphan state). See the CLAUDE.md rule ("NEVER let plugin install per-skill failures silently produce orphan config entries") and finding `2026-07-20-migration-path-missing-marketplace-precondition.md`.

### Uninstall Plugin Skills

**File:** `src/cli/lib/operations/skills/uninstall-plugin-skills.ts`

**Function:** `uninstallPluginSkills(skillIds, oldSkills, marketplace, projectDir)` -- Uninstalls plugins using scope from the OLD config entries (`toClaudePluginScope(oldSkills.find(s => s.id === skillId)?.scope)`; the new config has no entry for removed skills). Each ref is qualified via `buildMarketplacePluginRef(skillId, marketplace)` so it matches the form used at install time -- bare skill ids silently no-op against the registry.

**Type:** `PluginUninstallResult` -- `{ uninstalled: SkillId[], failed: Array<{ id: SkillId; error: string }> }`

**Install/uninstall symmetry (finding `2026-04-22-plugin-uninstall-bare-id-asymmetry-with-install.md`):** The `marketplace` parameter was added so uninstall qualifies refs identically to install. Callsites with ambiguous registered scope (re-scoped skills, cleanup paths) use `claudePluginUninstallBestEffort()` from `exec.ts` instead of inlining two try-blocks.

### Ensure Marketplace

**File:** `src/cli/lib/operations/source/ensure-marketplace.ts`

**Function:** `ensureMarketplace(sourceResult)` -- Registers or updates the marketplace with the Claude CLI. Lazy-resolves marketplace name via `fetchMarketplace()` if `sourceResult.marketplace` is undefined; mutates `sourceResult.marketplace` in place. If lazy resolution fails, returns `{ marketplace: null, registered: false }` (callers then hard-error via `requireMarketplaceOrExit()` in `base-command.ts`, which wraps the operations-layer `requireMarketplace()` and calls `this.error()` on an unresolved marketplace -- see `init.tsx` and `edit.tsx`). On update failure, warns and continues with cached version. Silent operation otherwise -- callers decide logging.

**Type:** `MarketplaceResult` -- `{ marketplace: string | null, registered: boolean }`

Uses `claudePluginMarketplaceExists()`, `claudePluginMarketplaceAdd()`, and `claudePluginMarketplaceUpdate()` from exec.ts.

## Plugin Registry Verification

Plugin-mode skills leave no files under `.claude/skills/` — they live in the Claude plugin registry (`installed_plugins.json` + `settings.json`). Two independent code paths reconcile config plugin entries against that registry.

### Doctor `plugins` Check

**Function:** `checkPluginSkillsInstalled(config, projectDir)` in `src/cli/commands/doctor.ts` (check `kind: "plugins"`, labelled "Plugins Installed").

Filters `config.skills` to `source !== EJECT_SOURCE`, groups them by `installBaseDir(projectDir, scope)`, and for each base dir reads the registry via `getVerifiedPluginInstallPaths(baseDir)` and maps each `ResolvedPlugin.pluginKey` through `parseMarketplacePluginRef()` back to a bare skill id. Any plugin-mode config skill whose id is absent from the registry is reported as `warn` ("N skills not installed as plugins"). Registry membership, not disk existence, is the source of truth for plugin-mode skills.

### CLI-Installed Key Derivation (uninstall)

**Function:** `getCliInstalledPluginKeys(config)` in `src/cli/commands/uninstall.tsx` (exported `@internal` for testing). Returns the `Set<string>` of registry keys this CLI installed, used by `detectUninstallTarget()` to narrow `listPluginNames()` to CLI-owned plugins (`cliPluginNames`) so uninstall never removes plugins the user installed by hand.

For each `config.skills` entry it emits the primary key `buildMarketplacePluginRef(skill.id, skill.source)`, plus a marketplace variant `buildMarketplacePluginRef(skill.id, config.marketplace)` when `config.marketplace` is set and differs from both `skill.source` and `EJECT_SOURCE` (covers plugins registered under the marketplace name while config recorded a differing `source`). This derivation depends on `config.marketplace` being present: **D-246** (shipped 0.143.0) fixed `mergeGlobalConfigs` dropping `marketplace`/`source` from the global config written during a project-scope init — previously `uninstall --yes --all` at the home root found no CLI-owned plugins, left every plugin registered, then deleted the config that recorded them.

## Installation Barrel Exports

**File:** `src/cli/lib/installation/index.ts`

Re-exports from `installation.ts`: `InstallMode`, `Installation`, `detectGlobalInstallation`, `INSTALL_MODE_LABELS`, `detectInstallation`, `detectProjectInstallation`, `getInstallationOrThrow`, `deriveInstallMode`

Re-exports from `local-installer.ts`: `EjectInstallOptions`, `EjectInstallResult`, `PluginConfigResult`, `installEject`, `installPluginConfig`, `buildAndMergeConfig`, `writeConfigFile`, `writeScopedConfigs`, `setConfigMetadata`, `buildEjectSkillsMap`, `buildCompileAgents`, `buildAgentScopeMap`, `deregisterProjectPath`, `propagateGlobalChangesToProjects`

Re-exports from `install-base-dir.ts`: `installBaseDir`, `resolveInstallPaths`, `InstallPaths`

Re-exports from `is-home-directory.ts`: `isHomeDirectory`

Re-exports from `mode-migrator.ts`: `SkillMigration`, `MigrationPlan`, `MigrationResult`, `detectMigrations`, `executeMigration`
