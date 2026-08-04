---
scope: reference
area: commands
keywords:
  [
    edit,
    ConfigChanges,
    detectConfigChanges,
    migratePluginSkillScopes,
    change-summary,
    scope-migration,
  ]
related:
  - reference/commands/index.md
  - reference/types/operations-types.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/config/config-writer.md
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-07-30 · SYNC to product 0.145.0 + 0.146.0. -->

# Edit Command (Detailed)

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Extracted from:** `reference/commands/index.md` (edit section) and `reference/type-system.md` (edit command types). See [commands/index.md](./index.md) for the full commands reference.

## File: `src/cli/commands/edit.tsx`

**Purpose:** Modify installed skills via wizard re-entry with diff-based change detection. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, sources, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

## Flags

`static flags` extends `BaseCommand.baseFlags` (which supplies `--source`).

| Flag            | Type    | Hidden | Description                                                                                                                                                                                      |
| --------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| --source (-s)   | string  | no     | Skills source path or URL (from `baseFlags`)                                                                                                                                                     |
| --refresh       | boolean | no     | Force refresh from remote sources                                                                                                                                                                |
| --project-setup | boolean | yes    | Internal: this run continues an `init` project setup (materialise + register even on no-change). Key = `EDIT_PROJECT_SETUP_FLAG` (`"project-setup"`); set only by `init`'s dashboard delegation. |

There is no `--agent-source` flag.

## Flow

The `run()` method in `edit.tsx` orchestrates private methods in this order:

1. Render a loading `<Spinner>`, then `loadContext(flags)` -- **Operation: `detectProject()`** + **Operation: `loadSource()`** + `discoverAllPluginSkills()`. Merges plugin-discovered skill ids with project config skills (excluded entries filtered out), returns `EditContext`. Clears/unmounts the spinner.
2. `runEditWizard(context, cwd)` -- calls `runWizardSession()`, hydrating the wizard store (`initialStep: "build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope: isHomeDirectory(cwd)`, `initialDomains`, `initialAgents`). Returns `WizardResultV2 | null`; `null` exits with `EXIT_CODES.CANCELLED`.
3. `reportValidationErrors(result)` -- emits `this.warn(...)` for each `result.validation.errors` entry.
4. Excluded-entry filter (in `run()`): builds `activeNewSkills`, `activeNewAgents`, `activeOldSkills`, `activeOldAgents`, constructs `filteredResult: WizardResultV2` and `filteredOldConfig: ProjectConfig | null`. All downstream methods see only non-excluded entries; the raw `result` / `projectConfig` are retained for tombstone persistence.
5. `detectConfigChanges(filteredOldConfig, filteredResult, fullEntries)` -- returns `ConfigChanges`. The `fullEntries` third argument carries the unfiltered (tombstone-inclusive) lists used only to classify dual-scope transitions.
6. `isProjectSetup = flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`.
7. **No-change branch** (`!hasAnyChanges(changes)`): emits `"No changes made."`. If `isProjectSetup` is false, returns immediately -- no migration/scope/plugin/config/compile work, no config.ts or config-types.ts written. If `isProjectSetup` is true (an `init`-originated dashboard Edit in a project directory), it still runs `writeConfigAndCompile()` + `logCompletionSummary()` so the project is materialised and registered even with an empty roster delta. See Invariants.
8. `logChangeSummary(changes, filteredResult.skills, filteredOldConfig?.skills ?? [])` -- styled diff using display names from matrix; `[G]`/`[P]` scope labels; global-to-project scope changes render with green `+` prefix (not `~`); dual-scope `[P]` add/remove lines via `formatDualScopeTransition()`.
9. `applyMigrations(changes, filteredResult, activeOldSkills, context, cwd)` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches. Plugin-side migrations require the marketplace (`requireMarketplaceOrExit()`); a `failedPluginInstalls` result hard-errors via `pluginInstallFailureError`. Returns `Set<SkillId>` of migrated ids.
10. `recordGlobalSourceMigrations(migratedSkillIds, filteredResult.skills, cwd, context)` -- in a project-context run, rewrites `source` on the active-global entries this run migrated, via `config-gate::mutateGlobal({ kind: "migrate-skill-sources", sources })`, so the global config matches the filesystem/plugin registry. No-op at the home root (a global-context edit writes the whole global config from the wizard result anyway). **The gate propagates and recompiles from here** (see below); the result is rendered by `reportPropagatedRecompile(report)`. Wrapped in try/catch — a failure warns `Could not record global source change: <reason>` and the edit continues.
11. `applyScopeChanges(changes, filteredResult, context, cwd)` -- `migrateLocalSkillScope()` for `source === "eject"` skills in `scopeChanges`; `requireMarketplaceOrExit()` then `migratePluginSkillScopes()` only when at least one non-eject skill has a scope change.
12. `applySourceChanges(changes, activeOldSkills, cwd, migratedSkillIds)` -- for non-migration `sourceChanges` entries where `from === "eject"`, calls `deleteLocalSkill()` on the old scope's directory resolved via `installBaseDir(cwd, oldSkill?.scope)`. Skips ids in `migratedSkillIds`.
13. `applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd)` -- **Operation: `installPluginSkills()`** for added non-eject skills and **Operation: `uninstallPluginSkills()`** for removed non-eject skills (marketplace resolved via `requireMarketplaceOrExit()`). **Hard-error interrupt**: if `installPluginSkills` returns any entries in `pluginResult.failed`, calls `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` BEFORE proceeding to `copyNewLocalSkills` and `writeConfigAndCompile`. See Invariants.
14. `copyNewLocalSkills(changes, filteredResult, context, cwd)` -- **Operation: `copyLocalSkills()`** for added `source === "eject"` skills.
15. `removeDeletedLocalSkills(changes, activeOldSkills, cwd)` -- for fully-deselected eject-mode skills, `deleteLocalSkill()` on the scope the skill was installed at (`installBaseDir(cwd, oldSkill.scope)`). No-op when the directory is absent (D-233).
16. `writeConfigAndCompile(result, context, flags, cwd)` -- **Operation: `loadAgentDefs()`** + **Operation: `writeProjectConfig()`** (with `authoritativeScope: isHomeDirectory(cwd) ? "all" : "owned"`) + **Operation: `discoverInstalledSkills()`** + **Operation: `compileAgentsAllScopes()`** (single home-root pass, or split global+project passes in a project context). Failures are logged via `this.warn()`; they do not abort the command. The `writeProjectConfig` result is captured as `configResult: ConfigWriteResult | undefined` -- `undefined` when the write threw (warned as `Could not update config: <reason>`).
17. `reportPropagatedRecompile(configResult.propagation)` -- called at the tail of `writeConfigAndCompile`, and only when `configResult` is defined. It renders; the recompile it describes already ran. See Propagated-Project Recompile below.
18. `cleanupStaleAgentFiles(changes, activeOldAgents, cwd)` -- for `agentScopeChanges` entries where `change.from !== "global"` (P to G direction only) removes the stale project-scope `<name>.md`; for `removedAgents` removes the compiled `.md` from the scope the agent was installed at (D-233). G to P is treated as an override so the global copy is preserved.
19. `logCompletionSummary(changes)` -- prints `"\u2713 Done"` in success color.

### Propagated-Project Recompile (D-240)

`writeProjectConfig` returns `ConfigWriteResult`, whose `propagation: GateReport` describes what the config-gate did: `propagated.updated` lists the **other** registered project directories whose `config.ts` this run's global change was fanned out into, and `recompile` is the summary of the recompile the gate **already performed** in them. Rewriting a project's config leaves its compiled agents stale, so the gate recompiles them inside the write rather than returning a to-do list a caller can drop — which is exactly what step 10 used to do.

```typescript
private reportPropagatedRecompile(propagation: GateReport): void;
```

- Returns immediately (nothing logged) when `propagation.propagated.updated` is empty.
- Otherwise re-emits each `propagation.recompile.warnings` entry via `this.warn()`. Those warnings originate in **Operation: `recompilePropagatedProjectAgents(projectDirs)`** (`src/cli/lib/operations/project/recompile-project-agents.ts`), which the gate calls through `config-gate/recompile.ts` and which runs `recompileRegisteredProjectAgents` per directory with **per-project failure isolation**.
- The summary line is `Recompiled agents in N registered project(s)` in `CLI_COLORS.NEUTRAL`, with a ` (N failed)` suffix in `CLI_COLORS.WARNING` when `failedCount > 0`.
- It is called from **two** places: the tail of `writeConfigAndCompile` (step 17) and `recordGlobalSourceMigrations` (step 10), which fires a T1 change of its own.

`init` and `compile` perform the same rendering; only the wording differs — they print `registered projects`, this command prints `registered project(s)`. Both forms are asserted by `e2e/pages/constants.ts`, so do not unify them.

### Writer Selection Inside `writeProjectConfig`

`writeProjectConfig` (in `src/cli/lib/operations/project/write-project-config.ts`) delegates config persistence to `writeScopedFromWizard` (in `src/cli/lib/config-gate/index.ts`), which branches on whether `projectDir` resolves to the home directory:

- **Home context** (`realpath(projectDir) === realpath(os.homedir())`): classifies the change against the config already on disk, then writes both halves of `~/.claude-src/` from one config via `writeGlobalPair` (each half skipped when its bytes did not move). Propagates to all registered projects when `finalConfig.projects` is non-empty, and recompiles those projects' agents.
- **Project context**: splits `finalConfig` by scope. Global side writes the pair against the merged `effectiveGlobalConfig`. Project side calls `writeProjectConfigPair`, which emits `config.ts` and then `regenerateConfigTypes(projectDir, backgroundData, buildProjectTypesExtras(inlinedProjectView(reconciledSplit, effectiveGlobal), matrix))` so the project's `config-types.ts` imports `GlobalSkillId` / `GlobalAgentName` / `GlobalCategory` / `GlobalDomain` from the global types module and extends them with every active entry the sibling `config.ts` names — the inlined global-scoped rows included (D-282). `regenerateConfigTypes` falls back to the standalone form when no global install is present.

`writeScopedFromWizard` returns a `GateReport`, which `writeProjectConfig` surfaces as `ConfigWriteResult.propagation` for step 17.

**The fan-out trigger is classification, not a merge flag.** `classifyGlobalChange` diffs the config on disk against the one being written and assigns a tier: T1 (skills / agents / stack / domains / selectedAgents, including a per-skill `source` change) propagates the pair and recompiles; T2 (an inlined scalar only) propagates the config half without regenerating types or recompiling; T3 (`projects[]` only) does neither; T4 writes nothing. This is a strict superset of the old `globalDataChanged` gate, which was blind to a `source` change on an entry that already existed.

**Cross-scope reconciliation before the project write (D-279).** In the project branch, `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` runs **immediately before** `writeProjectConfigPair` -- the raw split handed straight to the inlining writer would let a project-owned skill and a colliding live global install both land as active entries in the same project config. The same step also runs inside `propagateGlobalChangesToProjects`; both write sites can produce the malformed shape, so both must run it. Masking is project-local (a tombstone is never written into `~/.claude-src/config.ts`), covers identity collisions for skills and agents plus exclusive-category collisions for skills only, and self-heals derived masks whose collision has cleared before re-deriving. The project's own skill wins locally.

See `reference/config/config-writer.md` for the full writer-selection matrix and `reference/concepts/tombstone-pattern.md` for mask provenance and lifetime.

## Invariants

- **No orphan config entries on plugin failure.** `applyPluginChanges` hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` when `installPluginSkills` reports any failures. This fires before `copyNewLocalSkills` and `writeConfigAndCompile`, so `config.ts` is never written claiming a skill was installed that did not install. Error message instructs: verify skill id matches marketplace, re-run with `--refresh`, or switch affected skills to eject mode.
- **Plugin install intent is inviolable.** There is no silent fallback from plugin to eject. Marketplace resolution failure in `requireMarketplaceOrExit()` (BaseCommand, wrapping the `requireMarketplace` operation) also hard-errors.
- **No-change flows skip all writes -- except an init-originated project setup.** When `hasAnyChanges(changes)` is false, `run()` logs `"No changes made."` and returns without config write, recompile, or agent cleanup -- UNLESS `isProjectSetup` (`flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`) is true, in which case it still runs `writeConfigAndCompile()` to materialise `<project>/.claude-src/config.ts` + `config-types.ts` and register the project in the global `projects[]`. This intent is passed explicitly by `init`'s dashboard delegation (`dashboardCommandArgv()` appends `--project-setup` only for an `init`-originated Edit); it is NOT re-derived from `cwd`/config state. A bare `cc edit` (and a bare-`cc` `"standalone"` dashboard Edit) carries no flag, so a no-change pass stays a read-only inspection. See `.ai-docs/agent-findings/2026-07-20-command-delegation-must-carry-caller-intent.md` and `2026-07-20-edit-hasanychanges-gate-blocks-project-materialisation.md`.
- **Excluded entries are filtered once.** The `activeNewSkills` / `activeOldSkills` split happens once in `run()`; every downstream private method receives only non-excluded entries. Excluded skills remain in the raw `result` / `projectConfig` for persistence by `writeProjectConfig` so tombstones survive.
- **Globally installed items are immutable from project scope (D-277).** A globally installed skill or agent cannot be deselected from a project in any flow, `init` included, so at project scope `changes.removedSkills` / `changes.removedAgents` never carry an active global entry and `removeDeletedLocalSkills` / `cleanupStaleAgentFiles` never delete global-scope artifacts on their behalf. `isEditingFromGlobalScope` is the only bypass; init mode is no longer one. Domain deselection is a **view filter** -- it hides a domain's skills and drops only what the project owns, leaving global entries neither dropped nor masked. Enforcement lives in the wizard store, not this command; see `reference/concepts/scope-system.md` and `reference/concepts/guard-pattern.md`.
- **Config write failure does not abort.** A throw from `writeProjectConfig` is caught and warned (`Could not update config: ...`), leaving `configResult` undefined; compilation still runs and the propagated-project recompile is skipped. This is deliberately weaker than the plugin-install contract above, which hard-errors.

## Exported Types and Functions

All marked `@internal` (exported for testing).

### ConfigChanges (in `edit.tsx`)

`ScopeChange` is `{ from: SkillScope; to: SkillScope }`.

```typescript
type ConfigChanges = {
  addedSkills: SkillId[];
  removedSkills: SkillId[];
  addedAgents: AgentName[];
  removedAgents: AgentName[];
  sourceChanges: Map<SkillId, { from: string; to: string }>;
  scopeChanges: Map<SkillId, ScopeChange>;
  agentScopeChanges: Map<AgentName, ScopeChange>;
  // Skill/agent ids whose scopeChanges entry is a dual-scope add/remove (the project half
  // of a [P][G] pair toggled while the global half persists) rather than a true migration.
  // Steers only the change-summary display, not the disk-side scope work.
  dualScopeSkillTransitions: Set<SkillId>;
  dualScopeAgentTransitions: Set<AgentName>;
};
```

### detectConfigChanges (in `edit.tsx`)

```typescript
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
  fullEntries?: FullScopeEntries,
): ConfigChanges;
```

`oldConfig` / `wizardResult` carry the ACTIVE (tombstone-filtered) entries used for add/remove/source/scope diffing. `fullEntries` (`{ newSkills, oldSkills, newAgents, oldAgents }`), when provided, carries the unfiltered lists (including excluded tombstones) used ONLY to tell a genuine scope migration apart from a dual-scope add/remove (`detectDualScopeTransitions()`). When omitted, every scope change is treated as a migration (pre-dual-scope behaviour). Uses `remeda.difference()` for added/removed and `remeda.indexBy()` for property change detection (source, scope, agent scope).

### applyMigratedGlobalSources (in `edit.tsx`)

```typescript
function applyMigratedGlobalSources(
  globalSkills: SkillConfig[],
  migratedSources: ReadonlyMap<SkillId, string>,
): { skills: SkillConfig[]; changed: boolean };
```

Rewrites `source` on exactly the active-global entries listed in `migratedSources`, returning every other entry identical by reference. `changed` is false when nothing needed rewriting, so the gate's `migrate-skill-sources` mutation reports a no-op and skips the global write entirely. It is exported from `config-gate/index.ts` as a pure function and is still imported directly by `edit.tsx` for the diff-summary path.

### PluginScopeMigrationResult (in `edit.tsx`)

```typescript
type PluginScopeMigrationResult = {
  migrated: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};
```

### migratePluginSkillScopes (in `edit.tsx`)

```typescript
async function migratePluginSkillScopes(
  scopeChanges: Map<SkillId, ScopeChange>,
  skills: Pick<SkillConfig, "id" | "source">[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult>;
```

Handles plugin-mode skill scope migrations. Skips `source === "eject"` skills (handled separately by `migrateLocalSkillScope`). For project-to-global: uninstalls project-scope, installs global-scope. For global-to-project: adds project-scope registration (keeps global for other projects).

## Key Dependencies

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `installPluginSkills`, `pluginInstallFailureError`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `ConfigWriteResult`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/lib/config-gate/index.ts` -- `applyMigratedGlobalSources`, `mutateGlobal`, `GateReport`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (marketplace resolution; no `ensureMarketplace` fallback)
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory`, `installBaseDir`, `resolveInstallPaths`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`
- `src/cli/components/wizard/run-wizard-session.tsx` -- `runWizardSession`
