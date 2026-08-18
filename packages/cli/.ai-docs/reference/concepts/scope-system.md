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
    writeScopedFromWizard,
    config-gate,
    splitConfigByScope,
    scope-predicates,
    isActiveAt,
    isProjectOwned,
    isGlobalTombstone,
    dual-scope,
    lock-icon,
    isEditingFromGlobalScope,
    isInitMode,
    isGlobalRoot,
    refuseProjectScopedContentAtHome,
    toggleSkillScope,
    toggleAgentScope,
    createDefaultSkillConfig,
    toClaudePluginScope,
    authoritativeScope,
    isWithinSessionAuthority,
    reconcileSharedConfig,
    skillsAuthoredHere,
    forkedFrom,
  ]
related:
  - reference/features/seed-contract.md
  - reference/commands/edit.md
  - reference/architecture/overview.md
  - reference/wizard/flow.md
  - reference/wizard/state-transitions.md
  - reference/config/configuration.md
  - reference/config/scope-split.md
  - reference/wizard/component-patterns.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/guard-pattern.md
  - reference/types/core-types.md
last_validated: 2026-07-30
---

# Scope System (Project vs Global)

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
  /** Where this skill came from: "eject" (the project's own copy) or a marketplace name. */
  origin: string;
  excluded?: boolean;
};
```

The field is `origin`. `edit`'s diff key for it is `ConfigChanges.sourceChanges`, and the wizard's
per-skill picker is the Sources step — the two names describe the same field from opposite ends and
neither is the type's.

**`AgentScopeConfig`** (`src/cli/types/config.ts`):

```typescript
type AgentScopeConfig = {
  name: AgentName;
  scope: SkillScope;
  model?: ModelName;
  effort?: EffortLevel;
  excluded?: boolean;
};
```

A shared seed payload carries **per-agent scope independently of skill scope**; `seedAgentScope` in `src/cli/lib/seed/seed-to-wizard.ts` resolves an absent scope to `DEFAULT_SELECTION_OPTIONS.scope` (`packages/matrix/src/read-model/selection-defaults.ts`), which is `"global"` — the shared spelling of what an untouched pick does, so a decode never disagrees with the app that built the payload. See [features/seed-contract.md](../features/seed-contract.md). The `model` / `effort` pair is documented in [features/model-and-effort.md](../features/model-and-effort.md).

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

| File                       | Predicates used                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `config-generator.ts`      | `isActiveAt` (drives the `splitConfigByScope` partition), `activeAgentScopeMap`, `effectivelyExcludedSkillIds`  |
| `local-installer.ts`       | `isActiveAt`, `activeSkillScopeMap`, `activeAgentScopeMap`, `effectivelyExcludedSkillIds` (prior-vs-next delta) |
| `config-gate/propagate.ts` | `isActiveAt`, `isGlobalTombstone`, `activeProjectAgentNames`, `ScopedEntry`                                     |
| `config-merger.ts`         | `isGlobalTombstone`, `isProjectOwned`, `ScopedEntry`                                                            |
| `config-types-writer.ts`   | `activeProjectAgentNames`                                                                                       |

Re-exported from `src/cli/lib/configuration/index.ts`.

## Config Splitting

**Function:** `splitConfigByScope()` in `src/cli/lib/configuration/config-generator.ts`

Splits a `ProjectConfig` into global and project partitions by skill/agent scope. Partitions each of `config.skills` and `config.agents` with `isActiveAt(entry, "global")` from [Scope Predicates](#scope-predicates): active-global entries form the global split, everything else (project-scoped entries and global tombstones) forms the project split. Returns `SplitConfigResult` (`{ global: ProjectConfig; project: ProjectConfig }`). Tombstones (`scope: "global", excluded: true`) route to the PROJECT split because they are project-level directives suppressing a shared global install.

> **Detailed partition rules, stack routing, and delta pipeline:** See [config/scope-split.md](../config/scope-split.md).

**Writer:** `writeScopedFromWizard()` in `src/cli/lib/config-gate/index.ts`

Writes:

1. Global config to `~/.claude-src/config.ts` (standalone) — merged into any existing global config via `mergeGlobalConfigs()`, then written only when `resolveEffectiveGlobalConfig()` reports a change
2. Project config to `{projectDir}/.claude-src/config.ts` (self-contained snapshot via `generateProjectConfigWithInlinedGlobal()` -- both global and project entries inlined, no import/spread). The split is passed through `reconcileProjectSplitAgainstGlobal()` **first** -- see [Cross-Scope Reconciliation](#cross-scope-reconciliation-before-project-writes) below.
3. Config-types files: the global config-types is standalone (emitted only by `config-gate/pair-writer.ts`); the project config-types is written via `regenerateConfigTypes`, whose global-aware branch imports `GlobalSkillId`/`GlobalAgentName` from the global types and extends them with every entry its own `config.ts` names — the inlined global rows included, so the pair stays valid when a later global-scope run narrows those unions (falls back to standalone when no global install exists)

When installing from the home directory (detected via `isHomeDirectory(projectDir)` in `src/cli/lib/installation/is-home-directory.ts`, which compares `fs.realpathSync` of the dir and `os.homedir()`), scope splitting is skipped: a single standalone global config pair is written via `writeGlobalPair` (both halves from one config, each skipped when unchanged), and changes propagate to all registered projects via `propagateGlobalChangesToProjects` — which also recompiles those projects' agents.

## Cross-Scope Reconciliation Before Project Writes

**Function:** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` in `src/cli/lib/config-gate/propagate.ts`.

Splitting by scope is **not sufficient** on its own. A project config is written as a self-contained snapshot with the global entries inlined, so if the project owns an entry that collides with a live global install, both land as **active** entries in the same file — two live skills in one exclusive category, which the wizard then shows as both selected and seeds into a fresh agent stack. `doctor` catches it in neither layer, because neither reads config semantics.

**Two project-config write paths exist, and this step now runs immediately before both:**

| Write path                                    | File                       | Trigger                                                 |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `propagateGlobalChangesToProjects`            | `config-gate/propagate.ts` | A global change fanning out to every registered project |
| The project branch of `writeScopedFromWizard` | `config-gate/index.ts`     | An ordinary project `init` / `edit`                     |

Either path alone can produce the malformed shape, so both must run the reconciliation — do not leave the project's own save path handing the raw split straight to the inlining writer.

**What it does** (details and the full predicate table in [tombstone-pattern.md](./tombstone-pattern.md)):

1. Self-heal first — `dropOrphanedDerivedMasks` (skills) and `dropOrphanedDerivedAgentMasks` (agents) drop a mask whose collision has cleared.
2. Then mask — `maskCollidingGlobalSkills` / `maskCollidingGlobalAgents` append `{ ...globalEntry, excluded: true }` for each live global entry that collides with the project's own state.

**Collision kinds:** identity (the project owns the same id/name active at project scope — skills _and_ agents), or a different active project skill in the same **matrix-declared exclusive** category (skills only; agents have no categories).

**Scope invariant:** reconciliation is applied to the **project split only**. `globalConfig` is a read-only input — masks never reach `~/.claude-src/config.ts`. This is the same invariant `splitConfigByScope` enforces for tombstones.

## Config Writer Scope Handling

`generateConfigSource()` in `src/cli/lib/configuration/config-writer.ts`:

- When `isProjectConfig: true` with `globalConfig` provided (the standard path used by `writeProjectConfigPair`): generates a self-contained config snapshot via `generateProjectConfigWithInlinedGlobal()`. Both global and project entries for the same skill ID are preserved (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`. Excluded global entries (tombstones) replace their active global counterparts.
- When `isProjectConfig: true` without `globalConfig` (fallback path): generates a config that imports from the global config and spreads global arrays into skills, agents, and domains.

## Wizard Scope Guards

### Global-Item Guard Pattern

Guards prevent project-scope edits from modifying globally-installed skills/agents.

**Guard check:** If a skill/agent is found in `installedSkillConfigs`/`installedAgentConfigs` with `scope === "global"` and `!excluded`, and the wizard is NOT in global-scope edit mode (`isEditingFromGlobalScope === false`), the action returns a toast message instead of modifying state.

`isEditingFromGlobalScope` is the **only** bypass. A globally-installed item is immutable from project scope in every flow, `init` included; `isInitMode` gates no scope guard.

**Key state fields:**

- `isEditingFromGlobalScope` (boolean) -- When true, `toggleSkillScope`/`toggleAgentScope` short-circuit to a no-op (not a toast). Set during wizard hydration.
- `isInitMode` (boolean, default `false`) -- Distinguishes init wizard from edit wizard. `hydrateWizardStore` dispatches to `hydrateForInit` (sets `isInitMode: true`) when no `initialStep` is passed, or `hydrateForEdit` (sets `isInitMode: false`) when one is. Init passes no `initialStep`; edit passes `"build"`. **It no longer gates any scope guard** — its remaining consumers are `computeScopeDiff` (suppresses removed-global rows during init) and `SkillAgentSummary`.

**How `isEditingFromGlobalScope` is computed:**

- Both `init.tsx` and `edit.tsx` now use the shared `isHomeDirectory(dir)` helper (`src/cli/lib/installation/is-home-directory.ts`), which compares `fs.realpathSync(dir)` against `fs.realpathSync(os.homedir())` (falling back to plain string equality when a path cannot be resolved). This resolves symlinks on both sides, so the earlier init-vs-edit asymmetry is gone.
  - `init.tsx`: `isEditingFromGlobalScope: isHomeDirectory(projectDir)`.
  - `edit.tsx`: `isEditingFromGlobalScope: isHomeDirectory(cwd)`.
- `GLOBAL_INSTALL_ROOT = os.homedir()` from `src/cli/consts.ts` is evaluated at import time; runtime callers use `os.homedir()` directly (or `isHomeDirectory`) so test home-dir mocks apply.

**Actions with guards:**

| Action               | Guard Behavior                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleTechnology()` | Toast if skill is installed globally (snapshot active global, OR a snapshot tombstone paired with a live active-global entry on the `isSelected` deselect path), unless editing from global scope. SPACE on a live `[P][G]` row is inert — dual-scope arm toasts and leaves badges unchanged. Also toasts if an exclusive swap would deselect a globally-installed skill or collapse a live `[P][G]` pair. |
| `toggleSkillScope()` | No-op if `isEditingFromGlobalScope`. Sole dual-scope toggle — `s` round-trips `[P][G]` → `[G]` → `[P][G]`. Toast if project eject to global and global eject already installed (no tombstone).                                                                                                                                                                                                             |
| `toggleAgent()`      | Toast if agent is installed globally (same snapshot/tombstone shape as `toggleTechnology`), unless editing from global scope. SPACE on a live `[P][G]` agent row is inert — dual-scope arm toasts, badges unchanged.                                                                                                                                                                                       |
| `toggleAgentScope()` | No-op if `isEditingFromGlobalScope`. Sole dual-scope toggle — `s` round-trips `[P][G]` → `[G]` → `[P][G]`.                                                                                                                                                                                                                                                                                                 |

> **Detailed documentation:** See [concepts/guard-pattern.md](./guard-pattern.md) for the full unified guard reference.

### Scope Toggle Eject Guard

`toggleSkillScope` in `wizard-store.ts` blocks project-eject to global-eject promotion when a non-excluded global eject entry already exists in `installedSkillConfigs` (`origin` compared against the `EJECT_SOURCE` constant). However, if the current `skillConfigs` already contains an excluded tombstone for that skill ID, the guard allows the toggle (undo path). Because a live `[P][G]` pair always carries the excluded global tombstone, a reopened dual-scope eject pair reaches this eject-collision check but is allowed via the undo path — `s` collapses it to `[G]`. No guard short-circuits ahead of this check. See [concepts/guard-pattern.md](./guard-pattern.md).

> **Detailed documentation:** See [concepts/tombstone-pattern.md](./tombstone-pattern.md) for full tombstone lifecycle.

## Scope Store Actions

| Action               | Signature                        | Effect                                                                                         |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `toggleSkillScope()` | `(skillId: SkillId) => void`     | Toggles `scope` between `"project"` and `"global"`. Tombstone management on scope transitions. |
| `toggleAgentScope()` | `(agentName: AgentName) => void` | Toggles `scope` between `"project"` and `"global"`. Tombstone management on scope transitions. |

**Tombstone management on scope toggle:**

- Moving global-installed skill/agent to project (G→P): adds excluded global entry (tombstone). Gated on `wasInstalledGlobally` (derived from `installedSkillConfigs`/`installedAgentConfigs`) so fresh init toggles don't create spurious tombstones. Since the hydration-snapshot fix, `wasInstalledGlobally` counts a **global tombstone** as "installed globally" (the `.some((sc) => sc.id === skillId && sc.scope === "global")` predicate has no `!excluded` filter) — a tombstone means the skill IS installed globally and this project overrides it. This lets an in-session collapse→`s` restore a genuine `[P][G]` pair. The skill and agent paths now match on this point.
- Moving back to global (P→G): unconditionally removes any excluded global tombstone for that id/name. The rationale is the invariant below — an active entry at global scope supersedes any tombstone at the same scope. Unconditional removal (not gated on `wasInstalledGlobally`) is load-bearing for the P→G undo path.

**Invariant:** no active entry and tombstone coexist at the same `(id, scope)` — an active entry at global scope always supersedes any tombstone at the same scope.

> **Known limitation(resolved by side effect):** preselection can still transiently violate this same-scope invariant. When the ONLY saved entry for a name/id is a global-scope excluded tombstone and preselection then re-includes it, `buildSkillConfigForId`/`buildAgentConfigForName` emits a fresh `{ scope: "global" }` active entry while the tombstone is also preserved — a same-scope active + tombstone pair. `config-merger.ts`'s compound key (`${id}:${scope}${excluded ? ":excluded" : ""}`) keys them distinctly, so both reach the writer. The generalised self-heal (`dropOrphanedDerivedMasks` / `dropOrphanedDerivedAgentMasks` in `config-gate/propagate.ts`) now collapses the pair on the next reconciled project write, because a same-scope active entry is not a _project_-scope collision. Tracked in `.ai-docs/agent-findings/2026-07-17-d227-same-scope-active-tombstone-duplicate.md`.

**Scope of installed-config lookups:** `wasInstalledGlobally` reads `installedSkillConfigs`/`installedAgentConfigs` (the persisted prior state), NOT `skillConfigs`/`agentConfigs` (the current wizard state). Tombstone presence in `skillConfigs` is checked separately.

## UI Scope Indicators

### Dual-Scope Badges

Both the build step (CategoryGrid) and agent step (StepAgents) show dual-scope badges when a scope toggle creates a tombstone:

- **CategoryGrid** (`category-grid.tsx`): `CategoryOption.secondaryScope` renders a second `[G]`/`[P]` badge next to the primary scope badge.
- **StepAgents** (`step-agents.tsx`): Derives the primary + secondary badges via `deriveScopeBadges(agentConfig, excludedConfig)` and `formatScopeTag()` from `src/cli/lib/wizard/scope-diff.ts` — a tombstone at the OTHER scope renders as a secondary `[G]`/`[P]` badge.

### Lock Icon for Read-Only Skills

The lock icon lives in the **Sources step**, not the build step. `source-grid.tsx` prefixes `UI_SYMBOLS.LOCK` on any `SourceRow` whose `readOnly` flag is set. `buildSourceRows()` in `wizard-store.ts` sets `readOnly: true` on a globally-installed skill's source row when editing from project scope (`!isEditingFromGlobalScope && installedGlobalConfig`) and on excluded-global tombstone rows. The build-step `SkillTag` (`category-grid.tsx`) no longer renders a lock — it shows scope badges (`G`/`P`) only.

### Scope Labels in Change Summary

`logChangeSummary()` in `edit.tsx` uses `[G]`/`[P]` scope labels. Global-to-project scope changes render as green `+` additions.

### SkillAgentSummary Scope Display

`skill-agent-summary.tsx` renders `ScopeLabel` components (white-on-LABEL_BG badges showing "Project" or "Global") next to each skill and agent in the confirm step and info panel.

## Global Immutability From Project Scope

**Rule:** a globally installed skill or agent cannot be deselected from a project in **any** flow, `init` included. A global install belongs to the global config, which every project shares, so no project may remove it. `isEditingFromGlobalScope === true` is the sole bypass.

### Two enforcement points, protecting different things

Conflating them is how a project-scope run deletes a global install while its config file still looks correct.

| Layer                | Where                                                                                                                                         | What it protects                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The **writer**       | `authoritativeScope: "owned"` -> `isWithinSessionAuthority(entry, scope)` -> `isProjectOwned` in `src/cli/lib/configuration/config-merger.ts` | The config ROW. An inherited global-active entry absent from the config being written is preserved rather than dropped |
| The **removal diff** | `ConfigChanges.removedSkills` / `removedAgents`, built by `detectConfigChanges` in `src/cli/commands/edit.tsx`                                | Nothing — it is what DRIVES `uninstallPluginSkills`, `deleteLocalSkill` and `removeCompiledAgents`                     |

**The merger's authority does not reach the disk.** An entry left in the removal set is uninstalled from the plugin registry and deleted from `~/.claude/skills/` or `~/.claude/agents/` whatever the merger later does with its row.

Every keystroke-driven caller reaches the writer through the wizard store, and the store refuses to deselect a live global entry at all — so a wizard-produced `removedSkills` / `removedAgents` never carries one, and on that path the store is the whole of the protection. **`edit --from <id>` bypasses the store**: a payload states a roster directly, and the apply is destructive. `reconcileSharedConfig` (`src/cli/lib/seed/seed-apply.ts`) therefore puts back what the run may not remove **into the result, before the diff is taken**, which is the only place the diff can see it. Two reasons, separately remedied and separately disclosed in the confirm:

| Reason           | Predicate                                                                  | Remedy the plan names               |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| Inherited global | `authority === "owned" && isActiveAt(entry, "global")`                     | `uninstall` from the home directory |
| Authored here    | `skillsAuthoredHere` — an ejected skill directory carrying no `forkedFrom` | `edit`                              |

At the home root `authority` is `"all"` and there is no inherited entry: a global-context run owns the whole config, so the scope half drops out while the authorship half still holds. See [`commands/edit.md`](../commands/edit.md).

### The removal paths from the wizard

Four paths reach a removal, and each is scoped to what the project owns:

| Path                                | Behaviour                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global-item guards                  | Carry no init-mode arm. `isInitMode` gates no scope guard at all.                                                                                 |
| Scope move to global, then deselect | `applySkillRemoval` is ownership-scoped; it never stamps `excluded`.                                                                              |
| Toggling an agent off               | `applyAgentToggle`'s deselect branch is a plain removal of what the project owns.                                                                 |
| Deselecting a domain                | A **view filter**: hides the domain's skills and drops only what the project owns; global entries survive untouched — neither dropped nor masked. |

**The store-level guarantee holds independently of whether a keypress path can reach it, and no keypress path can.** `Init.run` routes to the dashboard → `edit` whenever `detectInstallation` / `detectGlobalInstallation` finds an install, so `isInitMode === true` implies `installedSkillConfigs === null` — a real `cc init` never sees a global preselection. `toggleDomain` has exactly two callers, `domain-selection.tsx` (the DOMAINS step) and `stack-selection.tsx` (the init-only "start from scratch" branch), and `cc edit` hydrates with `initialStep: "build"` and `history: []`, so ESC cannot walk backwards into the DOMAINS step. The guarantee is pinned at unit level in `wizard-store.test.ts`, not by an E2E, precisely because it has no reachable UI surface. See `.ai-docs/agent-findings/2026-07-30-domain-deselect-has-no-reachable-ui-surface-in-edit.md`.

**Escape hatches for the user:** to keep a global skill out of a project, leave it out of that project's agent stacks (see `docs/guides/editing-config.md`). To uninstall it outright, edit at global scope — `npx agents-inc edit` from the home directory.

**Agent-roster rebuilds merge rather than replace.** `preselectAgentsFromDomains` retains all tombstones plus every non-project-owned entry outside the selected domains' roster, so a globally installed agent outside that roster is no longer silently uninstalled.

## Global Visibility From Project Scope

When editing from project scope, globally-installed skills/agents appear in the wizard as pre-selected and read-only:

- They are loaded into `installedSkillConfigs`/`installedAgentConfigs` during hydration (from `projectConfig?.skills`/`projectConfig?.agents`, which includes inlined globals when the project config is generated with `generateProjectConfigWithInlinedGlobal()`).
- Project-scope edits cannot modify them — guard checks route all mutations through `toggleTechnology` / `toggleAgent` / `toggleSkillScope` / `toggleAgentScope`, which either toast or no-op whenever `isEditingFromGlobalScope === false` (no init-mode exemption). `toggleDomain` carries no guard because it needs none — it drops only project-owned entries and leaves inherited global entries byte-identical.
- The `readOnly` flag on `SourceRow` (rendered with `UI_SYMBOLS.LOCK` in `source-grid.tsx`) visually marks the read-only state on the Sources step.

Global skills are merged with project-local skills during source loading — see `source-loader.ts` and `compile.ts` for the merge pattern.

## Installation Scope Splitting

During installation, skills and agents are split by scope before path-dependent operations:

1. `splitConfigByScope()` partitions the merged config
2. `writeScopedFromWizard()` writes global and project configs separately
3. Plugin install/uninstall operations split by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`)
4. Local skill copy operations split by scope via `resolveInstallPaths()`

## The Global Root Holds Only Global-Scoped Content

**Rule:** when the install root IS the home directory, nothing project-scoped may be written. The
split above has nothing to split there — `resolveInstallPaths` sends both scopes to the same
directory, and the config gate writes one config rather than two — so a `scope: "project"` entry
does not land somewhere else. It lands in the global config carrying a label that contradicts the
file it is in, and `toClaudePluginScope` maps that declared scope onward, registering the skill
against `$HOME` as a project. No layer below the install boundary reads the scope again.

**Every producer of an installation enforces this, at its own boundary:**

| Producer               | Enforcement point                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init` wizard          | `isHomeDirectory(projectDir)` becomes `isGlobalRoot` in `init.tsx` and hydrates the session as `isEditingFromGlobalScope`                                                  |
| `edit` wizard          | The same session flag, set from the directory `edit` runs in                                                                                                               |
| Wizard scope toggles   | `toggleSkillScope` / `toggleAgentScope` return `state` unchanged on the first line when `isEditingFromGlobalScope` is true                                                 |
| New wizard skill entry | `createDefaultSkillConfig` mints `scope: "global"`, so an untouched pick is already correct at the root                                                                    |
| `init --from <id>`     | `refuseProjectScopedContentAtHome(result, projectDir)`, inherited from `BaseCommand` — a hard refusal, `EXIT_CODES.ERROR`, after the decode and before anything is written |
| `edit --from <id>`     | The same inherited method, called with `cwd` at the same point of the same value — one implementation, so the destructive door refuses what the greenfield one refuses     |

**Both `--from` producers reach the rule through the one method, and that is why it lives on
`BaseCommand`.** It is a fact about the payload and the directory, identical whichever command
asked, and an invariant enforced on one producer and not the other is enforced nowhere — it matters
most on `edit --from`, which is destructive and can remove global entries on the way in. The other
thing `isHomeDirectory(cwd)` decides on that path is separate and stays separate: the
`authority: "all" | "owned"` word handed to `reconcileSharedConfig` (see
[Two enforcement points](#two-enforcement-points-protecting-different-things)) and to
`writeProjectConfig`, which is about what a run may REMOVE rather than about where it may write. The
wizard producer of `edit` is covered by the session flag as the table's second row says.

**`--from` refuses rather than coerces**, and it is the path where the difference is
visible: the wizard's toggles are a live UI that can simply decline to move, while a payload arrives
already stating a scope, and rewriting it to `global` would install content at a scope the sharer
did not choose. The refusal names every offending entry, **skills and sub-agents both** — a
sub-agent's scope is an independent decision in the payload, and `isScopePairCompatible` forbids a
project-scoped skill from reaching a global-scoped sub-agent, so a payload whose only project-scoped
entry is a bare sub-agent is a reachable shape that a skills-only check would let through.

This is not a greenfield check: a clean `$HOME` is refused on the same terms as an installed one,
because the subject is the location rather than what is already in it. Full refusal table, message
builder and specs: [`reference/features/seed-contract.md`](../features/seed-contract.md).
