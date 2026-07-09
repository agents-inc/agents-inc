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
last_validated: 2026-04-21
---

# Edit Command (Detailed)

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Extracted from:** `reference/commands/index.md` (edit section) and `reference/type-system.md` (edit command types). See [commands/index.md](./index.md) for the full commands reference.

## File: `src/cli/commands/edit.tsx`

**Purpose:** Modify installed skills via wizard re-entry with diff-based change detection. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, sources, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

## Flags

| Flag           | Type    | Description                                       |
| -------------- | ------- | ------------------------------------------------- |
| --refresh      | boolean | Force refresh from remote sources                 |
| --agent-source | string  | Remote agent partials source (default: local CLI) |
| --source       | string  | Skills source path or URL                         |

## Flow

The `run()` method in `edit.tsx` orchestrates private methods in this order:

1. `loadContext(flags)` -- **Operation: `detectProject()`** + **Operation: `loadSource()`** + `discoverAllPluginSkills()`. Merges plugin-discovered skill ids with project config skills (excluded entries filtered out), returns `EditContext`.
2. `runEditWizard(context, cwd)` -- hydrates wizard store (`initialStep: "build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`, `initialDomains`, `initialAgents`) and renders `<Wizard>`. Returns `WizardResultV2 | null`; `null` exits with `EXIT_CODES.CANCELLED`.
3. `reportValidationErrors(result)` -- emits `this.warn(...)` for each `result.validation.errors` entry.
4. Excluded-entry filter and `ProjectConfig` rewrite (in `run()`): builds `activeNewSkills`, `activeNewAgents`, `activeOldSkills`, `activeOldAgents`, constructs `filteredResult: WizardResultV2` and `filteredOldConfig: ProjectConfig | null`. All downstream methods see only non-excluded entries.
5. `detectConfigChanges(filteredOldConfig, filteredResult)` -- returns `ConfigChanges`.
6. **No-change exit** (in `run()`, guarded by `hasAnyChanges(changes)`): when no added/removed skills, agents, source changes, scope changes, or agent-scope changes exist, emits `"No changes made."` and returns before any migration/scope/plugin/config/compile work. This path skips `writeConfigAndCompile` entirely -- no config.ts or config-types.ts is written.
7. `logChangeSummary(changes, filteredResult.skills, filteredOldConfig?.skills ?? [])` -- styled diff using display names from matrix; `[G]`/`[P]` scope labels; global-to-project scope changes render with green `+` prefix (not `~`).
8. `applyMigrations(changes, filteredResult, activeOldSkills, context, cwd)` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches. Returns `Set<SkillId>` of migrated ids.
9. `applyScopeChanges(changes, filteredResult, context, cwd)` -- `migrateLocalSkillScope()` for `source === "eject"` skills in `scopeChanges`; `requireMarketplace()` then `migratePluginSkillScopes()` only when at least one non-eject skill has a scope change.
10. `applySourceChanges(changes, activeOldSkills, context, cwd, migratedSkillIds)` -- for non-migration `sourceChanges` entries where `from === "eject"`, calls `deleteLocalSkill()` on the old scope's directory (`os.homedir()` for global, `cwd` for project). Skips ids in `migratedSkillIds`.
11. `applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd)` -- **Operation: `installPluginSkills()`** for added non-eject skills and **Operation: `uninstallPluginSkills()`** for removed non-eject skills (marketplace lazily resolved via `requireMarketplace()`). **Hard-error interrupt**: if `installPluginSkills` returns any entries in `pluginResult.failed`, calls `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE proceeding to `copyNewLocalSkills` and `writeConfigAndCompile`. See Invariants.
12. `copyNewLocalSkills(changes, filteredResult, context, cwd)` -- **Operation: `copyLocalSkills()`** for added `source === "eject"` skills.
13. `writeConfigAndCompile(result, activeNewSkills, context, flags, cwd)` -- **Operation: `loadAgentDefs()`** + **Operation: `writeProjectConfig()`** + **Operation: `discoverInstalledSkills()`** + **Operation: `compileAgents()`**. In a project context (`realpath(cwd) !== realpath(os.homedir())`) runs `compileAgents` twice -- once with `scopeFilter: "global"` writing to `~/.claude/agents`, once with `scopeFilter: "project"` writing to `<cwd>/.claude/agents` -- and merges results. In home context runs once without `scopeFilter`. Failures are logged via `this.warn()`; they do not abort the command.
14. `cleanupStaleAgentFiles(changes, cwd)` -- removes `<cwd>/.claude/agents/<name>.md` for each `agentScopeChanges` entry where `change.from !== "global"` (P to G direction only). G to P is treated as an override so the global copy is preserved.
15. `logCompletionSummary(changes)` -- prints `"\u2713 Done"` in success color.

### Writer Selection Inside `writeProjectConfig`

`writeProjectConfig` (in `src/cli/lib/operations/project/write-project-config.ts`) delegates config persistence to `writeScopedConfigs` (in `src/cli/lib/installation/local-installer.ts`), which branches on whether `projectDir` resolves to the home directory:

- **Home context** (`realpath(projectDir) === realpath(os.homedir())`): writes `~/.claude-src/config.ts` via `writeConfigFile`, then `writeStandaloneConfigTypes` for `~/.claude-src/config-types.ts`. Propagates to all registered projects when `finalConfig.projects` is non-empty.
- **Project context**: splits `finalConfig` by scope. Global side uses `writeStandaloneConfigTypes` against the merged `effectiveGlobalConfig`. Project side calls `regenerateConfigTypes(projectDir, backgroundData, buildProjectTypesExtras(finalConfig, matrix))` so the project's `config-types.ts` imports `GlobalSkillId` / `GlobalAgentName` / `GlobalCategory` / `GlobalDomain` from the global types module and extends them with project-only additions. `regenerateConfigTypes` falls back to `writeStandaloneConfigTypes` when no global install is present.

See `reference/config/config-writer.md` for the full writer-selection matrix.

## Invariants

- **No orphan config entries on plugin failure.** `applyPluginChanges` hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` when `installPluginSkills` reports any failures. This fires before `copyNewLocalSkills` and `writeConfigAndCompile`, so `config.ts` is never written claiming a skill was installed that did not install. Error message instructs: verify skill id matches marketplace, re-run with `--refresh`, or switch affected skills to eject mode.
- **Plugin install intent is inviolable.** There is no silent fallback from plugin to eject. Marketplace resolution failure in `requireMarketplace()` also hard-errors.
- **No-change flows skip all writes.** When `hasAnyChanges(changes)` is false, `run()` returns after logging `"No changes made."` -- no config write, no recompile, no agent file cleanup. Consumers that depend on `config.ts` being regenerated on every edit invocation must trigger an actual change.
- **Excluded entries are filtered once.** The `activeNewSkills` / `activeOldSkills` split happens once in `run()`; every downstream private method receives only non-excluded entries. Excluded skills remain in the raw `result` / `projectConfig` for persistence by `writeProjectConfig` so tombstones survive.

## Exported Types and Functions

All marked `@internal` (exported for testing).

### ConfigChanges (in `edit.tsx`)

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

### detectConfigChanges (in `edit.tsx`)

```typescript
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
): ConfigChanges;
```

Compares old project config against wizard result. Uses `remeda.difference()` for added/removed and `remeda.indexBy()` for property change detection (source, scope, agent scope).

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
  scopeChanges: Map<SkillId, { from: "project" | "global"; to: "project" | "global" }>,
  skills: Array<{ id: SkillId; source: string }>,
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult>;
```

Handles plugin-mode skill scope migrations. Skips `source === "eject"` skills (handled separately by `migrateLocalSkillScope`). For project-to-global: uninstalls project-scope, installs global-scope. For global-to-project: adds project-scope registration (keeps global for other projects).

## Key Dependencies

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `ensureMarketplace`, `installPluginSkills`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `deriveInstallMode`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`
