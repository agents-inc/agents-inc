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
  - reference/config/config-writer.md
  - reference/config/config-merger.md
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.146.1 + 0.147.0 + 0.147.1)
     ✓ the ConfigLoadError "Who handles the throw" table and its exhaustiveness note only
     ✗ Default Categories counts, resolution hierarchy, D-279 reconciliation summary,
       barrel-export list — 2026-07-30 basis
-->

# Configuration System

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

## Overview

**Purpose:** Manage project configuration, source resolution, and config persistence.

**Location:** `src/cli/lib/configuration/`

## Files

| File                     | Path                                               | Purpose                                                                               |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `config.ts`              | `src/cli/lib/configuration/config.ts`              | Source resolution, project source config I/O                                          |
| `config-generator.ts`    | `src/cli/lib/configuration/config-generator.ts`    | Generate ProjectConfig from wizard, scope split                                       |
| `config-merger.ts`       | `src/cli/lib/configuration/config-merger.ts`       | Merge wizard result with existing                                                     |
| `config-writer.ts`       | `src/cli/lib/configuration/config-writer.ts`       | Generate TypeScript config source strings                                             |
| `config-types-writer.ts` | `src/cli/lib/configuration/config-types-writer.ts` | Generate config-types.ts type files                                                   |
| `config-loader.ts`       | `src/cli/lib/configuration/config-loader.ts`       | Load TypeScript config via jiti                                                       |
| `project-config.ts`      | `src/cli/lib/configuration/project-config.ts`      | Load and validate project config                                                      |
| `scope-predicates.ts`    | `src/cli/lib/configuration/scope-predicates.ts`    | Shared scope/tombstone predicates (see below)                                         |
| `source-manager.ts`      | `src/cli/lib/configuration/source-manager.ts`      | Add/remove extra sources                                                              |
| `define-config.ts`       | `src/cli/lib/configuration/define-config.ts`       | Type-safe `defineConfig()` helper                                                     |
| `default-categories.ts`  | `src/cli/lib/configuration/default-categories.ts`  | 89 built-in category definitions (see below)                                          |
| `default-rules.ts`       | `src/cli/lib/configuration/default-rules.ts`       | Default skill rule definitions — see [built-in-catalogue.md](./built-in-catalogue.md) |
| `default-stacks.ts`      | `src/cli/lib/configuration/default-stacks.ts`      | Default stack definitions — see [built-in-catalogue.md](./built-in-catalogue.md)      |
| `index.ts`               | `src/cli/lib/configuration/index.ts`               | Barrel exports                                                                        |

**Barrel surface (`index.ts`)** — value exports only, grouped by module: `DEFAULT_SOURCE`, `SOURCE_ENV_VAR`, `getProjectConfigPath`, `loadProjectSourceConfig`, `loadGlobalSourceConfig`, `resolveSource`, `resolveAuthor`, `resolveBranding`, `resolveAllSources`, `isLocalSource`, `validateSourceFormat` (from `config.ts`); `generateProjectConfigFromSkills`, `buildStackProperty`; `mergeConfigs`, `mergeWithExistingConfig`; `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, `effectivelyExcludedSkillIds`; **`ConfigLoadError`**, `loadProjectConfig`, `loadProjectConfigFromDir`, `validateProjectConfig`; `addSource`, `removeSource`, `getSourceSummary`; `defineConfig`, `defaultCategories`, `defaultRules`, `defaultStacks`, `loadConfig`, `generateProjectConfigTypesSource`, `getGlobalConfigTypesPath`, `loadConfigTypesDataInBackground`.

**Deliberately NOT on the barrel since 2026-08-02:** `generateConfigSource`, `generateConfigTypesSource` and `regenerateConfigTypes`. They render (or render-and-write) a config pair half, and a barrel re-export would hand every command a supported way around the config-gate. They stay importable from their own modules by `config-gate/**` and `configuration/**`, eslint-enforced.

Type exports from the barrel: `BrandingConfig`, `SourceEntry`, `ResolvedConfig`, `ResolvedBranding`, `ProjectConfigOptions`, `MergeContext`, `MergeResult`, `AuthoritativeScope`, `LoadedProjectConfig`, `SourceSummary`, `ConfigTypesBackgroundData`.

`splitConfigByScope`, `scopeEligibilityKey`, `isScopePairCompatible`, `SplitConfigResult`, `activeSkillScopeMap`, `activeAgentScopeMap`, `ScopedEntry`, `generateBlankGlobalConfigSource`, `generateBlankGlobalConfigTypesSource` and `getGlobalConfigImportPath` are exported from their own modules but NOT re-exported by the barrel — import them by path.

`writePartialProjectConfig` and `ensureBlankGlobalConfig` are **gone**, along with `config-saver.ts`. Their replacements — `writeProjectPartial`, `ensureBlankPair`, `mutateGlobal` — live in `src/cli/lib/config-gate/index.ts`.

## Config File Locations

| File                 | Path                            | Purpose                                 |
| -------------------- | ------------------------------- | --------------------------------------- |
| Project config       | `.claude-src/config.ts`         | Skills, agents, stack, source, branding |
| Project config types | `.claude-src/config-types.ts`   | Auto-generated type unions for config   |
| Global config        | `~/.claude-src/config.ts`       | Global-scope skills, agents, stack      |
| Global config types  | `~/.claude-src/config-types.ts` | Auto-generated global type unions       |

Config uses a unified `ProjectConfig` type for both source-level settings (source, marketplace, branding) and installation settings (skills, agents, stack). Files are TypeScript (loaded via jiti), not YAML.

## Config Load Outcomes — Three States, Not Two (D-273)

**File:** `src/cli/lib/configuration/project-config.ts`

`loadProjectConfigFromDir(projectDir)` distinguishes THREE outcomes. Collapsing the last two into `null` is the D-273 bug: a corrupt `.claude-src/config.ts` read as "no config", so `compile` treated the project as config-less and rebuilt every built-in agent.

| On disk                                                           | Outcome                                          | Signal                                                |
| ----------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| No file at `<dir>/.claude-src/config.ts`                          | `null`                                           | `verbose("Project config not found at ...")`          |
| File loads, exports an object, passes `projectConfigLoaderSchema` | `LoadedProjectConfig` (`{ config, configPath }`) | —                                                     |
| `loadConfig()` throws (syntax/evaluation error)                   | **throws `ConfigLoadError`**                     | `reason` = `getErrorMessage(error)`                   |
| Loaded value is falsy or not an object (no usable default export) | **throws `ConfigLoadError`**                     | `reason` = `"the file has no valid default export"`   |
| `projectConfigLoaderSchema.safeParse` fails                       | **throws `ConfigLoadError`**                     | `reason` = `formatZodErrors(result.error).join("; ")` |

**`ConfigLoadError`** (exported from `project-config.ts` and re-exported by `src/cli/lib/configuration/index.ts`) carries `configPath` and `reason` as readonly fields; its message is `` `Config at '${configPath}' could not be loaded: ${reason}` ``.

Two lenient repairs happen only on the success path, both with a `warn()`: a missing `name` defaults to `path.basename(projectDir)`, and a missing `skills` array defaults to `[]`. `agents` is NOT defaulted by the loader.

### Who handles the throw

| Caller                                                                 | Behaviour on `ConfigLoadError`                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `compile` (`src/cli/commands/compile.ts` → `detectInstallations`)      | Catches, hard-errors with `this.error(error.message, { exit: EXIT_CODES.ERROR })` before any write |
| `detectProject` (`src/cli/lib/operations/project/detect-project.ts`)   | Catches, returns `null` so `doctor` / `edit` report a config problem instead of crashing           |
| `detectInstallationInDir` (`src/cli/lib/installation/installation.ts`) | Does NOT catch — propagates, so no phantom eject installation is fabricated                        |
| `uninstall` — GLOBAL config (`src/cli/commands/uninstall.tsx`)         | A corrupt global config during `deregisterProjectPath` is warned, never fatal                      |
| `uninstall` — PROJECT config (`loadUninstallConfig`, same file)        | Catches `ConfigLoadError` **only**, warns, returns `null`; the uninstall proceeds and exits 0      |
| `mergeWithExistingConfig` (`config-merger.ts`)                         | Does NOT catch — `loadProjectConfig` throws straight through to the wizard save path               |

The two `uninstall` rows are the same posture applied at both ends, and the second one is newer (0.146.1). `loadUninstallConfig` narrows before swallowing:

```ts
if (!(error instanceof ConfigLoadError)) throw error;
```

so a genuine fault still propagates. Its warn text is `Could not read the project config — plugins and compiled agents it lists may be left behind: <reason>`. An unreadable config is then treated exactly like a **missing** one, because an unreadable config is precisely when a user needs to uninstall; before this, a `ConfigLoadError` escaped `run()` and the only way out was to hand-delete `.claude-src/`. Only the removal _plan_ degrades — the plugins and compiled agents the config named can no longer be identified, while file removal proceeds. Full flow in `reference/commands/index.md` → `uninstall`.

**Exhaustiveness.** Three call sites in non-test `src/` narrow on the error explicitly (`error instanceof ConfigLoadError`): `compile.ts`, `detect-project.ts`, and `uninstall.tsx`'s `loadUninstallConfig`. The `uninstall` GLOBAL row is a **bare** `catch (error)` that warns on anything, so it handles a `ConfigLoadError` without naming the class. The remaining two rows (`detectInstallationInDir`, `mergeWithExistingConfig`) are statements about _absence_ of a catch and so are invisible to a grep — they are listed because propagating is itself the documented posture. Beyond these, the only other `ConfigLoadError` occurrences in non-test `src/` are the class definition and its throw sites (`configuration/project-config.ts`), the barrel re-export (`configuration/index.ts`), and one explanatory comment in `installation.ts`.

`loadProjectConfig(projectDir)` layers a home-directory fallback on top: project dir first, then `os.homedir()` when `projectDir` is not already home. Both legs can throw `ConfigLoadError`.

### Content-less config is not an installation

`detectInstallationInDir` returns `null` when a successfully-loaded config declares `skills.length === 0` AND `(agents ?? []).length === 0`. A manifest with no content no longer counts as an installation, so `init` routes to the setup wizard rather than the dashboard. `skills` is read directly (the loader defaults it); `agents` is guarded with `?? []` because the loader does not default it.

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

## Default Category Definitions

**File:** `src/cli/lib/configuration/default-categories.ts`
**Export:** `defaultCategories` — `Record<Category, CategoryDefinition>` asserted with `as const satisfies`, so a category present in the generated `Category` union but absent here is a `tsc --noEmit` TS1360 failure.

**Count: 89 definitions**, one per member of the generated `CATEGORIES` tuple in `src/cli/types/generated/source-types.ts` (`export type Category = (typeof CATEGORIES)[number]`). 27 are `exclusive: true`; 6 are `required: true`.

Prior to 0.145.0 only 51 were defined. The `satisfies` assertion failed to type-check, and every undefined category was auto-synthesized at load time by `synthesizeCategory` in `src/cli/lib/matrix/skill-resolution.ts` — `displayName` from `toTitleCase(category)` ("Api Graphql"), `description` `"Auto-generated category for <id>"`, `exclusive: false`, `required: false`, `order: 999` (`AUTO_SYNTH_ORDER`). That placeholder shape is what the wizard actually rendered. The 38 added definitions are derived from the marketplace matrix; 11 of them are exclusive.

### Per-domain breakdown

| Domain    | Categories | `order` range   | `exclusive: true`                                                                                                                                  | `required: true`               |
| --------- | ---------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `web`     | 26         | 1–26            | `web-framework`, `web-meta-framework`, `web-routing`, `web-client-state`, `web-server-state`, `web-i18n`, `web-realtime`, `web-editor`, `web-maps` | `web-framework`, `web-styling` |
| `api`     | 18         | 1–19 (7 unused) | `api-api`, `api-database`, `api-auth`, `api-email`, `api-baas`, `api-framework`, `api-graphql`                                                     | `api-api`                      |
| `mobile`  | 15         | 1–15            | `mobile-navigation`, `mobile-styling`, `mobile-ui-components`, `mobile-testing`                                                                    | `mobile-framework`             |
| `desktop` | 12         | 1–12            | `desktop-framework`, `desktop-multiwindow`, `desktop-security`, `desktop-packaging`                                                                | `desktop-framework`            |
| `ai`      | 5          | 1–5             | —                                                                                                                                                  | —                              |
| `infra`   | 5          | 1–5             | `infra-iac`                                                                                                                                        | —                              |
| `shared`  | 3          | 1–3             | `shared-monorepo`                                                                                                                                  | —                              |
| `meta`    | 3          | 1–3             | —                                                                                                                                                  | —                              |
| `cli`     | 2          | 1–2             | `cli-framework`                                                                                                                                    | `cli-framework`                |

### Ordering rule

`order` is **importance-first within the domain**, not alphabetical and not source-literal order. Object-literal key order in the file is alphabetical after each domain's anchor entry, so the two diverge — read `order`, never position. Examples: `infra-iac` is declared after `infra-containers` but carries `order: 4` to its `5`; `mobile-animation` is the second `mobile` key in the file but carries `order: 6`. The `mobile`, `desktop` and `infra` groups were renumbered importance-first when their definitions were added (`mobile-framework` 1 → `mobile-navigation` 2 → `mobile-styling` 3 → … → `mobile-deployment` 15).

### Quirks worth knowing before editing

- `api` skips `order: 7` (`api-email` is 6, `api-baas` is 8). Nothing depends on contiguity — `order` is only a sort key.
- `mobile-framework` is `required: true` but `exclusive: false` — the only domain-anchor "framework" category that permits multiple selections.
- `api-framework` carries a source comment flagging it as a possible duplicate of `api-api`; both are `exclusive: true` in the `api` domain.

### Merge and consumption

`loadSkillsMatrixFromSource` in `src/cli/lib/loading/source-loader.ts` builds the matrix's `categories` as `{ ...defaultCategories, ...sourceCategories }` when the source repo ships `skill-categories.ts`, otherwise uses `defaultCategories` verbatim. **A source repo's override wins**, which is why write-time rules read `exclusive` off the merged matrix rather than off `defaultCategories` (see `isExclusiveCategory` in `src/cli/lib/installation/local-installer.ts`).

The definitions are pinned by `src/cli/lib/configuration/__tests__/default-categories.test.ts`, which asserts `EXPECTED_CATEGORY_COUNT = 89` and `typedKeys(defaultCategories).sort()` equals `CATEGORIES.sort()`, so the table and the generated union cannot drift apart again.

### Undeclared `exclusive` — two different defaults

| Reader                                                                 | Undeclared `exclusive` treated as | Why                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/cli/lib/wizard/build-step-logic.ts` (`cat.exclusive ?? true`)     | `true` (radio)                    | Safer default for rendering an unknown category                                               |
| `isExclusiveCategory` in `local-installer.ts` (`?.exclusive === true`) | `false`                           | A rule that MASKS persisted config entries must only fire on a flag the data actually carries |

This asymmetry is deliberate; do not "fix" one to match the other.

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

**Since D-277, "absent from `newConfig`" no longer means "deselected" for a globally installed item under `authoritativeScope: "owned"`.** A project-scope edit cannot produce that absence: the wizard guards refuse the deselect and `applySkillRemoval` leaves an inherited global-active entry byte-identical. An absent global entry therefore reflects a global-scope change or a legacy config. Full contract: [../config/config-merger.md](../config/config-merger.md).

## Config I/O

| Function                     | Purpose                                                                                                                                   | File                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `loadProjectSourceConfig()`  | Load .claude-src/config.ts (partial)                                                                                                      | `config.ts`                                        |
| `loadGlobalSourceConfig()`   | Load ~/.claude-src/config.ts (partial)                                                                                                    | `config.ts`                                        |
| `loadProjectConfig()`        | Load + validate with global fallback; **throws `ConfigLoadError`** on a corrupt file at either leg                                        | `project-config.ts`                                |
| `loadProjectConfigFromDir()` | Load + validate from specific dir only; `null` only when the file is MISSING, **throws `ConfigLoadError`** when it exists but is unusable | `project-config.ts`                                |
| `validateProjectConfig()`    | Validate an already-loaded value: `projectConfigLoaderSchema` plus required `name` and `agents`                                           | `project-config.ts`                                |
| `generateConfigSource()`     | Generate TypeScript source string                                                                                                         | `config-writer.ts`                                 |
| `loadConfig()`               | Generic TypeScript config loader (jiti)                                                                                                   | `config-loader.ts`                                 |
| `defineConfig()`             | Type-safe config helper (identity fn)                                                                                                     | `define-config.ts`                                 |
| `getProjectConfigPath()`     | Build absolute path to project config                                                                                                     | `install-base-dir.ts` (re-exported by `config.ts`) |
| `resolveAllSources()`        | Resolve primary + extra sources                                                                                                           | `config.ts`                                        |
| `resolveAuthor()`            | Resolve author from effective config                                                                                                      | `config.ts`                                        |
| `writeProjectPartial()`      | Write a partial PROJECT config, filling defaults; refuses `$HOME`                                                                         | `config-gate/index.ts`                             |

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. **Renders only — writes nothing** since the config-gate landed (2026-08-02).

| Function                                 | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `generateConfigSource()`                 | Main entry: generates config.ts source string |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)            |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)   |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`     |

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

When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the global install root), the import-from-global writer `regenerateConfigTypes` applies. When writing the GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), the standalone unions apply — emitted only by `config-gate/pair-writer.ts`. The rule is structural since 2026-08-02: `regenerateConfigTypes` throws `GlobalPairWriteViolation` at `$HOME`, and the standalone renderer is private to the gate (the former `writeStandaloneConfigTypes` export is gone).

In `config-gate/`:

- `writeScopedFromWizard` project branch → `writeProjectConfigPair` → `regenerateConfigTypes(projectDir, ...)`.
- `writeScopedFromWizard` home branch / project-branch global write → `writeGlobalPair` → `pair-writer`'s standalone renderer.
- `propagateGlobalChangesToProjects` per-project loop → the SAME `writeProjectConfigPair`.
- `reconcileTypesFromDisk(projectDir, config, deps, opts?)` — the scope-dispatching entry: `isHomeDirectory(projectDir)` → standalone half, otherwise `regenerateConfigTypes`. The single entry point for callers holding a persisted config and only its scope. `writeScaffoldedEntityTypes` is the same dispatch for `new skill` / `new agent` / `new marketplace`.

Helpers `buildConfigTypesBackgroundData(matrix, agents)` and `buildProjectTypesExtras(config, matrix)` (both in `config-gate/propagate.ts`) feed already-loaded matrix/agent data into `regenerateConfigTypes` without re-loading. This rule was hardened under D-228 and D-282; the detailed call-site table and rationale live in [../config/config-writer.md](../config/config-writer.md).

### `compile` regenerates `config-types.ts`

The documented workflow is "hand-edit `config.ts`, then run `compile`", so a compile pass that leaves the unions untouched strands them. `Compile.refreshConfigTypes` (`src/cli/commands/compile.ts`) runs once per compile pass:

1. `loadProjectConfigFromDir(pass.projectDir)` — a `null` (no config) skips the refresh with a `verbose()` line.
2. `loadSkillsMatrixFromSource({ sourceFlag, projectDir, skipExtraSources: true, matrixOnly: true })` — `matrixOnly` skips the source clone for the default source so compile stays offline on a cold cache.
3. `reconcileTypesFromDisk(pass.projectDir, loaded.config, { matrix, agents: pass.agents }, { currentProjectDir: cwd })`.

The unions follow the **config**, not the discovered skills: `runCompilePass` calls `refreshConfigTypes` in the `totalSkillCount === 0` early-return branch as well, before returning `false`. A failure downgrades to `this.warn(configTypesRefreshFailed(...))` — the compiled agents are already written and remain valid.

**A home-directory pass also propagates.** `config.ts` on disk is the input and is never rewritten (a hand edit must survive the compile), which means there is no prior state to diff against and nothing to classify. The only safe assumption is that every registered project's inlined copy of the global config is stale, so the home pass fans it out unconditionally and recompiles those projects' agents, printing `Recompiled agents in N registered projects`. `currentProjectDir: cwd` keeps the home pass out of the project whose own pass is about to compile it. Skipped projects are warned via `registeredProjectUpdateSkipped`; that rendering sits deliberately outside the refresh's `catch`, so an unreachable project is not reported as a failure to refresh the unions.

`skipExtraSources: true` is not a divergence from the wizard's fully tagged load: extra-source loading only annotates `availableSources` / `activeSource` for wizard UI tagging, which the config-types writer never reads. Byte-identity is pinned by the `skipExtraSources` parity test in `local-installer.test.ts`.

### A global uninstall regenerates every registered project's types

`pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)` (in `config-gate/propagate.ts`, reached through the `propagateGlobalRemoval` entry point) re-enters `propagateGlobalChangesToProjects` with an emptied global config (`skills: []`, `agents: []`, `selectedAgents: []`), so every global skill/agent reads as removed: inlined global rows and their tombstones drop out of each project's `config.ts`, and each project's `config-types.ts` is regenerated. `selectedAgents` must be emptied alongside the arrays because the project writer re-unions the global `selectedAgents` into the project's.

`uninstall.tsx` calls `propagateGlobalRemoval` from `updateRegisteredProjects`, AFTER the global `.claude-src` manifest is removed, so the regenerated project types fall back to the standalone form instead of importing a deleted global `config-types.ts`. The data it needs (`globalConfig.projects`, matrix, agent defs) is captured by `prepareGlobalPropagation` BEFORE the removal, since source resolution reads the config being deleted. Unreachable projects are warned (`registeredProjectUpdateSkipped`) and never abort the uninstall. **The prune now also recompiles the pruned projects' agents** — they were compiled against the global rows this uninstall just removed — and `uninstall.tsx` renders `GateReport.recompile` after the `registeredProjectsUpdated` line. `propagateGlobalRemoval` writes no pair: the pair it would derive from has just been deleted, which is why it is its own entry point rather than a flag on a writing one.

## Scope-Aware Config Splitting

> **Detailed documentation:** See [concepts/scope-system.md](../concepts/scope-system.md) for the full cross-cutting scope reference.

Config supports `"project"` and `"global"` scopes on both skills and agents. During installation:

1. `splitConfigByScope()` partitions the merged config into global and project parts
2. `writeScopedFromWizard()` in `config-gate/index.ts` writes:
   - Global config to `~/.claude-src/config.ts` (standalone)
   - Project config to `{projectDir}/.claude-src/config.ts` (imports from global)
3. Config-types files are split similarly: global gets standalone types, project extends global

`writeScopedFromWizard` returns a `GateReport` = `{ globalWritten, changes, propagated: { updated, skipped }, recompile }`. It is a record of completed work, not a to-do list: the registered projects a global change fanned out into have **already** had their agents recompiled by the time it resolves (see "Propagated-project recompilation" below).

When installing from the home directory (not a project), a single standalone config is written.

## Cross-Scope Reconciliation Before Every Project Write (D-279)

**Function:** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` in `src/cli/lib/installation/local-installer.ts`

Two production paths write a project `config.ts` with the global config inlined. Before D-279 only one of them reconciled; the other handed the raw `splitConfigByScope` output straight to the writer, so a project owning a skill at project scope while the same id (or a different skill in the same exclusive category) was active globally ended up with **two active entries** in its own config. `doctor` and `validate` both passed on that state — neither checks config semantics.

One shared step now runs immediately before BOTH writes:

| Write site                                                  | Reconciliation call                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `writeScopedFromWizard` project branch (ordinary init/edit) | `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` |
| `propagateGlobalChangesToProjects` per-project loop         | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)`                |

**Contract:**

- **Masks** a live global entry (`{ ...globalEntry, excluded: true }`, so the mask carries the global install's `source`) on an IDENTITY collision — the project owns the same id/name at project scope — for skills AND agents (`maskCollidingGlobalSkills`, `maskCollidingGlobalAgents`).
- **Additionally masks** a live global skill when the project owns a DIFFERENT active skill in the same category and the merged matrix declares that category `exclusive`. Skills only: agents have no categories, so `maskCollidingGlobalAgents` is identity-only.
- **Drops** a mask once its collision clears (`dropOrphanedDerivedMasks`, `dropOrphanedDerivedAgentMasks`). Self-heal runs BEFORE masking on both axes, so a cleared collision is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees warranted tombstones.
- **Idempotent** — an id the project already tombstones is skipped.
- Reads `exclusive` from the **merged matrix** (`isExclusiveCategory`), so a source repo's category override is honoured. An **undeclared** flag is treated as non-exclusive.
- **Never throws** on a custom skill absent from the matrix: `categoryOfSkill` returns `undefined` for a missing entry and for `LOCAL_PSEUDO_CATEGORY`, and neither participates in category rules.
- **Project-local only.** The global config passed in is read, never rewritten — a tombstone is never written into `~/.claude-src/config.ts`.

**The project's own skill wins locally.** This is deliberately asymmetric with `toggleTechnology`'s exclusive-swap guard, which refuses a user-initiated swap over a globally-locked skill: there the user is displacing a shared install, whereas here a global install landed on top of pre-existing project state and letting it win would silently uninstall the user's own skill. Lifting that guard is tracked as D-276 in `todo/cli.md`.

**Mask lifetime.** Since D-277 no store path can mint a BARE global tombstone — a project-scope deselect of a globally installed item is refused, and a domain deselect only drops what the project owns. The single remaining user route (`s`, G→P) always pairs the tombstone with an active project entry, i.e. an identity collision. Every bare mask is therefore system-derived by construction, and the retention test is one rule: **keep a mask only while the collision that would re-derive it still holds**, in `required` and optional categories alike. This replaced the earlier `exclusive && required` narrowing, which existed only because a derived mask and a deliberate exclusion were indistinguishable on disk.

## Propagated-Project Recompilation (D-240)

Propagation itself rewrites a registered project's `config.ts` / `config-types.ts` but never its compiled `.claude/agents/*.md`. **The gate does that step, not the caller** (contract rewritten 2026-08-02): `config-gate/recompile.ts` runs `recompilePropagatedProjectAgents(projectDirs)` (`src/cli/lib/operations/project/recompile-project-agents.ts`, imported lazily to avoid the lib → operations cycle) over `propagated.updated`, and the result lands on `GateReport.recompile` for the command to render. The earlier contract returned the directories for the caller to recompile — which only `init` and `edit`'s wizard tail ever did, leaving `edit`'s source migration and the global `uninstall` behind.

`recompileRegisteredProjectAgents(projectDir)` recompiles **project scope only** (`scopeFilter: "project"`) — the global agents were already recompiled by the triggering operation's own pass. It passes `discoverInstalledSkills(projectDir).allSkills` explicitly so global-local and project-local skills are not stripped. `recompilePropagatedProjectAgents` loops sequentially with per-project failure isolation, returning `{ recompiledCount, failedCount, warnings }`.

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
3. `config-gate::ensureBlankPair()` -- ensures the global config pair exists (when in project context)
4. `config-gate::writeScopedFromWizard()` -- writes config.ts and config-types.ts split by scope, fans global changes out to registered projects and recompiles their agents

| Type                   | Name                  | Purpose                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ConfigWriteOptions`   | Input options type    | wizardResult, sourceResult, projectDir, sourceFlag, agents, authoritativeScope                             |
| `ConfigWriteResult`    | Return type           | config, configPath, wasMerged, existingConfigPath, filesWritten, **propagation: GateReport**               |
| `writeProjectConfig()` | Orchestrator function | Builds, merges, and writes project config (init/edit); `filesWritten` is 4 in a project context, 2 at home |

`propagation` is the `GateReport` returned verbatim by `writeScopedFromWizard`; `init.tsx` and `edit.tsx` **render** it (D-240) — the recompile it describes already ran inside the write. The result carries no `globalConfigPath` — the field was declared, never populated and never read, and has been deleted.

Used by `init.tsx` and `edit.tsx` commands. Replaces inlined config writing logic with a single operation call.

**Corrupt-config propagation:** step 1 reaches `mergeWithExistingConfig` → `loadProjectConfig`, which since D-273 throws `ConfigLoadError` on an unparseable config rather than returning `null`. Neither `mergeWithExistingConfig` nor `writeProjectConfig` catches it, so a wizard save against a corrupt on-disk config fails loudly instead of silently treating the config as absent and rewriting it from scratch.

## Plugin Install Failure Semantics

Plugin install intent is inviolable: when `installPluginSkills` returns a non-empty `failed` array, both `init.tsx::installPluginsStep` and `edit.tsx::applyPluginChanges` emit per-skill warnings and then hard-error via `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs. This prevents `config.ts` from being written with orphan entries that claim skills are installed when `claude plugin install` rejected them.

The same guard covers the eject→plugin scope-migration path (D-252): `edit.tsx::applyScopeChanges` runs `executeMigration()` (`mode-migrator.ts`), which returns `failedPluginInstalls` for any skill whose plugin install failed mid-migration; when that array is non-empty, `edit.tsx` hard-errors via `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` before `writeConfigAndCompile`, matching the added-skill path.

Uninstall failures are diagnostic-only — they do not produce orphan state and do not trigger a hard-error. This is the "No Plugin-to-Eject Fallback" / orphan-config invariant codified in CLAUDE.md (Data Integrity) and tasks D-229 / D-252.
