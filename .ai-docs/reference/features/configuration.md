---
scope: reference
area: config
keywords:
  [
    config-resolution,
    config-writer,
    scope-splitting,
    config-merger,
    global-config,
    project-config,
    tombstone,
    excluded,
  ]
related:
  - reference/architecture-overview.md
  - reference/type-system.md
  - reference/wizard/state-transitions.md
  - reference/boundary-map.md
  - reference/config/scope-split.md
last_validated: 2026-07-23
---

# Configuration System

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

## Overview

**Purpose:** Manage project configuration, source resolution, and config persistence.

**Location:** `src/cli/lib/configuration/`

## Files

| File                     | Path                                               | Purpose                                         |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| `config.ts`              | `src/cli/lib/configuration/config.ts`              | Source resolution, project source config I/O    |
| `config-generator.ts`    | `src/cli/lib/configuration/config-generator.ts`    | Generate ProjectConfig from wizard, scope split |
| `config-merger.ts`       | `src/cli/lib/configuration/config-merger.ts`       | Merge wizard result with existing               |
| `config-saver.ts`        | `src/cli/lib/configuration/config-saver.ts`        | Save source to project config                   |
| `config-writer.ts`       | `src/cli/lib/configuration/config-writer.ts`       | Generate TypeScript config source strings       |
| `config-types-writer.ts` | `src/cli/lib/configuration/config-types-writer.ts` | Generate config-types.ts type files             |
| `config-loader.ts`       | `src/cli/lib/configuration/config-loader.ts`       | Load TypeScript config via jiti                 |
| `project-config.ts`      | `src/cli/lib/configuration/project-config.ts`      | Load and validate project config                |
| `scope-predicates.ts`    | `src/cli/lib/configuration/scope-predicates.ts`    | Shared scope/tombstone predicates (see below)   |
| `source-manager.ts`      | `src/cli/lib/configuration/source-manager.ts`      | Add/remove extra sources                        |
| `define-config.ts`       | `src/cli/lib/configuration/define-config.ts`       | Type-safe `defineConfig()` helper               |
| `default-categories.ts`  | `src/cli/lib/configuration/default-categories.ts`  | Default skill category definitions              |
| `default-rules.ts`       | `src/cli/lib/configuration/default-rules.ts`       | Default skill rule definitions                  |
| `default-stacks.ts`      | `src/cli/lib/configuration/default-stacks.ts`      | Default stack definitions                       |
| `index.ts`               | `src/cli/lib/configuration/index.ts`               | Barrel exports                                  |

## Config File Locations

| File                 | Path                            | Purpose                                 |
| -------------------- | ------------------------------- | --------------------------------------- |
| Project config       | `.claude-src/config.ts`         | Skills, agents, stack, source, branding |
| Project config types | `.claude-src/config-types.ts`   | Auto-generated type unions for config   |
| Global config        | `~/.claude-src/config.ts`       | Global-scope skills, agents, stack      |
| Global config types  | `~/.claude-src/config-types.ts` | Auto-generated global type unions       |

Config uses a unified `ProjectConfig` type for both source-level settings (source, marketplace, branding) and installation settings (skills, agents, stack). Files are TypeScript (loaded via jiti), not YAML.

## Key Types

### ProjectConfig (`src/cli/types/config.ts`)

Unified configuration type. Stores both source-resolution fields and installed skill/agent data.

```typescript
type ProjectConfig = {
  name: string;
  description?: string;
  agents: AgentScopeConfig[];
  skills: SkillConfig[];
  author?: string;
  stack?: Record<string, StackAgentConfig>;
  source?: string;
  marketplace?: string;
  agentsSource?: string;
  domains?: Domain[];
  selectedAgents?: AgentName[];
  sources?: SourceEntry[];
  boundSkills?: BoundSkill[];
  branding?: BrandingConfig;
  skillsDir?: string;
  agentsDir?: string;
  stacksFile?: string;
  categoriesFile?: string;
  rulesFile?: string;
  projects?: string[];
};
```

`ProjectConfig` has no `version` field — no reader consumes it, so it is not emitted or parsed.

### SkillConfig (`src/cli/types/config.ts`)

```typescript
type SkillConfig = {
  id: SkillId;
  scope: "project" | "global";
  source: string; // "eject" | marketplace name
  excluded?: boolean;
};
```

### AgentScopeConfig (`src/cli/types/config.ts`)

```typescript
type AgentScopeConfig = {
  name: AgentName;
  scope: "project" | "global";
  excluded?: boolean;
};
```

### ResolvedConfig (`src/cli/lib/configuration/config.ts`)

```typescript
type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
  marketplace?: string;
};
```

## Scope Predicates

**File:** `src/cli/lib/configuration/scope-predicates.ts`

Shared predicates over scoped config entries (`{ scope?, excluded? }`), consumed by the merger, generator, writer, and installer so scope/tombstone logic has a single definition.

| Export                          | Purpose                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `isActiveAt(entry, scope)`      | Non-excluded entry at the given scope                                                                      |
| `isGlobalTombstone(entry)`      | `scope === "global"` + `excluded` (tombstone masking a global install)                                     |
| `isProjectOwned(entry)`         | Project-scoped entry OR the project's own global tombstone (inherited global-active entries are not owned) |
| `activeProjectAgentNames()`     | Names of active project-scoped agents                                                                      |
| `activeSkillScopeMap()`         | `Map<SkillId, SkillScope>` of active (non-excluded) skills                                                 |
| `activeAgentScopeMap()`         | `Map<AgentName, SkillScope>` of active (non-excluded) agents                                               |
| `effectivelyExcludedSkillIds()` | Ids whose every entry is excluded (a dual-scope excluded-global + active-project pair is NOT excluded)     |

`ScopedEntry` is the shared `{ scope?: SkillScope; excluded?: boolean }` shape. `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, and `effectivelyExcludedSkillIds` are re-exported from `index.ts`.

## Source Resolution

**Function:** `resolveSource()` in `src/cli/lib/configuration/config.ts`

**Precedence (highest to lowest):**

1. `--source` flag value
2. `CC_SOURCE` environment variable
3. `.claude-src/config.ts` `source` field (project-level)
4. `~/.claude-src/config.ts` `source` field (global-level)
5. Default: `github:agents-inc/skills`

**Source validation:** `validateSourceFormat()` in `src/cli/lib/configuration/config.ts`

Validates:

- No null bytes (bypass prevention)
- Max length 512 chars
- Remote sources: valid URL/shorthand, no path traversal, no private IPs
- Local sources: no control chars, no UNC paths

**Source classification:** `isLocalSource()` in `src/cli/lib/configuration/config.ts` - Returns `true` for paths starting with `/` or `.`, `false` for remote protocols. Rejects `..` and `~` in non-remote sources.

## Config Generation

**Function:** `generateProjectConfigFromSkills()` in `src/cli/lib/configuration/config-generator.ts`

Generates `ProjectConfig` from wizard result:

- Maps domain selections to flat skill list
- Builds stack property from agent-skill mappings
- Resolves agent names from selected domains

Required when `selectedAgents` is non-empty: callers must pass `skillConfigs` (one `SkillConfig` per selected skill) and `agentConfigs` (one `AgentScopeConfig` per selected agent). `getScopeOrThrow` hard-errors on any missing entry — no silent scope defaulting.

**D-220 per-agent curation options** (opt-in via `newlyAddedSkillIds`):

| Option                   | Type                                           | Effect                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newlyAddedSkillIds`     | `readonly SkillId[]`                           | Skills new to this session (vs prior `existing.config.skills`). Opting in (even as `[]`) activates D-220 preservation: skills absent from an existing agent's prior stack are only appended when in this set. |
| `scopeEligibilityGained` | `ReadonlySet<string>`                          | `(agent, skillId)` pairs whose scope-compatibility flipped to compatible this session. Admits scope-flip cases that a skill-id-only diff misses. Keys built via `scopeEligibilityKey(agent, skillId)`.        |
| `existingStack`          | `Partial<Record<AgentName, StackAgentConfig>>` | Prior stack entries. Used to preserve per-agent curation and inherit `preloaded` flags.                                                                                                                       |

When `newlyAddedSkillIds === undefined`, `shouldIncludeTriple` returns `true` unconditionally (legacy pre-D-220 seed-everything behavior).

**Function:** `scopeEligibilityKey()` in `src/cli/lib/configuration/config-generator.ts` - Encodes `(agent, skillId)` as `` `${agent}|${skillId}` `` for set-membership lookups.

**Function:** `buildStackProperty()` in `src/cli/lib/configuration/config-generator.ts` - Builds the `stack` record in config from a loaded Stack definition.

**Function:** `splitConfigByScope()` in `src/cli/lib/configuration/config-generator.ts` - Splits a `ProjectConfig` into global and project partitions by skill/agent scope. Returns `SplitConfigResult` (`{ global: ProjectConfig; project: ProjectConfig }`). Partitions:

- **skills** by `scope` + `excluded` (excluded globals route to project split as tombstones)
- **agents** by `scope` + `excluded` (excluded globals route to project as overrides) — D-222
- **stack** by agent partition first, then global agents' entries are further split per-skill so a global agent never carries project skill ids
- **selectedAgents** by scope: names matching global agents go to the global config's `selectedAgents`; the rest to the project config's `selectedAgents` — D-222
- **domains** copied to global only (project inherits at runtime)

> **Full partition rules, delta pipeline, and decision tables:** see [../config/scope-split.md](../config/scope-split.md).

### Skill Config Construction in Wizard Store

**Function:** `buildSkillConfigForId()` in `src/cli/stores/wizard-store.ts`

Builds a `SkillConfig` for a resolved skill ID, preferring saved config values. When duplicate entries exist for the same skill ID (e.g., both global and project scoped), the project-scoped entry takes precedence:

```typescript
const saved =
  savedConfigs?.find((sc) => sc.id === id && !sc.excluded && sc.scope === "project") ??
  savedConfigs?.find((sc) => sc.id === id && !sc.excluded);
```

Falls back to `scope: saved?.scope ?? "global"` and `source: resolveEffectiveSource(saved?.source, primarySource)`, where `primarySource = primarySourceName(skill)` from the matrix entry.

## Config Merging

> **Full merge contract, compound keys, D-233 authoritative-scope, and tombstone flow:** see [../config/config-merger.md](../config/config-merger.md).

**Function:** `mergeWithExistingConfig(newConfig, context: MergeContext)` in `src/cli/lib/configuration/config-merger.ts`

`MergeContext = { projectDir; authoritativeScope?: "all" | "owned"; unresolvableSkillIds?: readonly SkillId[] }`. When `edit` command modifies skills:

- Loads existing full config; when present, calls `mergeConfigs()` with the context's `authoritativeScope` / `unresolvableSkillIds`
- Preserves user customizations (author, source, marketplace, agentsSource) and the global `projects` registry
- Falls back to copying `author`/`agentsSource` from a legacy source stub when no full config exists (`merged: false`, no `mergeConfigs` call)

**Pure merge function:** `mergeConfigs(newConfig, existingConfig, options?)` in `src/cli/lib/configuration/config-merger.ts`

- **Replace-on-match**: `newConfig` is authoritative for every `name`/`id` it references; identity fields (name, description, author, marketplace, agentsSource) are carried from existing, and `source` is preserved only when `newConfig.source` is undefined
- Agents and skills are keyed by a **compound key** (`id:scope[:excluded]`), so dual-scope active/tombstone pairs coexist and scope migrations drop stale rows
- Stack: `newConfig.stack` wins whenever defined; existing stack is kept only when `newConfig.stack` is undefined
- `authoritativeScope` (D-233 Scenario C): a full `cc edit` drops in-authority entries that are absent from `newConfig` (deselections); `unresolvableSkillIds` exempts skills the wizard could not resolve
- `existingConfig.projects` is preserved when `newConfig` carries none (the drop bug is fixed; see finding `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale.md`)

## Config I/O

| Function                      | Purpose                                  | File                                               |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `loadProjectSourceConfig()`   | Load .claude-src/config.ts (partial)     | `config.ts`                                        |
| `loadGlobalSourceConfig()`    | Load ~/.claude-src/config.ts (partial)   | `config.ts`                                        |
| `loadProjectConfig()`         | Load + validate with global fallback     | `project-config.ts`                                |
| `loadProjectConfigFromDir()`  | Load + validate from specific dir only   | `project-config.ts`                                |
| `validateProjectConfig()`     | Validate project config structure        | `project-config.ts`                                |
| `generateConfigSource()`      | Generate TypeScript source string        | `config-writer.ts`                                 |
| `saveSourceToProjectConfig()` | Save source field to config file         | `config-saver.ts`                                  |
| `loadConfig()`                | Generic TypeScript config loader (jiti)  | `config-loader.ts`                                 |
| `defineConfig()`              | Type-safe config helper (identity fn)    | `define-config.ts`                                 |
| `getProjectConfigPath()`      | Build absolute path to project config    | `install-base-dir.ts` (re-exported by `config.ts`) |
| `resolveAllSources()`         | Resolve primary + extra sources          | `config.ts`                                        |
| `resolveAuthor()`             | Resolve author from effective config     | `config.ts`                                        |
| `writePartialProjectConfig()` | Write a partial config, filling defaults | `config-writer.ts`                                 |

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. Generates TypeScript source strings from `ProjectConfig`.

| Function                                 | Purpose                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `generateConfigSource()`                 | Main entry: generates config.ts source string                                                                          |
| `writePartialProjectConfig()`            | Writes a `Partial<ProjectConfig>`, filling `skills`/`agents` defaults (used by `config-saver.ts`, `source-manager.ts`) |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)                                                                                     |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)                                                                            |
| `ensureBlankGlobalConfig()`              | Creates blank global config at `~/.claude-src/` if missing                                                             |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`                                                                              |

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

### Writer selection rule

When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the global install root), call `regenerateConfigTypes`. When writing a GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), call `writeStandaloneConfigTypes` / `generateConfigTypesSource` directly. Never call `writeStandaloneConfigTypes` for a project path — it bypasses the import-from-global branch in `regenerateConfigTypes` and produces duplicated standalone unions.

In `local-installer.ts`:

- `writeScopedConfigs` project branch → `regenerateConfigTypes(projectDir, ...)`.
- `writeScopedConfigs` global-root / global-config branches → `writeStandaloneConfigTypes(globalConfigPath, ...)`.
- `propagateGlobalChangesToProjects` per-project loop → `regenerateConfigTypes(projectPath, ...)`.

Helpers `buildConfigTypesBackgroundData(matrix, agents)` and `buildProjectTypesExtras(finalConfig, matrix)` (both in `local-installer.ts`) feed already-loaded matrix/agent data into `regenerateConfigTypes` without re-loading. This rule was hardened under task D-228; the detailed call-site table and rationale live in [../config/config-writer.md](../config/config-writer.md).

## Scope-Aware Config Splitting

> **Detailed documentation:** See [concepts/scope-system.md](../concepts/scope-system.md) for the full cross-cutting scope reference.

Config supports `"project"` and `"global"` scopes on both skills and agents. During installation:

1. `splitConfigByScope()` partitions the merged config into global and project parts
2. `writeScopedConfigs()` in `local-installer.ts` writes:
   - Global config to `~/.claude-src/config.ts` (standalone)
   - Project config to `{projectDir}/.claude-src/config.ts` (imports from global)
3. Config-types files are split similarly: global gets standalone types, project extends global

When installing from the home directory (not a project), a single standalone config is written.

## Source Management

**File:** `src/cli/lib/configuration/source-manager.ts`

| Function             | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `addSource()`        | Add a new extra source to project config   |
| `removeSource()`     | Remove an extra source from project config |
| `getSourceSummary()` | Get summary of all configured sources      |

## Branding / White-Labeling

**Function:** `resolveBranding()` in `src/cli/lib/configuration/config.ts`

Supports custom branding via `.claude-src/config.ts`:

```typescript
export default {
  name: "my-project",
  skills: [],
  agents: [],
  branding: {
    name: "Acme Dev Tools",
    tagline: "Custom development agents",
  },
} satisfies ProjectConfig;
```

Falls back to `DEFAULT_BRANDING` from `src/cli/consts.ts`:

- Name: "Agents Inc."
- Tagline: "AI-powered development tools"

## Schema Validation

Config files are validated at parse boundaries using Zod schemas from `src/cli/lib/schemas.ts`:

| Schema                      | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `projectSourceConfigSchema` | Lenient loader for source config fields |
| `projectConfigLoaderSchema` | Lenient loader for full ProjectConfig   |

Schema URLs defined in `SCHEMA_PATHS` in `src/cli/consts.ts`.

## Operations Layer: writeProjectConfig

**File:** `src/cli/lib/operations/project/write-project-config.ts`

The operations layer provides `writeProjectConfig()` as a high-level orchestrator that runs the full config pipeline:

1. `buildAndMergeConfig()` -- generates config from wizard result, merges with existing (threads `authoritativeScope` and `wizardResult.unresolvableSkillIds` into `mergeWithExistingConfig`)
2. Agent load -- uses pre-loaded `options.agents` when provided, otherwise `loadMergedAgents(sourceResult.sourcePath)` for config-types generation
3. `ensureBlankGlobalConfig()` -- ensures global config exists (when in project context)
4. `writeScopedConfigs()` -- writes config.ts and config-types.ts split by scope

| Type                   | Name                  | Purpose                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ConfigWriteOptions`   | Input options type    | wizardResult, sourceResult, projectDir, sourceFlag, agents, authoritativeScope                             |
| `ConfigWriteResult`    | Return type           | config, configPath, globalConfigPath, wasMerged, existingConfigPath, filesWritten                          |
| `writeProjectConfig()` | Orchestrator function | Builds, merges, and writes project config (init/edit); `filesWritten` is 4 in a project context, 2 at home |

Used by `init.tsx` and `edit.tsx` commands. Replaces inlined config writing logic with a single operation call.

## Plugin Install Failure Semantics

Plugin install intent is inviolable: when `installPluginSkills` returns a non-empty `failed` array, both `init.tsx::installPluginsStep` and `edit.tsx::applyPluginChanges` emit per-skill warnings and then hard-error via `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs. This prevents `config.ts` from being written with orphan entries that claim skills are installed when `claude plugin install` rejected them.

The same guard covers the eject→plugin scope-migration path (D-252): `edit.tsx::applyScopeChanges` runs `executeMigration()` (`mode-migrator.ts`), which returns `failedPluginInstalls` for any skill whose plugin install failed mid-migration; when that array is non-empty, `edit.tsx` hard-errors via `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` before `writeConfigAndCompile`, matching the added-skill path.

Uninstall failures are diagnostic-only — they do not produce orphan state and do not trigger a hard-error. This is the "No Plugin-to-Eject Fallback" / orphan-config invariant codified in CLAUDE.md (Data Integrity) and tasks D-229 / D-252.
