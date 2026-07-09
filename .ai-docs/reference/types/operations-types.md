---
scope: reference
area: types
keywords:
  [
    operations,
    LoadedSource,
    ConfigChanges,
    detectConfigChanges,
    migratePluginSkillScopes,
    edit-command,
  ]
related:
  - reference/types/core-types.md
  - reference/features/operations-layer.md
  - reference/commands/edit.md
last_validated: 2026-04-21
---

# Operations Layer Types

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [zod-schemas.md](./zod-schemas.md).

## Operations Layer Types (`src/cli/lib/operations/types.ts`)

The operations layer defines focused result types for each operation, re-exported from `src/cli/lib/operations/types.ts`:

### Source Operations

| Type                | File                                      | Purpose                                     |
| ------------------- | ----------------------------------------- | ------------------------------------------- |
| `LoadSourceOptions` | `operations/source/load-source.ts`        | Options for loading a skills source         |
| `LoadedSource`      | `operations/source/load-source.ts`        | Result of loading a source (matrix + paths) |
| `MarketplaceResult` | `operations/source/ensure-marketplace.ts` | Result of marketplace registration          |

### Skill Operations

| Type                     | File                                             | Purpose                                         |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| `DiscoveredSkills`       | `operations/skills/discover-skills.ts`           | Result of skill discovery (local + marketplace) |
| `ScopedSkillDir`         | `operations/skills/collect-scoped-skill-dirs.ts` | Single scoped skill directory entry             |
| `ScopedSkillDirsResult`  | `operations/skills/collect-scoped-skill-dirs.ts` | Collected scoped dirs with counts               |
| `SkillCopyResult`        | `operations/skills/copy-local-skills.ts`         | Result of copying local skills                  |
| `SkillComparisonResults` | `operations/skills/compare-skills.ts`            | Comparison results (added/removed/changed)      |
| `SkillMatchResult`       | `operations/skills/find-skill-match.ts`          | Result of matching a skill to a source          |
| `PluginInstallResult`    | `operations/skills/install-plugin-skills.ts`     | Result of plugin skill installation             |
| `PluginUninstallResult`  | `operations/skills/uninstall-plugin-skills.ts`   | Result of plugin skill uninstallation           |

### Project Operations

| Type                   | File                                              | Purpose                                    |
| ---------------------- | ------------------------------------------------- | ------------------------------------------ |
| `DetectedProject`      | `operations/project/detect-project.ts`            | Detected project installation state        |
| `BothInstallations`    | `operations/project/detect-both-installations.ts` | Combined project + global installation     |
| `ConfigWriteOptions`   | `operations/project/write-project-config.ts`      | Options for writing project config         |
| `ConfigWriteResult`    | `operations/project/write-project-config.ts`      | Result of config write operation           |
| `CompileAgentsOptions` | `operations/project/compile-agents.ts`            | Options for agent compilation              |
| `CompilationResult`    | `operations/project/compile-agents.ts`            | Result of agent compilation                |
| `AgentDefs`            | `operations/project/load-agent-defs.ts`           | Loaded agent definitions with source paths |

## Key Type Shapes

Shapes verified against source 2026-04-21. No line numbers (names only, per project convention).

### `PluginInstallResult` (D-229 contract)

```typescript
type PluginInstallResult = {
  installed: Array<{ id: SkillId; ref: string }>;
  failed: Array<{ id: SkillId; error: string }>;
};
```

`failed` entries MUST cause a hard-error before `writeConfigAndCompile` runs — persisting config for skills that `claude plugin install` rejected produces orphan entries. Enforced by `installPluginsStep` (init) and `applyPluginChanges` (edit). See `2026-04-20-d229-plugin-install-failure-orphan-config.md`.

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

Thin re-shape of `recompileAgents()` result. No per-agent error strings on `failed` (just the name).

### `CompileAgentsOptions`

```typescript
type CompileAgentsOptions = {
  projectDir: string;
  sourcePath: string;
  pluginDir?: string;
  skills?: SkillDefinitionMap;
  agentScopeMap?: Map<AgentName, "project" | "global">;
  agents?: AgentName[];
  scopeFilter?: "project" | "global"; // loads config and filters by scope
  outputDir?: string;
  installMode?: InstallMode; // "eject" | "plugin" | "mixed" — NOT deprecated
};
```

`installMode` is alive post-D-217. Derived via `deriveInstallMode(skills)` in `installation.ts` and threaded through `recompileAgents`. D-217 changed the plugin skill-reference _format_ (per-skill source-based), not the `InstallMode` type.

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
  forceRefresh?: boolean;
  captureStartupMessages?: boolean; // wraps load in buffer mode for Wizard <Static>
};
```

### `ConfigWriteResult`

```typescript
type ConfigWriteResult = {
  config: ProjectConfig;
  configPath: string;
  globalConfigPath?: string;
  wasMerged: boolean;
  existingConfigPath?: string;
  filesWritten: number; // 2 (global context) or 4 (project context: config + types × 2 scopes)
};
```

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

Never throws — returns `null` when no installation. Callers decide how to react.

### `BothInstallations`

```typescript
type BothInstallations = {
  global: Installation | null;
  project: Installation | null;
  hasBoth: boolean;
};
```

Skips project detection when `projectDir === os.homedir()` (avoids double-compile). `hasBoth` gates dual-scope compile passes.

### `AgentDefs`

```typescript
type AgentDefs = {
  agents: Record<AgentName, AgentDefinition>; // CLI defaults + source overrides (source wins)
  sourcePath: string;
  agentSourcePaths: AgentSourcePaths; // { agentsDir, templatesDir, sourcePath }
};
```

### `SkillCopyResult`

```typescript
type SkillCopyResult = {
  projectCopied: CopiedSkill[];
  globalCopied: CopiedSkill[];
  totalCopied: number;
};
```

### `ScopedSkillDir` / `ScopedSkillDirsResult`

```typescript
type ScopedSkillDir = {
  dirName: string;
  localSkillsPath: string;
  scope: "project" | "global";
};

type ScopedSkillDirsResult = {
  dirs: ScopedSkillDir[];
  hasProject: boolean;
  hasGlobal: boolean;
  projectLocalPath: string;
  globalLocalPath: string;
};
```

Project scope takes precedence on `dirName` conflict. `hasGlobal` is always `false` when `projectDir === homeDir`.

### `SkillComparisonResults`

```typescript
type SkillComparisonResults = {
  projectResults: SkillComparisonResult[];
  globalResults: SkillComparisonResult[];
  merged: SkillComparisonResult[]; // project takes precedence on id conflict
};
```

### `SkillMatchResult`

```typescript
type SkillMatchResult = {
  match: SkillComparisonResult | null;
  similar: string[]; // top-3 fuzzy suggestions when match is null
};
```

Match order: exact id → partial-name (strips `(@author)` suffix) → `dirName`.

## Edit Command Types (`src/cli/commands/edit.tsx`)

Types and functions exported from `edit.tsx` for config change detection and plugin scope migration. All marked `@internal` (exported for testing).

### ConfigChanges (`src/cli/commands/edit.tsx`)

```typescript
type ConfigChanges = {
  addedSkills: SkillId[];
  removedSkills: SkillId[];
  addedAgents: AgentName[];
  removedAgents: AgentName[];
  sourceChanges: Map<SkillId, { from: string; to: string }>;
  scopeChanges: Map<SkillId, { from: "project" | "global"; to: "project" | "global" }>;
  agentScopeChanges: Map<AgentName, { from: "project" | "global"; to: "project" | "global" }>;
};
```

### detectConfigChanges (`src/cli/commands/edit.tsx`)

```typescript
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
): ConfigChanges;
```

Compares old project config against wizard result. Uses `remeda.difference()` for added/removed and `remeda.indexBy()` for property change detection (source, scope, agent scope).

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
  scopeChanges: Map<SkillId, { from: "project" | "global"; to: "project" | "global" }>,
  skills: Array<{ id: SkillId; source: string }>,
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult>;
```

Handles plugin-mode skill scope migrations. Skips `source === "eject"` skills (handled separately by `migrateLocalSkillScope`). For project-to-global: uninstalls project-scope, installs global-scope. For global-to-project: adds project-scope registration (keeps global for other projects).
