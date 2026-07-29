---
scope: reference
area: concepts
keywords:
  [
    scope,
    project,
    global,
    SkillScope,
    resolveInstallPaths,
    installBaseDir,
    isHomeDirectory,
    writeScopedConfigs,
    splitConfigByScope,
    scope-predicates,
    isActiveAt,
    isProjectOwned,
    isGlobalTombstone,
    dual-scope,
    lock-icon,
    isEditingFromGlobalScope,
    isInitMode,
  ]
related:
  - reference/architecture/overview.md
  - reference/wizard/flow.md
  - reference/wizard/state-transitions.md
  - reference/config/configuration.md
  - reference/config/scope-split.md
  - reference/wizard/component-patterns.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/guard-pattern.md
last_validated: 2026-07-24
---

# Scope System (Project vs Global)

**Last Updated:** 2026-07-24
**Last Validated:** 2026-07-24

> **Cross-cutting concept.** Consolidates scope documentation from: `architecture-overview.md` (Section 11), `wizard-flow.md` (guards), `state-transitions.md` (scope actions), `configuration.md` (scope-aware splitting), `component-patterns.md` (dual-scope badges, lock icons).

## Overview

Skills and agents can exist at two scopes: `"project"` and `"global"`. This affects where files are installed, how config is split, and how the wizard enforces editing constraints.

## File Paths by Scope

| Scope     | Skills Path                    | Agents Path                    | Config Path                          |
| --------- | ------------------------------ | ------------------------------ | ------------------------------------ |
| `project` | `{projectDir}/.claude/skills/` | `{projectDir}/.claude/agents/` | `{projectDir}/.claude-src/config.ts` |
| `global`  | `~/.claude/skills/`            | `~/.claude/agents/`            | `~/.claude-src/config.ts`            |

## Path Resolution

**Function:** `resolveInstallPaths(projectDir, scope)` in `src/cli/lib/installation/install-base-dir.ts`

Delegates to `installBaseDir(projectDir, scope)` (same file): uses `os.homedir()` for `"global"`, `projectDir` for `"project"`. Defaults to `"project"` when `scope` is omitted. `os.homedir()` is called at runtime (not the `GLOBAL_INSTALL_ROOT` import-time constant in `consts.ts`) so the path agrees with mocked home directories in tests.

**Returned paths** (`InstallPaths` type, `install-base-dir.ts`):

- `skillsDir` = `{base}/{LOCAL_SKILLS_PATH}`
- `agentsDir` = `{base}/{CLAUDE_DIR}/{STANDARD_DIRS.AGENTS}`
- `configPath` = `getProjectConfigPath(base)` = `{base}/{CLAUDE_SRC_DIR}/{STANDARD_FILES.CONFIG_TS}`

## Type Definitions

**`SkillScope`** (`src/cli/types/config.ts`) is the named union both configs use:

```typescript
type SkillScope = "project" | "global";
```

**`SkillConfig`** (`src/cli/types/config.ts`):

```typescript
type SkillConfig = {
  id: SkillId;
  scope: SkillScope;
  source: string; // "eject" | marketplace name (e.g., "agents-inc")
  excluded?: boolean;
};
```

**`AgentScopeConfig`** (`src/cli/types/config.ts`):

```typescript
type AgentScopeConfig = {
  name: AgentName;
  scope: SkillScope;
  excluded?: boolean;
};
```

## Scope Predicates

**Module:** `src/cli/lib/configuration/scope-predicates.ts` — the source of truth for classifying scoped config entries. Partitioning, tombstone routing, and prior-vs-next delta computation all funnel through these pure predicates instead of re-deriving `scope`/`excluded` comparisons inline.

**`ScopedEntry`** is the shared shape every predicate accepts (both `SkillConfig` and `AgentScopeConfig` structurally satisfy it):

```typescript
type ScopedEntry = { scope?: SkillScope; excluded?: boolean };
```

| Export                        | Signature                                                                          | Meaning                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `isActiveAt`                  | `(entry: ScopedEntry, scope: SkillScope) => boolean`                               | `entry.scope === scope && !entry.excluded` — active (non-excluded) entry at the given scope.                                            |
| `isGlobalTombstone`           | `(entry: ScopedEntry) => boolean`                                                  | `scope === "global"` AND `excluded` — a project-level directive masking a shared global install.                                        |
| `isProjectOwned`              | `(entry: ScopedEntry) => boolean`                                                  | Project-scoped OR a global tombstone. Inherited global-active entries belong to the global config, not the project.                     |
| `activeProjectAgentNames`     | `(agents: readonly AgentScopeConfig[]) => AgentName[]`                             | Names of agents active at `"project"` scope.                                                                                            |
| `activeSkillScopeMap`         | `(skills: readonly SkillConfig[] \| undefined) => Map<SkillId, SkillScope>`        | Scope of each non-excluded skill, keyed by id.                                                                                          |
| `activeAgentScopeMap`         | `(agents: readonly AgentScopeConfig[] \| undefined) => Map<AgentName, SkillScope>` | Scope of each non-excluded agent, keyed by name.                                                                                        |
| `effectivelyExcludedSkillIds` | `(skills: readonly SkillConfig[]) => Set<SkillId>`                                 | Ids with an excluded entry that no same-id active entry rescues (an excluded-global + active-project pair is NOT effectively excluded). |

**Consumers:**

| File                     | Predicates used                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `config-generator.ts`    | `isActiveAt` (drives the `splitConfigByScope` partition), `activeAgentScopeMap`, `effectivelyExcludedSkillIds`                       |
| `local-installer.ts`     | `isActiveAt`, `isGlobalTombstone`, `activeSkillScopeMap`, `activeAgentScopeMap`, `effectivelyExcludedSkillIds` (prior-vs-next delta) |
| `config-merger.ts`       | `isGlobalTombstone`, `isProjectOwned`, `ScopedEntry`                                                                                 |
| `config-types-writer.ts` | `activeProjectAgentNames`                                                                                                            |

Re-exported from `src/cli/lib/configuration/index.ts`.

## Config Splitting

**Function:** `splitConfigByScope()` in `src/cli/lib/configuration/config-generator.ts`

Splits a `ProjectConfig` into global and project partitions by skill/agent scope. Partitions each of `config.skills` and `config.agents` with `isActiveAt(entry, "global")` from [Scope Predicates](#scope-predicates): active-global entries form the global split, everything else (project-scoped entries and global tombstones) forms the project split. Returns `SplitConfigResult` (`{ global: ProjectConfig; project: ProjectConfig }`). Tombstones (`scope: "global", excluded: true`) route to the PROJECT split because they are project-level directives suppressing a shared global install.

> **Detailed partition rules, stack routing, and delta pipeline:** See [config/scope-split.md](../config/scope-split.md).

**Writer:** `writeScopedConfigs()` in `src/cli/lib/installation/local-installer.ts`

Writes:

1. Global config to `~/.claude-src/config.ts` (standalone) — merged into any existing global config via `mergeGlobalConfigs()`, then written only when `resolveEffectiveGlobalConfig()` reports a change
2. Project config to `{projectDir}/.claude-src/config.ts` (self-contained snapshot via `generateProjectConfigWithInlinedGlobal()` -- both global and project entries inlined, no import/spread)
3. Config-types files: the global config-types is standalone (`writeStandaloneConfigTypes`); the project config-types is written via `regenerateConfigTypes`, whose global-aware branch imports `GlobalSkillId`/`GlobalAgentName` from the global types and extends them with project-only additions when a global install exists (falls back to standalone otherwise)

When installing from the home directory (detected via `isHomeDirectory(projectDir)` in `src/cli/lib/installation/is-home-directory.ts`, which compares `fs.realpathSync` of the dir and `os.homedir()`), scope splitting is skipped: a single standalone global config is written via `writeConfigFile` + `writeStandaloneConfigTypes`, and changes propagate to all registered projects via `propagateGlobalChangesToProjects`.

## Config Writer Scope Handling

`generateConfigSource()` in `src/cli/lib/configuration/config-writer.ts`:

- When `isProjectConfig: true` with `globalConfig` provided (the standard path used by `writeScopedConfigs`): generates a self-contained config snapshot via `generateProjectConfigWithInlinedGlobal()`. Both global and project entries for the same skill ID are preserved (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`. Excluded global entries (tombstones) replace their active global counterparts.
- When `isProjectConfig: true` without `globalConfig` (fallback path): generates a config that imports from the global config and spreads global arrays into skills, agents, and domains.

## Wizard Scope Guards

### Global-Item Guard Pattern

Guards prevent project-scope edits from modifying globally-installed skills/agents.

**Guard check:** If a skill/agent is found in `installedSkillConfigs`/`installedAgentConfigs` with `scope === "global"` and `!excluded`, and the wizard is NOT in global-scope edit mode (`isEditingFromGlobalScope === false`) and NOT in init mode (`isInitMode === false`), the action returns a toast message instead of modifying state.

**Key state fields:**

- `isEditingFromGlobalScope` (boolean) -- When true, `toggleSkillScope`/`toggleAgentScope` short-circuit to a no-op (not a toast). Set during wizard hydration.
- `isInitMode` (boolean, default `false`) -- Distinguishes init wizard (first-time setup, no restrictions) from edit wizard (existing installation, global items locked). `hydrateWizardStore` dispatches to `hydrateForInit` (sets `isInitMode: true`) when no `initialStep` is passed, or `hydrateForEdit` (sets `isInitMode: false`) when one is. Init passes no `initialStep`; edit passes `"build"`.

**How `isEditingFromGlobalScope` is computed:**

- Both `init.tsx` and `edit.tsx` now use the shared `isHomeDirectory(dir)` helper (`src/cli/lib/installation/is-home-directory.ts`), which compares `fs.realpathSync(dir)` against `fs.realpathSync(os.homedir())` (falling back to plain string equality when a path cannot be resolved). This resolves symlinks on both sides, so the earlier init-vs-edit asymmetry is gone.
  - `init.tsx`: `isEditingFromGlobalScope: isHomeDirectory(projectDir)`.
  - `edit.tsx`: `isEditingFromGlobalScope: isHomeDirectory(cwd)`.
- `GLOBAL_INSTALL_ROOT = os.homedir()` from `src/cli/consts.ts` is evaluated at import time; runtime callers use `os.homedir()` directly (or `isHomeDirectory`) so test home-dir mocks apply.

**Actions with guards:**

| Action                       | Guard Behavior                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleTechnology()`         | Toast if skill is installed globally (snapshot active global, OR a snapshot tombstone paired with a live active-global entry on the `isSelected` deselect path). SPACE on a live `[P][G]` row is inert — dual-scope arm toasts and leaves badges unchanged (D-260). Also toasts if an exclusive swap would deselect a globally-installed skill or collapse a live `[P][G]` pair. |
| `toggleSkillScope()`         | No-op if `isEditingFromGlobalScope`. Sole dual-scope toggle — `s` round-trips `[P][G]` → `[G]` → `[P][G]` (D-260). Toast if project eject to global and global eject already installed (no tombstone).                                                                                                                                                                           |
| `toggleAgent()`              | Toast if agent is installed globally (same snapshot/tombstone shape as `toggleTechnology`), unless global edit or init mode. SPACE on a live `[P][G]` agent row is inert — dual-scope arm toasts, badges unchanged (D-260).                                                                                                                                                      |
| `toggleAgentScope()`         | No-op if `isEditingFromGlobalScope`. Sole dual-scope toggle — `s` round-trips `[P][G]` → `[G]` → `[P][G]` (D-260).                                                                                                                                                                                                                                                               |
| `toggleFilterIncompatible()` | Skips skills with `excluded` flag when finding incompatible web skills (protects tombstoned globals); refuses the whole toggle with a toast if any target is a locked global.                                                                                                                                                                                                    |

> **Detailed documentation:** See [concepts/guard-pattern.md](./guard-pattern.md) for the full unified guard reference.

### Scope Toggle Eject Guard (D-199)

`toggleSkillScope` in `wizard-store.ts` blocks project-eject to global-eject promotion when a non-excluded global eject entry already exists in `installedSkillConfigs` (source compared against the `EJECT_SOURCE` constant). However, if the current `skillConfigs` already contains an excluded tombstone for that skill ID, the guard allows the toggle (undo path). Because a live `[P][G]` pair always carries the excluded global tombstone, a reopened dual-scope eject pair reaches this eject-collision check but is allowed via the undo path — `s` collapses it to `[G]`. (D-260 removed the pre-emptive persisted-pair guard that used to short-circuit before this check.) See [concepts/guard-pattern.md](./guard-pattern.md).

> **Detailed documentation:** See [concepts/tombstone-pattern.md](./tombstone-pattern.md) for full tombstone lifecycle.

## Scope Store Actions

| Action               | Signature                        | Effect                                                                                         |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `toggleSkillScope()` | `(skillId: SkillId) => void`     | Toggles `scope` between `"project"` and `"global"`. Tombstone management on scope transitions. |
| `toggleAgentScope()` | `(agentName: AgentName) => void` | Toggles `scope` between `"project"` and `"global"`. Tombstone management on scope transitions. |

**Tombstone management on scope toggle:**

- Moving global-installed skill/agent to project (G→P): adds excluded global entry (tombstone). Gated on `wasInstalledGlobally` (derived from `installedSkillConfigs`/`installedAgentConfigs`) so fresh init toggles don't create spurious tombstones. Since the 2026-07-18 hydration-snapshot fix, `wasInstalledGlobally` counts a **global tombstone** as "installed globally" (the `.some((sc) => sc.id === skillId && sc.scope === "global")` predicate has no `!excluded` filter) — a tombstone means the skill IS installed globally and this project overrides it. This lets an in-session collapse→`s` restore a genuine `[P][G]` pair. The skill and agent paths now match on this point.
- Moving back to global (P→G): unconditionally removes any excluded global tombstone for that id/name. The rationale is the invariant below — an active entry at global scope supersedes any tombstone at the same scope. Unconditional removal (not gated on `wasInstalledGlobally`) is load-bearing for the D-224 undo path.

**Invariant:** no active entry and tombstone coexist at the same `(id, scope)` — an active entry at global scope always supersedes any tombstone at the same scope.

> **Known limitation (D-227, open):** preselection can transiently violate this same-scope invariant. When the ONLY saved entry for a name/id is a global-scope excluded tombstone and preselection then re-includes it, `buildSkillConfigForId`/`buildAgentConfigForName` emits a fresh `{ scope: "global" }` active entry while `collectTombstones` also preserves the `{ scope: "global", excluded: true }` tombstone — a same-scope active + tombstone pair. `config-merger.ts`'s compound key (`${id}:${scope}${excluded ? ":excluded" : ""}`) keys them distinctly, so both survive to `config.ts`. Tracked in `.ai-docs/agent-findings/2026-07-17-d227-same-scope-active-tombstone-duplicate.md`.

**Scope of installed-config lookups:** `wasInstalledGlobally` reads `installedSkillConfigs`/`installedAgentConfigs` (the persisted prior state), NOT `skillConfigs`/`agentConfigs` (the current wizard state). Tombstone presence in `skillConfigs` is checked separately.

## UI Scope Indicators

### Dual-Scope Badges (D-183)

Both the build step (CategoryGrid) and agent step (StepAgents) show dual-scope badges when a scope toggle creates a tombstone:

- **CategoryGrid** (`category-grid.tsx`): `CategoryOption.secondaryScope` renders a second `[G]`/`[P]` badge next to the primary scope badge.
- **StepAgents** (`step-agents.tsx`): Derives the primary + secondary badges via `deriveScopeBadges(agentConfig, excludedConfig)` and `formatScopeTag()` from `src/cli/lib/wizard/scope-diff.ts` — a tombstone at the OTHER scope renders as a secondary `[G]`/`[P]` badge.

### Lock Icon for Read-Only Skills (D-189)

The lock icon lives in the **Sources step**, not the build step. `source-grid.tsx` prefixes `UI_SYMBOLS.LOCK` on any `SourceRow` whose `readOnly` flag is set. `buildSourceRows()` in `wizard-store.ts` sets `readOnly: true` on a globally-installed skill's source row when editing from project scope (`!isEditingFromGlobalScope && installedGlobalConfig`) and on excluded-global tombstone rows. The build-step `SkillTag` (`category-grid.tsx`) no longer renders a lock — it shows scope badges (`G`/`P`) only.

### Scope Labels in Change Summary

`logChangeSummary()` in `edit.tsx` uses `[G]`/`[P]` scope labels. Global-to-project scope changes render as green `+` additions.

### SkillAgentSummary Scope Display

`skill-agent-summary.tsx` renders `ScopeLabel` components (white-on-LABEL_BG badges showing "Project" or "Global") next to each skill and agent in the confirm step and info panel.

## Global Visibility From Project Scope

When editing from project scope, globally-installed skills/agents appear in the wizard as pre-selected and read-only:

- They are loaded into `installedSkillConfigs`/`installedAgentConfigs` during hydration (from `projectConfig?.skills`/`projectConfig?.agents`, which includes inlined globals when the project config is generated with `generateProjectConfigWithInlinedGlobal()`).
- Project-scope edits cannot modify them — guard checks route all mutations through `toggleTechnology` / `toggleAgent` / `toggleSkillScope` / `toggleAgentScope`, which either toast or no-op when `isEditingFromGlobalScope === false` and `isInitMode === false`.
- The `readOnly` flag on `SourceRow` (rendered with `UI_SYMBOLS.LOCK` in `source-grid.tsx`) visually marks the read-only state on the Sources step.

Global skills are merged with project-local skills during source loading — see `source-loader.ts` and `compile.ts` for the merge pattern.

## Installation Scope Splitting

During installation, skills and agents are split by scope before path-dependent operations:

1. `splitConfigByScope()` partitions the merged config
2. `writeScopedConfigs()` writes global and project configs separately
3. Plugin install/uninstall operations split by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`)
4. Local skill copy operations split by scope via `resolveInstallPaths()`
