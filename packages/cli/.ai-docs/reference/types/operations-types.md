---
scope: reference
area: types
keywords:
  [
    operations,
    LoadedSource,
    ConfigChanges,
    PropagatedRecompileSummary,
    detectConfigChanges,
    migratePluginSkillScopes,
    edit-command,
  ]
related:
  - reference/types/core-types.md
  - reference/features/operations-layer.md
  - reference/features/compilation-pipeline.md
  - reference/commands/edit.md
last_validated: 2026-07-30
---

# Operations Layer Types

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [zod-schemas.md](./zod-schemas.md).

## Export Surface

Two barrels expose operation types, and they are **not** equivalent:

| Barrel                            | Contents                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/operations/index.ts` | Every operation function plus every publicly consumed type. This is what commands import.                  |
| `src/cli/lib/operations/types.ts` | Type-only convenience re-exports — a NON-exhaustive subset. Nothing imports it that cannot use `index.js`. |

Types reachable only through `index.js` (absent from `types.ts`): `MarketplaceRequirement`, `CompileAllScopesOptions`, `PropagatedRecompileSummary`.

`CopyLocalSkillsOptions` is exported from its own module (`operations/skills/copy-local-skills.ts`) but surfaced by **neither** barrel — import it from the module path.

## Operations Layer Types

The operations layer defines focused option/result types per operation:

### Source Operations

| Type                     | File                                       | Purpose                                                  |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| `LoadSourceOptions`      | `operations/source/load-source.ts`         | Options for loading a skills source                      |
| `LoadedSource`           | `operations/source/load-source.ts`         | Result of loading a source (matrix + paths)              |
| `MarketplaceResult`      | `operations/source/ensure-marketplace.ts`  | Result of marketplace registration                       |
| `MarketplaceRequirement` | `operations/source/require-marketplace.ts` | Discriminated union gating plugin work (`index.js` only) |

### Skill Operations

| Type                     | File                                           | Purpose                                                                  |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `DiscoveredSkills`       | `operations/skills/discover-skills.ts`         | Result of skill discovery (local + marketplace)                          |
| `CopyLocalSkillsOptions` | `operations/skills/copy-local-skills.ts`       | Options for copying local skills (module path only — see Export Surface) |
| `SkillCopyResult`        | `operations/skills/copy-local-skills.ts`       | Result of copying local skills                                           |
| `PluginInstallResult`    | `operations/skills/install-plugin-skills.ts`   | Result of plugin skill installation                                      |
| `PluginUninstallResult`  | `operations/skills/uninstall-plugin-skills.ts` | Result of plugin skill uninstallation                                    |

### Project Operations

| Type                         | File                                              | Purpose                                                          |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `DetectedProject`            | `operations/project/detect-project.ts`            | Detected project installation state                              |
| `BothInstallations`          | `operations/project/detect-both-installations.ts` | Combined project + global installation                           |
| `ConfigWriteOptions`         | `operations/project/write-project-config.ts`      | Options for writing project config                               |
| `ConfigWriteResult`          | `operations/project/write-project-config.ts`      | Result of config write operation (incl. `propagatedProjects`)    |
| `CompileAgentsOptions`       | `operations/project/compile-agents.ts`            | Options for agent compilation                                    |
| `CompilationResult`          | `operations/project/compile-agents.ts`            | Result of agent compilation                                      |
| `CompileAllScopesOptions`    | `operations/project/compile-agents-all-scopes.ts` | Options for the home/project multi-pass driver (`index.js` only) |
| `PropagatedRecompileSummary` | `operations/project/recompile-project-agents.ts`  | Registered-project recompile summary (`index.js` only)           |
| `AgentDefs`                  | `operations/project/load-agent-defs.ts`           | Loaded agent definitions with source paths                       |

## Key Type Shapes

### `PluginInstallResult` (contract)

```typescript
type PluginInstallResult = {
  installed: Array<{ id: SkillId; ref: string }>;
  failed: Array<{ id: SkillId; error: string }>;
};
```

`failed` entries MUST cause a hard-error before `writeConfigAndCompile` runs — persisting config for skills that `claude plugin install` rejected produces orphan entries. Enforced by `installPluginsStep` (init) and `applyPluginChanges` (edit).

### `PluginUninstallResult`

```typescript
type PluginUninstallResult = {
  uninstalled: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};
```

Uninstall failures are diagnostic-only — they do not produce orphan state, so no hard-error.

### `MarketplaceResult` (lazy resolution)

```typescript
type MarketplaceResult = {
  marketplace: string | null; // null = no marketplace configured / fetch failed
  registered: boolean; // true = newly registered, false = updated / already existed
};
```

`ensureMarketplace` is intentionally silent. When `sourceResult.marketplace` is undefined it calls `fetchMarketplace()` for lazy resolution; on fetch failure returns `{ marketplace: null, registered: false }` (no throw). Commands decide log output from the `registered` flag. Mutates `sourceResult.marketplace` as a side effect when lazy-resolved.

### `CompilationResult`

```typescript
type CompilationResult = {
  compiled: AgentName[];
  failed: AgentName[];
  warnings: string[];
};
```

Thin re-shape of `recompileAgents()` result. No per-agent error strings on `failed` (just the name). `warnings` carries the human-readable failure text plus any `Agent "<name>" not found in source definitions` entries.

`failed` names are still counted into the prune keep-set (`compiled ∪ failed`) — a render failure must not also delete the previously good `.md`.

### `CompileAgentsOptions`

```typescript
type CompileAgentsOptions = {
  projectDir: string;
  sourcePath: string;
  pluginDir?: string;
  skills?: SkillDefinitionMap;
  agentScopeMap?: Map<AgentName, "project" | "global">;
  agents?: AgentName[];
  scopeFilter?: "project" | "global"; // loads config and filters agents by scope
  outputDir?: string;
};
```

Two behaviours are keyed off these fields rather than being separate flags:

| Behaviour                                         | Trigger                                       |
| ------------------------------------------------- | --------------------------------------------- |
| Auto-build `agentScopeMap` from the loaded config | `scopeFilter` set AND `agentScopeMap` omitted |
| Prune stale compiled agents from `outputDir`      | `outputDir` set AND `scopeFilter` ABSENT      |

The prune trigger is the "authoritative pass" test: a scope-filtered pass only ever resolves one scope's roster, so its roster is not the complete set for the directory and deleting from it could remove another scope's files.

There is no `installMode` field on `CompileAgentsOptions` (nor on `RecompileAgentsOptions` in `agent-recompiler.ts`) — the compile path no longer threads an install mode. The `InstallMode` type (`"eject" | "plugin" | "mixed"`) still exists in `matrix.ts` and is derived on demand via `deriveInstallMode(skills)` in `installation.ts`. The plugin skill-reference _format_ is per-skill source-based (`SkillReference.source`), which is why no whole-project `installMode` is threaded into compilation.

### `CompileAllScopesOptions`

```typescript
type CompileAllScopesOptions = {
  /** Working directory of the command — a project root, or home for global context. */
  projectDir: string;
  sourcePath: string;
  skills: SkillDefinitionMap;
  agentScopeMap: Map<AgentName, SkillScope>;
};
```

Unlike `CompileAgentsOptions`, `skills` and `agentScopeMap` are **required** — `compileAgentsAllScopes` is the `init`/`edit` driver and both callers already hold them. Exported from `operations/index.js` only, not from `operations/types.ts`.

### `PropagatedRecompileSummary` (contract)

```typescript
type PropagatedRecompileSummary = {
  recompiledCount: number;
  failedCount: number;
  /** Per-project warnings in processing order — the caller surfaces them via warn(). */
  warnings: string[];
};
```

Returned by `recompilePropagatedProjectAgents(projectDirs)`, which loops `recompileRegisteredProjectAgents(dir)` over the dirs in `ConfigWriteResult.propagatedProjects`.

**Failure-isolation contract:**

| Per-project outcome                        | Effect on the summary                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Success (`result.failed` empty)            | `recompiledCount++`                                                       |
| Compile ran but `result.failed` non-empty  | `failedCount++`, that result's `warnings` appended, loop continues        |
| Threw (unreadable config, broken template) | `failedCount++`, `Could not recompile agents in <dir>: <reason>` appended |

Nothing here throws or short-circuits: one project's unreadable config must not abort the loop or leave the remaining projects stale. Projects are processed **sequentially** so `warnings` keeps a deterministic per-project order. Both `init` and `edit` `warn()` every entry and then log the counts (`edit` colours the ` (N failed)` suffix with `CLI_COLORS.WARNING`).

`recompileRegisteredProjectAgents(projectDir): Promise<CompilationResult>` always compiles with `scopeFilter: "project"` — so it never prunes and writes no agent into `~/.claude/agents`, which the triggering operation's own global pass already rewrote. (`writeCompiledAgentsByScope` still `ensureDir`s the global agents directory unconditionally at entry; that is an idempotent `mkdir -p`, not a write.)

### `LoadedSource`

```typescript
type LoadedSource = {
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[]; // empty when captureStartupMessages: false
};
```

### `LoadSourceOptions`

```typescript
type LoadSourceOptions = {
  sourceFlag?: string;
  projectDir: string;
  captureStartupMessages?: boolean; // wraps load in buffer mode for Wizard <Static>
};
```

`LoadSourceOptions` is a strict subset of the loader's own `SourceLoadOptions` (`src/cli/lib/loading/source-loader.ts`) — it does NOT expose `devMode`, `skipExtraSources` or `matrixOnly`. Callers that need the offline matrix-only load (`compile`'s `refreshConfigTypes`, `uninstall`) bypass this operation and call `loadSkillsMatrixFromSource` directly.

### `ConfigWriteOptions`

```typescript
type ConfigWriteOptions = {
  wizardResult: WizardResultV2;
  sourceResult: SourceLoadResult;
  projectDir: string;
  sourceFlag?: string;
  agents?: Partial<Record<AgentName, AgentDefinition>>; // pre-loaded; loads from CLI + source when omitted
  authoritativeScope?: AuthoritativeScope; // Scenario C
};
```

`authoritativeScope` (type `AuthoritativeScope = "all" | "owned"`, from `src/cli/lib/configuration/config-merger.ts`) governs how `cc edit`'s new config treats absent entries: `"all"` (global edit) drops any deselected entry, `"owned"` (project edit) drops deselected project-owned entries only, `undefined` (init) keeps the additive union-preserve merge. Threaded into `buildAndMergeConfig()` by `writeProjectConfig`.

### `ConfigWriteResult`

```typescript
type ConfigWriteResult = {
  config: ProjectConfig;
  configPath: string;
  wasMerged: boolean;
  existingConfigPath?: string;
  filesWritten: number; // 2 (global context) or 4 (project context: config + types × 2 scopes)
  /**
   * Registered project directories whose config was rewritten by propagation of
   * this write's global changes. Their compiled agents are now stale — the
   * caller recompiles them with `recompileRegisteredProjectAgents`.
   */
  propagatedProjects: string[];
};
```

**`propagation: GateReport`** originates in `writeScopedFromWizard` (`src/cli/lib/config-gate/index.ts`). Its `propagated.updated` carries `propagateGlobalChangesToProjects(...).updated` — projects that actually got rewritten; `propagated.skipped` carries the unreachable / failing ones, which the wizard commands do not render. Its `recompile` describes work the gate **already did**. `propagated.updated` is `[]` when:

- the home branch's config declares no `projects` (a home write is always a global write, so there is no change gate on that branch), or
- the project branch's global data did not change (`globalDataChanged === false`), or the effective global config has no `projects`.

`init.tsx` and `edit.tsx` each early-return on an empty list before calling `recompilePropagatedProjectAgents`.

**There is no `globalConfigPath` on this result.** It was declared optional, never assigned by `writeProjectConfig` and never read by any caller, so it was deleted. The global config path is derived at the write site via `getProjectConfigPath(os.homedir())` inside `writeScopedFromWizard`.

### `DiscoveredSkills`

```typescript
type DiscoveredSkills = {
  allSkills: SkillDefinitionMap;
  totalSkillCount: number;
  pluginSkillCount: number; // project + global plugins combined
  localSkillCount: number; // project + global local combined
  globalPluginSkillCount: number;
  globalLocalSkillCount: number;
};
```

4-way merge order: global plugins → global local → project plugins → project local (project wins).

### `DetectedProject`

```typescript
type DetectedProject = {
  installation: Installation;
  config: ProjectConfig | null;
  configPath: string | null;
};
```

`detectProject` never throws: it returns `null` for **both** "no installation found" and "a config file exists but is corrupt". The second case comes from catching `ConfigLoadError` around `detectInstallation()` — `doctor` and `edit` then report a config/installation problem. `compile` deliberately does not use this wrapper; it calls `detectBothInstallations` so the error surfaces and it can hard-error naming the file.

A successfully-loaded config that declares neither skills nor agents also reads as **not installed** (`detectInstallationInDir` in `src/cli/lib/installation/installation.ts` returns `null`), so `init` routes to the setup wizard rather than the dashboard.

### `BothInstallations`

```typescript
type BothInstallations = {
  global: Installation | null;
  project: Installation | null;
  hasBoth: boolean;
};
```

Skips project detection when `projectDir === os.homedir()` (avoids double-compile). `hasBoth` gates dual-scope compile passes — and, because a filtered pass never prunes, it also decides whether a `compile` run prunes stale compiled agents.

Unlike `detectProject`, this operation **lets `ConfigLoadError` propagate**. Its only caller wraps it in a try/catch and hard-errors with `EXIT_CODES.ERROR` before any compilation or write.

### `AgentDefs`

```typescript
type AgentDefs = {
  agents: Partial<Record<AgentName, AgentDefinition>>; // CLI defaults + source overrides (source wins)
  sourcePath: string;
  agentSourcePaths: AgentSourcePaths; // { agentsDir, templatesDir, sourcePath }
};
```

### `CopyLocalSkillsOptions`

```typescript
type CopyLocalSkillsOptions = {
  // eject installer only — before copying, delete an already-present local skill
  // whose config names a non-eject source so a stale ejected copy is replaced
  deleteAlternateSourceSkills?: boolean;
};
```

Passed to `copyLocalSkills(skills, projectDir, sourceResult, options)`. Defaults `deleteAlternateSourceSkills` to `false`; `init`/`edit` leave it off, only the eject installer sets it. Applied per-scope inside `copyScopedLocalSkills`, which calls `deleteLocalSkill` for any skill whose `source !== EJECT_SOURCE` before re-copying.

### `SkillCopyResult`

```typescript
type SkillCopyResult = {
  projectCopied: CopiedSkill[];
  globalCopied: CopiedSkill[];
  totalCopied: number;
};
```

## Edit Command Types (`src/cli/commands/edit.tsx`)

Types and functions exported from `edit.tsx` for config change detection and plugin scope migration. All marked `@internal` (exported for testing).

### ConfigChanges (`src/cli/commands/edit.tsx`)

```typescript
type ScopeChange = { from: "project" | "global"; to: "project" | "global" };

type ConfigChanges = {
  addedSkills: SkillId[];
  removedSkills: SkillId[];
  addedAgents: AgentName[];
  removedAgents: AgentName[];
  sourceChanges: Map<SkillId, { from: string; to: string }>;
  scopeChanges: Map<SkillId, ScopeChange>;
  agentScopeChanges: Map<AgentName, ScopeChange>;
  // Ids whose scope entry is a dual-scope ([P][G]) add/remove, NOT a true
  // single-entry migration. Steers the completion-summary display only; the
  // disk-side scope work still flows through scopeChanges / agentScopeChanges.
  dualScopeSkillTransitions: Set<SkillId>;
  dualScopeAgentTransitions: Set<AgentName>;
};
```

### FullScopeEntries (`src/cli/commands/edit.tsx`)

```typescript
type FullScopeEntries = {
  newSkills: SkillConfig[]; // new roster INCLUDING excluded tombstones
  oldSkills: SkillConfig[]; // prior roster INCLUDING excluded tombstones
  newAgents: AgentScopeConfig[];
  oldAgents: AgentScopeConfig[];
};
```

Module-internal type (not exported). Passed as the optional `fullEntries` arg to `detectConfigChanges` and consumed ONLY by the local `detectDualScopeTransitions()` helper to tell a genuine single-entry scope migration apart from a dual-scope (`[P][G]`) add/remove. When omitted, every scope change is treated as a migration (pre-dual-scope behaviour). Unlike `oldConfig`/`wizardResult` (which carry the ACTIVE, tombstone-filtered entries), these lists keep the excluded tombstones.

### detectConfigChanges (`src/cli/commands/edit.tsx`)

```typescript
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
  fullEntries?: FullScopeEntries, // { newSkills, oldSkills, newAgents, oldAgents }
): ConfigChanges;
```

`oldConfig` / `wizardResult` carry the ACTIVE (tombstone-filtered) entries used for add/remove/source/scope diffing. `fullEntries`, when provided, carries the unfiltered lists (including excluded tombstones) used only to tell a genuine scope migration apart from a dual-scope add/remove; when omitted, every scope change is treated as a migration. Uses `difference()` (remeda) for added/removed, `indexBy()` (remeda) to build old-entry lookups, a local `detectPropertyChanges()` helper for source/scope/agent-scope diffs, and `detectDualScopeTransitions()` to populate the `dualScope*Transitions` sets.

### PluginScopeMigrationResult (`src/cli/commands/edit.tsx`)

```typescript
type PluginScopeMigrationResult = {
  migrated: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};
```

### migratePluginSkillScopes (`src/cli/commands/edit.tsx`)

```typescript
async function migratePluginSkillScopes(
  scopeChanges: Map<SkillId, ScopeChange>,
  skills: Pick<SkillConfig, "id" | "source">[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult>;
```

Handles plugin-mode skill scope migrations. Skips `source === "eject"` skills (handled separately by `migrateLocalSkillScope`). For project-to-global: uninstalls project-scope, installs global-scope. For global-to-project: adds project-scope registration (keeps global for other projects).
