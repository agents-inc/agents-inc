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
10. `recordGlobalSourceMigrations(migratedSkillIds, filteredResult.skills, cwd)` -- in a project-context run, rewrites `source` on the active-global entries this run migrated (via `applyMigratedGlobalSources()`), writing the global config so it matches the filesystem/plugin registry. No-op at the home root.
11. `applyScopeChanges(changes, filteredResult, context, cwd)` -- `migrateLocalSkillScope()` for `source === "eject"` skills in `scopeChanges`; `requireMarketplaceOrExit()` then `migratePluginSkillScopes()` only when at least one non-eject skill has a scope change.
12. `applySourceChanges(changes, activeOldSkills, cwd, migratedSkillIds)` -- for non-migration `sourceChanges` entries where `from === "eject"`, calls `deleteLocalSkill()` on the old scope's directory resolved via `installBaseDir(cwd, oldSkill?.scope)`. Skips ids in `migratedSkillIds`.
13. `applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd)` -- **Operation: `installPluginSkills()`** for added non-eject skills and **Operation: `uninstallPluginSkills()`** for removed non-eject skills (marketplace resolved via `requireMarketplaceOrExit()`). **Hard-error interrupt**: if `installPluginSkills` returns any entries in `pluginResult.failed`, calls `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` BEFORE proceeding to `copyNewLocalSkills` and `writeConfigAndCompile`. See Invariants.
14. `copyNewLocalSkills(changes, filteredResult, context, cwd)` -- **Operation: `copyLocalSkills()`** for added `source === "eject"` skills.
15. `removeDeletedLocalSkills(changes, activeOldSkills, cwd)` -- for fully-deselected eject-mode skills, `deleteLocalSkill()` on the scope the skill was installed at (`installBaseDir(cwd, oldSkill.scope)`). No-op when the directory is absent (D-233).
16. `writeConfigAndCompile(result, context, flags, cwd)` -- **Operation: `loadAgentDefs()`** + **Operation: `writeProjectConfig()`** (with `authoritativeScope: isHomeDirectory(cwd) ? "all" : "owned"`) + **Operation: `discoverInstalledSkills()`** + **Operation: `compileAgentsAllScopes()`** (single home-root pass, or split global+project passes in a project context). Failures are logged via `this.warn()`; they do not abort the command. The `writeProjectConfig` result is captured as `configResult: ConfigWriteResult | undefined` -- `undefined` when the write threw (warned as `Could not update config: <reason>`).
17. `recompilePropagatedProjects(configResult.propagatedProjects)` -- called at the tail of `writeConfigAndCompile`, and only when `configResult` is defined. See Propagated-Project Recompile below.
18. `cleanupStaleAgentFiles(changes, activeOldAgents, cwd)` -- for `agentScopeChanges` entries where `change.from !== "global"` (P to G direction only) removes the stale project-scope `<name>.md`; for `removedAgents` removes the compiled `.md` from the scope the agent was installed at (D-233). G to P is treated as an override so the global copy is preserved.
19. `logCompletionSummary(changes)` -- prints `"\u2713 Done"` in success color.

### Propagated-Project Recompile (D-240)

`writeProjectConfig` returns `ConfigWriteResult`, whose `propagatedProjects: string[]` lists the **other** registered project directories whose `config.ts` this run's global change was fanned out into. Rewriting their config leaves their compiled agents stale, so:

```typescript
private async recompilePropagatedProjects(projectDirs: string[]): Promise<void>;
```

- Returns immediately (nothing logged) when `projectDirs` is empty.
- Otherwise calls **Operation: `recompilePropagatedProjectAgents(projectDirs)`** (`src/cli/lib/operations/project/recompile-project-agents.ts`), which runs `recompileRegisteredProjectAgents` per directory with **per-project failure isolation** and returns `{ recompiledCount, failedCount, warnings }`.
- Each warning is re-emitted via `this.warn()`. The summary line is `Recompiled agents in N registered project(s)` in `CLI_COLORS.NEUTRAL`, with a ` (N failed)` suffix in `CLI_COLORS.WARNING` when `failedCount > 0`.

`init` performs the same step after its own `writeProjectConfig` + compile; only the summary wording differs.

### Writer Selection Inside `writeProjectConfig`

`writeProjectConfig` (in `src/cli/lib/operations/project/write-project-config.ts`) delegates config persistence to `writeScopedConfigs` (in `src/cli/lib/installation/local-installer.ts`), which branches on whether `projectDir` resolves to the home directory:

- **Home context** (`realpath(projectDir) === realpath(os.homedir())`): writes `~/.claude-src/config.ts` via `writeConfigFile`, then `writeStandaloneConfigTypes` for `~/.claude-src/config-types.ts`. Propagates to all registered projects when `finalConfig.projects` is non-empty.
- **Project context**: splits `finalConfig` by scope. Global side uses `writeStandaloneConfigTypes` against the merged `effectiveGlobalConfig`. Project side calls `regenerateConfigTypes(projectDir, backgroundData, buildProjectTypesExtras(finalConfig, matrix))` so the project's `config-types.ts` imports `GlobalSkillId` / `GlobalAgentName` / `GlobalCategory` / `GlobalDomain` from the global types module and extends them with project-only additions. `regenerateConfigTypes` falls back to `writeStandaloneConfigTypes` when no global install is present.

`writeScopedConfigs` returns `{ propagatedProjects }`, which `writeProjectConfig` surfaces on `ConfigWriteResult` for step 17.

**Cross-scope reconciliation before the project write (D-279).** In the project-context branch, `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` runs **immediately before** `writeConfigFile` -- the raw split handed straight to the inlining writer would let a project-owned skill and a colliding live global install both land as active entries in the same project config. The same step also runs inside `propagateGlobalChangesToProjects`; both write sites can produce the malformed shape, so both must run it. Masking is project-local (a tombstone is never written into `~/.claude-src/config.ts`), covers identity collisions for skills and agents plus exclusive-category collisions for skills only, and self-heals derived masks whose collision has cleared before re-deriving. The project's own skill wins locally.

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

Rewrites `source` on exactly the active-global entries listed in `migratedSources`, returning every other entry identical by reference. `changed` is false when nothing needed rewriting, so the caller (`recordGlobalSourceMigrations`) can skip the global write entirely.

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

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `installPluginSkills`, `pluginInstallFailureError`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `ConfigWriteResult`, `compileAgentsAllScopes`, `recompilePropagatedProjectAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (marketplace resolution; no `ensureMarketplace` fallback)
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory`, `installBaseDir`, `resolveInstallPaths`, `writeConfigFile`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`
- `src/cli/components/wizard/run-wizard-session.tsx` -- `runWizardSession`
