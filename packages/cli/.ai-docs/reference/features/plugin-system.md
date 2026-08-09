---
scope: reference
area: features
keywords:
  [
    plugins,
    manifest,
    marketplace,
    installation,
    discovery,
    per-skill-source,
    hard-error,
    installed_plugins.json,
    v2-registry,
    cross-scope-reconciliation,
    masking,
    derived-mask,
    settings.json,
  ]
related:
  - reference/features/compilation-pipeline.md
  - reference/features/skills-and-matrix.md
  - reference/commands/index.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/config/config-writer.md
last_validated: 2026-07-30
---

# Plugin System

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

Note: `getPluginManifestPath()` is defined once (in `plugin-finder.ts`) and re-exported via the `plugins/index.ts` barrel; the skill and agent plugin compilers (`skill-plugin-compiler.ts`, `agent-plugin-compiler.ts`) import it from `../plugins` to resolve the output manifest path.

Plugin manifest directory: `.claude-plugin/` (`PLUGIN_MANIFEST_DIR` from `src/cli/consts.ts`)

## Plugin Manifest Finder

**File:** `src/cli/lib/plugins/plugin-manifest-finder.ts`

**Function:** `findPluginManifest(startDir)` - Walks up from `startDir` looking for `.claude-plugin/plugin.json`. Returns the manifest path or `null`.

## Plugin Discovery

**Function:** `discoverAllPluginSkills(projectDir)` at `src/cli/lib/plugins/plugin-discovery.ts`

Discovers all installed skill plugins in a project directory:

1. Reads `{projectDir}/.claude/settings.json` to find enabled plugins (`getEnabledPluginKeys`)
2. Looks up install paths in the global v2 registry `~/.claude/plugins/installed_plugins.json` (`resolvePluginInstallPaths`)
3. Filters to paths whose `.claude-plugin/plugin.json` exists (`getVerifiedPluginInstallPaths`)
4. Loads skills from each verified plugin directory via `loadPluginSkills`
5. Returns `SkillDefinitionMap` (alias for `Partial<Record<SkillId, SkillDefinition>>`); later plugins override earlier

All three discovery functions swallow their own errors and degrade to an empty result — discovery is advisory, never a hard failure.

| Function                       | Returns    | Purpose                                                     |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| `discoverAllPluginSkills(dir)` | skill map  | Full skill definitions from every enabled + verified plugin |
| `hasIndividualPlugins(dir)`    | `boolean`  | Any verified plugin exists (init guard)                     |
| `listPluginNames(dir)`         | `string[]` | Verified plugin KEYS (`{id}@{marketplace}`), not bare names |

## Plugin Info

**File:** `src/cli/lib/plugins/plugin-info.ts`

| Function                      | Purpose                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `getPluginInfo(projectDir?)`  | `PluginInfo` from `listPluginNames()`, or `null` when no plugins are enabled     |
| `formatPluginDisplay()`       | Format plugin info for terminal display                                          |
| `getInstallationInfo()`       | `InstallationInfo` from `detectInstallation()`, or `null` when nothing installed |
| `formatInstallationDisplay()` | Format installation info for terminal display (used by `list`)                   |

```typescript
type PluginInfo = {
  name: string; // always DEFAULT_PLUGIN_NAME
  version: string; // always DEFAULT_DISPLAY_VERSION ("0.0.0") — placeholder, not a real version
  skillCount: number;
  agentCount: number; // always 0 on this path
  path: string;
};

type InstallationInfo = {
  mode: InstallMode;
  name: string;
  skillCount: number;
  agentCount: number;
  configPath: string;
  /** Every directory that actually holds compiled agents; empty when no scope has any. */
  agentDirs: string[];
  skillsDir: string;
};
```

**`InstallationInfo.version` was REMOVED**. It only ever held the install mode, and `formatInstallationDisplay` prefixed it with `v`, so `list` printed `Installation: agents-inc vplugin`. The mode is now rendered once from `INSTALL_MODE_LABELS[info.mode]`.

**Counting rules in `getInstallationInfo()`:**

| Aspect         | Rule                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scopes counted | `installedScopes()` — `["project"]` at the home root, `["global", "project"]` in a project context (a project also owns HOME)                                      |
| Skill count    | `mode === "plugin"` counts registry-discoverable skills via `discoverAllPluginSkills`; otherwise counts dirs under each `skillsDir`                                |
| Agent count    | `countCompiledAgentsPerScope()` counts `*.md` files per scope's `agentsDir`, keyed by directory                                                                    |
| `agentDirs`    | Only directories with a non-zero count — a default project install compiles every agent under HOME, so naming the project dir would name a directory never written |

## Settings Integration

**File:** `src/cli/lib/permission-checker.tsx`

`readSettingsPermissions()` reads `permissions` out of every `settings.json` / `settings.local.json` and says nothing about any other field. The file belongs to Claude Code, which adds keys on its own release schedule, so no expected-key list for it can be kept complete — the CLI consumes one key and owns none. `settingsFileSchema` models only `permissions` and passes the rest through untouched. Unknown-field warnings remain for files this CLI does own (`marketplace.json`, via `source-fetcher.ts`).

**Do not reintroduce an expected-keys allowlist here.** `warnUnknownFields(raw, EXPECTED_SETTINGS_KEYS, ...)` needs a new entry every time Claude Code — or this CLI's own plugin-install path, which writes `enabledPlugins` and `extraKnownMarketplaces` — grows one, a race the list cannot win.

`settings.local.json` wins over `settings.json` for the `permissions` block; a malformed file warns and is skipped rather than throwing.

## Plugin Validation

**Function:** `validatePlugin()` in `src/cli/lib/plugins/plugin-validator.ts`

Validates:

- Plugin structure via `validatePluginStructure()` (manifest dir exists) — exported
- Plugin manifest via `validatePluginManifest()` (valid JSON, required fields) — exported
- Skill files via `validatePluginSkillFiles()` (SKILL.md has valid frontmatter) — **private**, runs only when the manifest declares `skills`
- Agent files via `validatePluginAgentFiles()` (agent .md files have valid frontmatter) — **private**, runs only when the manifest declares `agents`

A `pluginPath` that no longer exists on disk fails `validatePluginStructure()` and surfaces as an invalid plugin rather than a crash — this is what lets `doctor`'s plugins content check walk registry-recorded install paths directly.

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
| `writePluginManifest()`         | Write plugin.json to disk             |
| `getPluginDir()`                | Get plugin output directory path      |

Options types:

- `SkillManifestOptions`
- `AgentManifestOptions`

## Stack Plugin Compilation — removed

There is no stack→plugin compiler. `compileStackPlugin()`, its `installStackAsPlugin()` /
`compileStackToTemp()` wrappers in `stack-installer.ts`, and everything only they reached
(`StackPluginOptions`, `CompiledStackPlugin`, `printStackCompilationSummary`,
`generateStackPluginManifest`, `StackManifestOptions`, `convertStackToCompileConfig`) were deleted
in CLI-459: no command, operation or wizard path ever called any of it, and its specs reported
green over behaviour no user could reach.

Stacks reach a project through the **install path**, not through a plugin bundle — `loadStackById`
seeds `existingStack` in `local-installer.ts`, and agents compile through
`writeCompiledAgentsByScope`. Skill and agent plugins are still built; see Manifest Generation above
and [compilation-pipeline.md](./compilation-pipeline.md).

## Stale Plugin Pruning (`build plugins`)

**File:** `src/cli/commands/build/plugins.ts` (the `build plugins` command; no `--source` — it reads a local directory).

After a clean full-scan skill compile (`compileAllSkillPlugins`), `pruneStaleSkillPlugins(outputDir, expectedSkillPlugins)` deletes plugin directories in `outputDir` that no longer map to a compiled skill. Guards:

- **Only skill plugins are pruned.** A directory is skipped when it has no `plugin.json` (`readPluginManifest()` returns `null`) or when the manifest declares `agents` (agent plugins are out of this run's authority).
- **Pruning is skipped entirely** (`compileSkills()` returns `null`) in single-skill mode (`--skill`, which would wipe every other plugin) or when any skill failed to compile (a failed skill is indistinguishable from a removed one, so the expected set would be incomplete).

## Plugin Settings and the claude CLI v2 Registry

**File:** `src/cli/lib/plugins/plugin-settings.ts`

| Function                                      | Purpose                                                                                        | On failure                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `getEnabledPluginKeys(projectDir)`            | Keys whose value is `true` in `{projectDir}/.claude/settings.json` -> `enabledPlugins`         | `verbose()` + `[]`                               |
| `getInstalledPluginsRegistryPath(pluginsDir)` | `{pluginsDir}/installed_plugins.json`                                                          | n/a (pure path)                                  |
| `listRegisteredPluginInstalls(pluginsDir)`    | EVERY install recorded in that registry, flattened to unique `(pluginKey, installPath)` pairs  | **throws** — the registry is the source of truth |
| `resolvePluginInstallPaths(keys, projectDir)` | Resolve the given keys against `getUserPluginsDir()`'s registry, one pick per key              | `verbose()` + `[]`                               |
| `getVerifiedPluginInstallPaths(projectDir)`   | `getEnabledPluginKeys` -> `resolvePluginInstallPaths` -> keep only paths whose manifest exists | `verbose()` + `[]`                               |

Types:

- `PluginKey` — `string`. Format `{plugin-name}@{marketplace}` (deliberately not a union: plugin and marketplace names are user-extensible).
- `ResolvedPlugin` — `{ pluginKey: PluginKey; installPath: string }`.

### `installed_plugins.json` (v2 registry layout)

claude CLI >= 2.1.220 records installs in `{pluginsDir}/installed_plugins.json` and installs under a `cache/<marketplace>/<plugin>/<version>/` layout, so the plugin directories are NOT direct children of the plugins dir any more. The Zod schemas at this parse boundary are `installedPluginsSchema` (top-level, `.passthrough()`) wrapping `pluginInstallationSchema` (per-record, plain `z.object`):

```typescript
{
  version: number,                 // 2
  plugins: Record<PluginKey, Array<{
    scope: "user" | "project" | "local",
    projectPath?: string,
    installPath: string,           // required
    version: string,               // required
    installedAt: string,           // required
    lastUpdated?: string,
    gitCommitSha?: string,
  }>>
}
```

**Selection precedence** (`pickInstallation`, private): this project's own `scope: "project"` record whose `projectPath === projectDir` wins; otherwise the `scope: "user"` record. No other scope is picked.

**Asymmetry to know:** `resolvePluginInstallPaths` always reads `getUserPluginsDir()`'s registry (`~/.claude/plugins/`), while `getEnabledPluginKeys` reads the settings file under the directory it is handed. `getVerifiedPluginInstallPaths(baseDir)` therefore means "plugins enabled at `baseDir`, resolved through the single global registry" — which is what the doctor check relies on when it passes a per-scope `installBaseDir`.

**Error policy split:** `listRegisteredPluginInstalls` throws on an unreadable or schema-invalid registry (callers treat it as authoritative), whereas `resolvePluginInstallPaths` degrades to `[]` (it feeds advisory discovery).

Test helper: `writeTestInstalledPluginsRegistry(pluginsDir, installPathsByKey)` in `src/cli/lib/__tests__/helpers/disk-writers.ts` writes this shape.

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

| Function                            | Shell Command                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudePluginInstall()`             | `claude plugin install {path} --scope {scope}`                                                                                                                                                                                                             |
| `claudePluginUninstall()`           | `claude plugin uninstall {name} --scope {scope}` (swallows "not installed"/"not found")                                                                                                                                                                    |
| `claudePluginUninstallBestEffort()` | Calls `claudePluginUninstall({ref})` on the primary scope then the fallback scope, swallowing errors on each. **Sole production caller: `uninstallPlugins()` in `src/cli/commands/uninstall.tsx`** — `mode-migrator.ts` moved to a scope-precise uninstall |
| `claudePluginMarketplaceList()`     | `claude plugin marketplace list --json`                                                                                                                                                                                                                    |
| `claudePluginMarketplaceExists()`   | Checks if marketplace is registered (calls List)                                                                                                                                                                                                           |
| `claudePluginMarketplaceAdd()`      | `claude plugin marketplace add {source}`                                                                                                                                                                                                                   |
| `claudePluginMarketplaceRemove()`   | `claude plugin marketplace remove {name}`                                                                                                                                                                                                                  |
| `claudePluginMarketplaceUpdate()`   | `claude plugin marketplace update {name}`                                                                                                                                                                                                                  |
| `isClaudeCLIAvailable()`            | `claude --version` (returns boolean)                                                                                                                                                                                                                       |

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

`writeScopedFromWizard()` in `src/cli/lib/config-gate/index.ts` is the single scope-splitting writer. Signature:

```typescript
writeScopedFromWizard(args: {
  finalConfig: ProjectConfig;
  matrix: MergedSkillsMatrix;
  agents: Partial<Record<AgentName, AgentDefinition>>;
  projectDir: string;
  projectConfigPath: string;
  projectInstallationExists: boolean;
}): Promise<GateReport>

type GateReport = {
  /** True when either half of the global pair was actually rewritten. */
  globalWritten: boolean;
  /** What moved between the config on disk and the one written. */
  changes: GlobalChangeSet;
  /** Registered project dirs this write's propagation rewrote, and the ones it
   *  could not reach. */
  propagated: { updated: string[]; skipped: string[] };
  /** The recompile the GATE already performed in `propagated.updated`. */
  recompile: { recompiledCount: number; failedCount: number; warnings: string[] };
};
```

- Global-scoped skills/agents go to `~/.claude-src/config.ts` and `~/.claude/agents/`
- Project-scoped skills/agents go to `{projectDir}/.claude-src/config.ts` and `{projectDir}/.claude/agents/`

**Two branches, keyed on `isHomeDirectory(projectDir)`:**

| Branch                   | Behaviour                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home root (global scope) | Classify against the config on disk -> `writeGlobalPair(finalConfig)` (both halves, write-if-changed) -> propagate to every entry in `finalConfig.projects` -> recompile those projects                                |
| Project context          | `splitConfigByScope(finalConfig)` -> `resolveEffectiveGlobalConfig` (merge + register) -> classify -> conditional global pair write -> propagate + recompile per the tier -> **reconcile** -> `writeProjectConfigPair` |

**Project-branch write gate:** the project `config.ts` is written when `projectInstallationExists` OR the reconciled project split has any skills/agents. Creating a project config holding only `import globalConfig` + `{ ...globalConfig }` is pointless, so that case is skipped with a `verbose()` note.

**Callers of `writeScopedFromWizard` (exactly two):**

| Caller                                                                            | Path                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `writeProjectConfig()` — `src/cli/lib/operations/project/write-project-config.ts` | The LIVE path. `init` and `edit` reach the gate only through here.                             |
| `writeConfigAndCompileAgents()` (private, `local-installer.ts`)                   | Only reached from `installEject` / `installPluginConfig` — both dead code (see the note above) |

Both pass `!isHomeDirectory(projectDir)` as `projectInstallationExists`. In the project branch that argument is therefore always `true`, so the `hasProjectItems` disjunct and the skip branch are currently unreachable in production — the parameter name describes an intent no caller supplies. `writeProjectConfig` re-exposes the result as `ConfigWriteResult.propagation`.

Key config-write functions, now in `src/cli/lib/config-gate/` (`index.ts` is the module's only public surface; nothing below is re-exported by `installation/index.ts`):

| Function                                                                   | Exported | Purpose                                                                                           |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `setConfigMetadata()` (`local-installer.ts`)                               | yes      | Set source/marketplace/domains on config                                                          |
| `buildAndMergeConfig()` (`local-installer.ts`)                             | yes      | Build config from wizard and merge with existing                                                  |
| `buildCompileAgents()` (`local-installer.ts`)                              | yes      | Build agent compile config from `ProjectConfig`                                                   |
| `buildAgentScopeMap()` (`local-installer.ts`)                              | yes      | Map agent names to their scope (`activeAgentScopeMap`)                                            |
| `writeScopedFromWizard()`                                                  | gate     | Split and write configs by scope; propagates, recompiles, returns `GateReport`                    |
| `reconcileTypesFromDisk()`                                                 | gate     | Regenerate one scope's `config-types.ts` from its persisted config (used by `compile`)            |
| `mutateGlobal()` / `propagateGlobalRemoval()` / `ensureBlankPair()`        | gate     | Typed global mutation; global-uninstall prune + recompile; blank-pair creation                    |
| `writeProjectPartial()`                                                    | gate     | Project-only config writes; throws `GlobalPairWriteViolation` at `$HOME`                          |
| `mergeGlobalConfigs()`                                                     | gate     | Additive merge of new global items into the existing global config (never removes)                |
| `writeConfigFile()`                                                        | private  | Write config.ts using `generateConfigSource()`                                                    |
| `writeProjectConfigPair()`                                                 | private  | The ONE writer of a project's `config.ts` + `config-types.ts`, used by both emitting sites        |
| `propagateGlobalChangesToProjects()`                                       | private  | Rewrite every registered project's `config.ts` + `config-types.ts` against fresh global data      |
| `pruneGlobalEntriesFromRegisteredProjects()`                               | private  | Global-uninstall variant: propagates an EMPTIED global config so all global rows/tombstones drop  |
| `registerProjectPath()` / `deregisterProjectPath()`                        | private  | Maintain the global `projects[]` registry (deregistration is reached via `mutateGlobal`)          |
| `resolveEffectiveGlobalConfig()`                                           | private  | Merge + register; returns `{ config, globalDataChanged, changed }`                                |
| `reconcileProjectSplitAgainstGlobal()`                                     | private  | Cross-scope masking + self-heal — see Cross-Scope Reconciliation below                            |
| `classifyGlobalChange()` / `consequenceTier()`                             | private  | Decide what a write owes: T1 propagate+recompile, T2 config-half fan-out, T3 nothing, T4 no write |
| `writeGlobalPair()` / `writeGlobalConfigHalf()` / `writeGlobalTypesHalf()` | private  | The only writers of `~/.claude-src/config.ts` and `config-types.ts`; token-held, write-if-changed |
| `buildProjectTypesExtras()` / `buildConfigTypesBackgroundData()`           | private  | Inputs for `regenerateConfigTypes` (project extends global unions)                                |

Path resolution lives outside both modules: `resolveInstallPaths(projectDir, scope)` (returns `InstallPaths`), `installBaseDir()`, `getProjectConfigPath()` in `src/cli/lib/installation/install-base-dir.ts`, and `isHomeDirectory()` in `src/cli/lib/installation/is-home-directory.ts`.

### Propagation Then Recompile

`propagateGlobalChangesToProjects()` rewrites a registered project's `config.ts` and `config-types.ts` but **never touches its compiled `.claude/agents/*.md`**. On its own that leaves the compiled agents emitting whatever skill-reference form the OLD global data dictated — so a global plugin-to-eject switch left stale `name:name` plugin references in every registered project.

The recompile is **inside the write**, not caller-side: a caller that must remember to recompile is a caller that can forget, and two did (`edit`'s project-context source migration, the global `uninstall`).

| Step | Symbol                                   | File                                                         | Role                                                                                                                                                                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `propagateGlobalChangesToProjects(...)`  | `src/cli/lib/config-gate/propagate.ts`                       | Rewrites each registered project's pair; returns `{ updated, skipped }`                                                                                                          |
| 2    | `recompilePropagated(updated)`           | `src/cli/lib/config-gate/recompile.ts`                       | Runs in the same call, for a T1 change only; lazily imports the operation below                                                                                                  |
| 3    | `recompilePropagatedProjectAgents(dirs)` | `src/cli/lib/operations/project/recompile-project-agents.ts` | Sequential loop with per-project failure isolation; returns `PropagatedRecompileSummary`                                                                                         |
| 4    | `recompileRegisteredProjectAgents(dir)`  | same file                                                    | Recompiles ONE project's **project-scoped** agents (global agents were already done by the triggering operation's own pass)                                                      |
| —    | Renderers                                | `init.tsx`, `edit.tsx`, `compile.ts`, `uninstall.tsx`        | Each prints `GateReport.recompile`; the work is already done. `edit` prints `registered project(s)`, the others `registered projects` — both forms are asserted by e2e constants |

`recompileRegisteredProjectAgents` passes `skills` explicitly (from `discoverInstalledSkills`) — without it `recompileAgents` falls back to `discoverAllPluginSkills`, which sees plugin skills only and would strip every global-local and project-local skill from the compiled agents.

`PropagatedRecompileSummary` — `{ recompiledCount: number; failedCount: number; warnings: string[] }`.

### Detection

**Function:** `detectInstallation(projectDir?)` in `src/cli/lib/installation/installation.ts`

Returns `Installation` — `{ mode, configPath, agentsDir, skillsDir, projectDir }`.

Detection logic:

1. Check for project-level installation via `detectProjectInstallation()`
2. If not found, fall back to global installation via `detectGlobalInstallation()`
3. Both delegate to the private `detectInstallationInDir(dir)`

`detectInstallationInDir` returns `null` in exactly three cases, and **throws in a fourth**:

| Case                                              | Result                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.claude-src/config.ts` absent                    | `null`                                                                              |
| File vanished between `fileExists` and the load   | `null`                                                                              |
| Config declares neither skills nor agents         | `null` — content-less configs are not installations, so `init` routes to the wizard |
| Config present but unparseable / schema-violating | `ConfigLoadError` propagates out of `loadProjectConfigFromDir`                      |

The last row keeps a corrupt config distinguishable from "no config" — collapsing the two detects a phantom eject installation and makes `compile` rebuild every built-in agent. `compile` hard-errors before any write, `detectProject` converts the error to `null` so `doctor` and `edit` report a config problem, and detection no longer fabricates an installation.

`skillsDir` is `.claude/plugins` in `"plugin"` mode and `.claude/skills` otherwise (mixed mode has local skills on disk, so it uses the eject-mode directory).

Install mode is derived at runtime from the skills array via `deriveInstallMode()`:

- Empty skills array = `"eject"` mode (default)
- All `source: "eject"` = `"eject"` mode
- All non-eject sources = `"plugin"` mode
- Mixed = `"mixed"` mode

**per-skill `source` is authoritative for compilation:** Aggregate `installMode` is a UI/logging convenience, NOT the input that drives agent compilation. `compileAgentForPlugin` (`src/cli/lib/compiler.ts`) calls `derivePluginRef(skill)` for each `SkillReference` and attaches `pluginRef` only when `skill.source` is a non-eject, non-undefined marketplace name. Mixed-mode agents (plugin and eject skills under the same agent) and dual-scope skills (same id, different scope, different sources) each render correctly from per-skill `source`.

**`installMode` plumbing consolidated:** The vestigial `installMode?: InstallMode` parameter documented in finding `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` has since been removed. `compileAndWriteAgents` (now private in `local-installer.ts`) and `RecompileAgentsOptions` (`agent-recompiler.ts`) no longer carry it; the `CompileAndWriteParams` type no longer exists; and `installEject` / `installPluginConfig` no longer pass `deriveInstallMode(...)`. Aggregate `installMode` now survives only in genuine consumers: `init.tsx` computes `deriveInstallMode(activeSkills)` to drive the install plan/logging (`logInstallPlan`, choosing `copyEjectSkillsStep` vs `installPluginsStep`), and `SkillSource.installMode?` (`src/cli/types/matrix.ts`) is a per-source UI descriptor.

**Function:** `getInstallationOrThrow()` in `src/cli/lib/installation/installation.ts` - Same as `detectInstallation()` but throws if no installation found.

## Cross-Scope Reconciliation (Masking)

**File:** `src/cli/lib/config-gate/propagate.ts`. Every reconciliation helper named below is **module-private** — none is exported through `config-gate/index.ts`, and `installation/index.ts` no longer re-exports anything in this area. The two write sites (`propagateGlobalChangesToProjects`, the project branch of `writeScopedFromWizard`) both funnel into the shared `writeProjectConfigPair`.

### Why it exists

Two production call sites write a project `config.ts` with the global config inlined (`writeConfigFile(..., { isProjectConfig: true, globalConfig })`). Both must reconcile the project's own entries against the live global config first, or the project ends up with **one id active at both scopes** — and, when category exclusivity is involved, two live skills in a category that permits one. Symptoms observed against the built CLI: the wizard showed both selected, the next save seeded both into a fresh agent stack, and the compiled agent was instructed to load two frameworks — while `doctor` reported the install clean and exited 0 through both of its layers, because neither the content checks nor the operational checks read config semantics.

| Write site                                                      | Reconciled                                          |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `propagateGlobalChangesToProjects()` (a global change fans out) | yes — via `reconcileProjectSplitAgainstGlobal`      |
| project branch of `writeScopedFromWizard()`                     | yes — via the SAME helper (previously: none at all) |

Findings: `2026-07-29-project-config-written-by-two-paths-only-one-reconciled.md` (the asymmetry), `2026-07-29-category-exclusivity-enforced-only-in-a-keypress-handler.md` (exclusivity was enforced only in `toggleTechnology`, a keypress handler).

### Entry point

```typescript
reconcileProjectSplitAgainstGlobal(
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig
```

Order is fixed and load-bearing — **self-heal runs BEFORE masking on both axes**, so a mask whose collision has cleared is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees still-warranted tombstones:

1. `dropOrphanedDerivedMasks(projectSplit.skills, matrix)` -> `healedSkills`
2. `dropOrphanedDerivedAgentMasks(projectSplit.agents)` -> `healedAgents`
3. `skills: [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)]`
4. `agents: [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)]`

**Masking is PROJECT-LOCAL.** The `globalConfig` argument is read, never rewritten — a tombstone never belongs in `~/.claude-src/config.ts`.

### Collision kinds

`buildProjectCollisionTest(projectOwnedSkills, matrix)` returns the single `(id) => boolean` predicate shared by the mask producer AND the self-heal, so the two can never disagree about what a mask means.

| Kind         | Condition                                                                                                        | Applies to                              | Task |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---- |
| **IDENTITY** | The project owns the same id/name at project scope (`isActiveAt(entry, "project")`)                              | skills AND agents                       |
| **CATEGORY** | The project owns a DIFFERENT active skill in the same category and the matrix declares that category `exclusive` | skills only — agents have no categories |

Supporting helpers:

| Helper                                    | Rule                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `categoryOfSkill(id, matrix)`             | `matrix.skills[id]?.category`; `undefined` when the id is absent from the matrix OR sits in `LOCAL_PSEUDO_CATEGORY`. Never throws. |
| `isExclusiveCategory(category, matrix)`   | `matrix.categories[category]?.exclusive === true` — read from the MERGED matrix so a source repo's overrides are honoured          |
| `activeProjectCategories(skills, matrix)` | Categories occupied by an active project-scoped skill                                                                              |

**An undeclared `exclusive` flag is deliberately NOT treated as exclusive.** The wizard's renderer defaults an undeclared category to exclusive (`src/cli/lib/wizard/build-step-logic.ts` and `src/cli/components/hooks/use-build-step-props.ts` both use `cat.exclusive ?? true`), but a rule that MASKS persisted entries must only fire on a flag the data actually carries. A custom skill absent from the matrix therefore participates in identity collisions only, and never throws. `LOCAL_PSEUDO_CATEGORY` (`"local"`, from `src/cli/consts.ts`) is excluded from category rules entirely.

### Mask producers

| Function                                                        | Emits                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `maskCollidingGlobalSkills(projectOwned, globalConfig, matrix)` | For each `isActiveAt(globalEntry, "global")` skill that collides and is not `alreadyTombstoned`: `{ ...globalEntry, excluded: true }` |
| `maskCollidingGlobalAgents(projectOwned, globalConfig)`         | Agent mirror, IDENTITY only                                                                                                           |

Tombstones are **spread from the global entry**, so they carry the global install's `source`. A skill the project merely inherits (no active project-scope entry, no exclusive-category collision) is skipped — it stays a single active global entry. An id the project already tombstones is skipped, which is what makes re-running idempotent.

**Push-side symmetry:** because the tombstone is synthesized on the write/push side rather than at deselect time, a project that owned a skill or agent at project scope now gets its global tombstone when the same id **later** becomes active globally. Global-first and project-first installs therefore agree, and both render `[P][G]`.

### Self-heal (mask lifetime)

| Function                                               | Retention test                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `dropOrphanedDerivedMasks(projectOwnedSkills, matrix)` | Keep a global tombstone iff `buildProjectCollisionTest` still returns true for its id |
| `dropOrphanedDerivedAgentMasks(projectOwnedAgents)`    | Keep iff an active project-scoped agent of the same name still exists                 |

A derived mask and a user-authored tombstone are byte-identical on disk (`{ id, scope: "global", excluded: true }`). The wizard cannot mint the second kind: a project-scope deselect of a globally-installed item is refused, and a domain deselect only drops what the project owns. The one remaining user route to a global tombstone is the `s` scope toggle (G->P), which always pairs it with an active project entry for the same id — an IDENTITY collision. Every **bare** mask is therefore machine-derived by construction, which is what lets the retention rule collapse to a single test.

This generalised the earlier rule, which was narrowed to categories declared BOTH `exclusive` AND `required` precisely because provenance was ambiguous; that narrowing and its documented trade-off are gone. See findings `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable.md` (superseded) and `2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md`.

### Deliberate asymmetry with the exclusive-swap guard

The project's own skill **wins locally**. This is intentionally the opposite of the wizard guard: `toggleTechnology` refuses a user-initiated exclusive swap that would displace a globally-locked skill (`wouldDropLockedSkill` -> `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`).

| Situation                                                                    | Winner           | Rationale                                                        |
| ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| User actively swaps to a different skill in an exclusive category (wizard)   | global (refused) | The user is displacing a shared install every project sees       |
| A global install lands on top of pre-existing project state (reconciliation) | project (masked) | Letting global win would silently uninstall the user's own skill |

Both are consistent with the rule that a globally installed item is immutable from project scope: reconciliation **masks** the global entry in the project's config, it never removes it from the global config.

### Companion retain/prune helpers (propagation path only)

These run in `propagateGlobalChangesToProjects` before the shared reconciliation:

| Function                                                         | Purpose                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `retainProjectOwnedSkills(skills, globalConfig)`                 | Keep project-scoped entries + tombstones whose global entry is still active; drop tombstones for removed globals |
| `retainProjectOwnedAgents(agents, globalConfig)`                 | Agent mirror                                                                                                     |
| `computeRemovedGlobalSkillIds(priorProjectSkills, globalConfig)` | Ids the project inherited from global, no longer active globally, and not owned at project scope                 |
| `retainReconciledStack(stack, removedGlobalSkillIds)`            | Drop only those ids from per-agent stack assignments; returns the input unchanged when nothing was removed       |
| `globalHasActiveSkill()` / `globalHasActiveAgent()`              | `isActiveAt(entry, "global")` probes against the live global config                                              |

Predicates come from `src/cli/lib/configuration/scope-predicates.ts`: `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, `activeAgentScopeMap`, `effectivelyExcludedSkillIds`.

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

Migration splits skills by scope before copying (project skills to `{projectDir}/.claude/skills/`, global to `~/.claude/skills/`). Plugin refs are qualified via `buildMarketplacePluginRef(migration.id, sourceResult.marketplace)`. The toPlugin branch installs each plugin BEFORE deleting its ejected working copy (`deleteEjectedWorkingCopy()`), so a failed install destroys nothing -- per-skill failures accumulate in `MigrationResult.failedPluginInstalls` for the caller to hard-error on.

**the toEject uninstall is SCOPE-PRECISE.** It calls `claudePluginUninstall(pluginRef, toClaudePluginScope(migration.oldScope), projectDir)`, targeting the migration's own registered scope, and NOT `claudePluginUninstallBestEffort()`. A both-scopes sweep would also drop a same-id plugin registered at the OTHER Claude scope — e.g. switching a project to eject would uninstall the still-registered global/user-scope plugin that other projects depend on. The registered scope is unambiguous here, so it is targeted exactly; `claudePluginUninstall` still swallows "not installed" / "not found".

Two scope-keyed skips guard the global registration in both directions:

| Branch     | Skip condition                                    | Reason                                                                                           |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `toEject`  | `oldScope === "global" && newScope === "project"` | The global plugin must remain for other projects; the project tombstone already masks it locally |
| `toPlugin` | same condition, in `deleteEjectedWorkingCopy()`   | The global ejected copy must remain for other projects                                           |

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

**Helper:** `pluginInstallFailureError(failedCount)` (exported from the same file) returns the canonical hard-error message callers pass to `this.error()`: _"Failed to install N plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, run '<CLI_INVOKE_COMMAND> update' to refresh the marketplace, or switch affected skills to eject mode."_

**Hard-error contract (callers):** When `PluginInstallResult.failed` is non-empty, callers MUST `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs. Otherwise `config.ts` claims plugin installation for skills that `claude plugin install` rejected, producing orphan entries that no `cc` command can self-heal (`detectInstallation` trusts `config.ts`). Enforced at every per-skill install site: `installPluginsStep` (`init.tsx`), `applyPluginChanges` (newly-added skills, `edit.tsx`), and `applyMigrations` (eject->plugin migrations, `edit.tsx` — the same guard covers the migration path via `MigrationResult.failedPluginInstalls`). Uninstall failures are diagnostic-only (no orphan state). See the CLAUDE.md rule ("NEVER let plugin install per-skill failures silently produce orphan config entries") and finding `2026-07-20-migration-path-missing-marketplace-precondition.md`.

### Uninstall Plugin Skills

**File:** `src/cli/lib/operations/skills/uninstall-plugin-skills.ts`

**Function:** `uninstallPluginSkills(skillIds, oldSkills, marketplace, projectDir)` -- Uninstalls plugins using scope from the OLD config entries (`toClaudePluginScope(oldSkills.find(s => s.id === skillId)?.scope)`; the new config has no entry for removed skills). Each ref is qualified via `buildMarketplacePluginRef(skillId, marketplace)` so it matches the form used at install time -- bare skill ids silently no-op against the registry.

**Type:** `PluginUninstallResult` -- `{ uninstalled: SkillId[], failed: Array<{ id: SkillId; error: string }> }`

**Install/uninstall symmetry (finding `2026-04-22-plugin-uninstall-bare-id-asymmetry-with-install.md`):** The `marketplace` parameter was added so uninstall qualifies refs identically to install.

**Which uninstall helper to use:**

| Situation                                                                           | Helper                                   | Why                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Registered scope is KNOWN (old config entry, migration plan)                        | `claudePluginUninstall(ref, scope, dir)` | Scope-precise. A both-scopes sweep would also drop a same-id plugin at the other scope |
| Registered scope is genuinely AMBIGUOUS (`uninstall` cleaning up re-scoped plugins) | `claudePluginUninstallBestEffort()`      | Tries primary then fallback, swallowing both — one caller only                         |

### Ensure Marketplace

**File:** `src/cli/lib/operations/source/ensure-marketplace.ts`

**Function:** `ensureMarketplace(sourceResult)` -- Registers or updates the marketplace with the Claude CLI. Lazy-resolves marketplace name via `fetchMarketplace()` if `sourceResult.marketplace` is undefined; mutates `sourceResult.marketplace` in place. If lazy resolution fails, returns `{ marketplace: null, registered: false }` (callers then hard-error via `requireMarketplaceOrExit()` in `base-command.ts`, which wraps the operations-layer `requireMarketplace()` and calls `this.error()` on an unresolved marketplace -- see `init.tsx` and `edit.tsx`). On update failure, warns and continues with cached version. Silent operation otherwise -- callers decide logging.

**Type:** `MarketplaceResult` -- `{ marketplace: string | null, registered: boolean }`

Uses `claudePluginMarketplaceExists()`, `claudePluginMarketplaceAdd()`, and `claudePluginMarketplaceUpdate()` from exec.ts.

## Plugin Registry Verification

Plugin-mode skills leave no files under `.claude/skills/` — they live in the Claude plugin registry (`installed_plugins.json` + `settings.json`). Three independent code paths reconcile installed plugins against that registry.

### Doctor `Plugins` Content Check

**Function:** `validatePluginsDirectory(pluginsDir)` in `src/cli/lib/content-validator.ts` — module-private, reached through the exported `validateInstalledPlugins(projectDir)`, which runs it over `getUserPluginsDir()` and — outside the home root — `getProjectPluginsDir(cwd)`. It is the `Plugins` row of `doctor`'s content layer, the first of its two layers.

Resolution order per plugins directory:

| Step | Condition                                                                    | Action                                                                                  |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | Directory absent                                                             | `NOTHING_VALIDATED` — count 0, zero issues                                              |
| 2    | `installed_plugins.json` exists                                              | `validateRegistryPlugins()` — validate each recorded `installPath`                      |
| 3    | Registry records ZERO installs (`validateRegistryPlugins` -> `undefined`)    | Fall through to the direct-children scan                                                |
| 4    | Registry unreadable / schema-invalid (`listRegisteredPluginInstalls` throws) | One **error** issue against the registry file itself, count stays 0 — no scan around it |
| 5    | No registry                                                                  | `findPluginDirectories()` + `validateAllPlugins()` (older / manual layouts)             |

**The pass must not inspect only direct children of the plugins directory** — that makes the claude CLI >= 2.1.220 cache layout invisible and leaves installed plugins unvalidated. A recorded `installPath` that no longer exists surfaces as an invalid plugin through `validatePlugin`'s structure check.

Every row returns a `ContentValidation` (`count`, `issues`, `notes`); `doctor` maps it onto the same `CheckResult` shape its operational rows use, so one formatter and one exit code cover both layers. `doctor` itself has `static flags = {}` — it is a zero-flag command, as the `validate` it absorbed was.

### Doctor `Plugins Installed` Operational Check

**Function:** `checkPluginSkillsInstalled(config, projectDir)` in `src/cli/commands/doctor.ts` (check `kind: "plugins"`, labelled "Plugins Installed"). This is the second layer — it runs only when every content check above passed.

Filters `config.skills` to `source !== EJECT_SOURCE`, groups them by `installBaseDir(projectDir, scope)`, and for each base dir reads the registry via `getVerifiedPluginInstallPaths(baseDir)` and maps each `ResolvedPlugin.pluginKey` through `parseMarketplacePluginRef()` back to a bare skill id. Any plugin-mode config skill whose id is absent from the registry is reported as `warn` ("N skills not installed as plugins"). Registry membership, not disk existence, is the source of truth for plugin-mode skills.

### CLI-Installed Key Derivation (uninstall)

**Function:** `getCliInstalledPluginKeys(config)` in `src/cli/commands/uninstall.tsx` (exported `@internal` for testing). Returns the `Set<string>` of registry keys this CLI installed, used by `detectUninstallTarget()` to narrow `listPluginNames()` to CLI-owned plugins (`cliPluginNames`) so uninstall never removes plugins the user installed by hand.

For each `config.skills` entry it emits the primary key `buildMarketplacePluginRef(skill.id, skill.source)`, plus a marketplace variant `buildMarketplacePluginRef(skill.id, config.marketplace)` when `config.marketplace` is set and differs from both `skill.source` and `EJECT_SOURCE` (covers plugins registered under the marketplace name while config recorded a differing `source`). This derivation depends on `config.marketplace` being present: `mergeGlobalConfigs` must not drop `marketplace`/`source` from the global config written during a project-scope init, or `uninstall --yes --all` at the home root found no CLI-owned plugins, left every plugin registered, then deleted the config that recorded them.

## Barrel Exports

### `src/cli/lib/plugins/index.ts`

| Source module               | Re-exported symbols                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-manifest.ts`        | `SkillManifestOptions`, `AgentManifestOptions`, `generateSkillPluginManifest`, `generateAgentPluginManifest`, `writePluginManifest`, `getPluginDir`                                    |
| `plugin-manifest-finder.ts` | `findPluginManifest`                                                                                                                                                                   |
| `plugin-ref.ts`             | `buildMarketplacePluginRef`, `parseMarketplacePluginRef`, `toClaudePluginScope`                                                                                                        |
| `plugin-finder.ts`          | `getUserPluginsDir`, `getCollectivePluginDir`, `getProjectPluginsDir`, `getPluginSkillsDir`, `getPluginAgentsDir`, `getPluginManifestPath`, `readPluginManifest`, `getPluginSkillIds`  |
| `plugin-info.ts`            | `PluginInfo`, `InstallationInfo`, `getPluginInfo`, `formatPluginDisplay`, `getInstallationInfo`, `formatInstallationDisplay`                                                           |
| `plugin-validator.ts`       | `validatePluginStructure`, `validatePluginManifest`, `validateSkillFrontmatter`, `validateAgentFrontmatter`, `validatePlugin`, `validateAllPlugins`, `printPluginValidationResult`     |
| `plugin-discovery.ts`       | `discoverAllPluginSkills`, `hasIndividualPlugins`, `listPluginNames`                                                                                                                   |
| `plugin-settings.ts`        | `PluginKey`, `ResolvedPlugin`, `getEnabledPluginKeys`, `getInstalledPluginsRegistryPath`, `listRegisteredPluginInstalls`, `resolvePluginInstallPaths`, `getVerifiedPluginInstallPaths` |

### `src/cli/lib/installation/index.ts`

| Source module          | Re-exported symbols                                                                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installation.ts`      | `InstallMode`, `Installation`, `detectGlobalInstallation`, `INSTALL_MODE_LABELS`, `detectInstallation`, `detectProjectInstallation`, `getInstallationOrThrow`, `deriveInstallMode`                                                                                                                                          |
| `local-installer.ts`   | `EjectInstallOptions`, `EjectInstallResult`, `PluginConfigResult`, `installEject`, `installPluginConfig`, `buildAndMergeConfig`, `setConfigMetadata`, `buildEjectSkillsMap`, `buildCompileAgents`, `buildAgentScopeMap` — **no config-pair writer is re-exported here**; that surface is `src/cli/lib/config-gate/index.ts` |
| `install-base-dir.ts`  | `installBaseDir`, `resolveInstallPaths`, `InstallPaths`                                                                                                                                                                                                                                                                     |
| `is-home-directory.ts` | `isHomeDirectory`                                                                                                                                                                                                                                                                                                           |
| `mode-migrator.ts`     | `SkillMigration`, `MigrationPlan`, `MigrationResult`, `detectMigrations`, `executeMigration`                                                                                                                                                                                                                                |

**Exported by the module but deliberately absent from the barrel** — importers take these by direct path, or not at all:

| Symbol                                                                                                                                                                                                                                                                                                         | Module                     | Note                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `mergeGlobalConfigs`                                                                                                                                                                                                                                                                                           | `config-gate/index.ts`     | Re-exported from the gate as a pure function                              |
| `getProjectConfigPath`                                                                                                                                                                                                                                                                                         | `install-base-dir.ts`      | Direct-path import                                                        |
| Every reconciliation helper (`reconcileProjectSplitAgainstGlobal`, `maskColliding*`, `dropOrphanedDerived*`, `retainProjectOwned*`, `retainReconciled*`, `buildProjectCollisionTest`, `categoryOfSkill`, `isExclusiveCategory`, `activeProjectCategories`, `computeRemovedGlobalSkillIds`, `globalHasActive*`) | `config-gate/propagate.ts` | Gate-private — eslint bans importing any `config-gate/*` file but `index` |

## Known Limitations

| Task                      | Status        | Anchor                                                                                                                                                   | Limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-276** (`todo/cli.md`) | Ready for Dev | `maskCollidingGlobalSkills` / `reconcileProjectSplitAgainstGlobal` (`config-gate/propagate.ts`) vs `toggleTechnology` (`src/cli/stores/wizard-store.ts`) | The masking machinery is only reachable from ONE ordering — the project already owned the conflicting skill and a global install landed on top. The wizard cannot express the opposite intent: the exclusive-swap guard computes `wouldDropLockedSkill` from `isGloballyLockedSkill` and returns `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`, so a project with a global React cannot choose Angular at all. D-276 will allow the swap, default the new skill to project scope, and let the existing mask fire. It is explicitly NOT an exception to global immutability — the global entry is masked, never removed. |

Two confirm-step display quirks are recorded as open in `2026-07-29-per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row.md`: an UNRECONCILED both-scopes config can list a skill as both unchanged and removed under Global, and a dropped mask is reported as a removal. The first is far less reachable now that such configs are masked at write time; the second cannot occur within a session.
