---
scope: reference
area: commands
keywords:
  [
    init,
    edit,
    compile,
    config,
    new-agent,
    build,
    eject,
    import,
    list,
    search,
    validate,
    uninstall,
    info,
  ]
related:
  - reference/architecture-overview.md
  - reference/features/wizard-flow.md
  - reference/features/operations-layer.md
  - reference/features/compilation-pipeline.md
  - reference/commands/edit.md
last_validated: 2026-04-21
---

# Commands Reference

**Last Updated:** 2026-04-21

## Command Architecture

All commands extend `BaseCommand` (`src/cli/base-command.ts`).

**Base flags available to all commands:**

| Flag     | Short | Type   | Description               |
| -------- | ----- | ------ | ------------------------- |
| --source | -s    | string | Skills source path or URL |

**Operations layer:** Commands use composable operations from `src/cli/lib/operations/index.ts` as the primary interface to lower-level lib functions. Commands should not bypass operations for functionality that an operation covers. See `reference/features/operations-layer.md` for full operations documentation.

## Commands Index

| Command             | File                                    | Type | Summary                                                               |
| ------------------- | --------------------------------------- | ---- | --------------------------------------------------------------------- |
| `init`              | `src/cli/commands/init.tsx`             | tsx  | Initialize project (interactive wizard/dashboard)                     |
| `edit`              | `src/cli/commands/edit.tsx`             | tsx  | Edit skills in the plugin                                             |
| `compile`           | `src/cli/commands/compile.ts`           | ts   | Compile agents from skills (global + project pass)                    |
| `validate`          | `src/cli/commands/validate.ts`          | ts   | Validate schemas, plugins, or skills source                           |
| `list`              | `src/cli/commands/list.tsx`             | tsx  | Show installation information (alias: `ls`)                           |
| `doctor`            | `src/cli/commands/doctor.ts`            | ts   | Diagnose configuration issues                                         |
| `eject`             | `src/cli/commands/eject.ts`             | ts   | Eject skills, agent partials, or templates                            |
| `search`            | `src/cli/commands/search.ts`            | ts   | Search the catalog of available skills (read-only)                    |
| `uninstall`         | `src/cli/commands/uninstall.tsx`        | tsx  | Uninstall from project                                                |
| `update`            | `src/cli/commands/update.tsx`           | tsx  | Update local skills from source                                       |
| `import skill`      | `src/cli/commands/import/skill.ts`      | ts   | Import a skill from third-party GitHub repo                           |
| `new skill`         | `src/cli/commands/new/skill.ts`         | ts   | (FEATURE-GATED: `NEW_SKILL_COMMAND=false`) scaffold a local skill     |
| `new agent`         | `src/cli/commands/new/agent.tsx`        | tsx  | (FEATURE-GATED: `NEW_AGENT_COMMAND=false`) AI-generate an agent       |
| `new marketplace`   | `src/cli/commands/new/marketplace.ts`   | ts   | (FEATURE-GATED: `NEW_MARKETPLACE_COMMAND=false`) scaffold marketplace |
| `build marketplace` | `src/cli/commands/build/marketplace.ts` | ts   | Generate marketplace.json from built plugins                          |
| `build plugins`     | `src/cli/commands/build/plugins.ts`     | ts   | Build skill/agent plugins                                             |

## Primary Commands (Detailed)

### `init` (src/cli/commands/init.tsx)

**Purpose:** Interactive wizard to set up skills and agents in a project. When run in an already-initialized project, shows a dashboard with quick actions (Edit, Compile, Doctor, List).

**Flags:**

| Flag      | Type    | Description               |
| --------- | ------- | ------------------------- |
| --refresh | boolean | Force refresh from remote |
| --source  | string  | Skills source path or URL |

**Flow:**

1. Detect if already initialized (`detectProjectInstallation()` from `installation/index.ts`)
2. If initialized: `showDashboard()` renders Dashboard component with quick actions (Edit/Compile/Doctor/List). In non-interactive (no TTY): prints `formatDashboardText()` and returns null.
3. If not initialized: `ensureBlankGlobalConfig()` creates global config if running from project dir (not home dir)
4. **Operation: `loadSource()`** -- load skills matrix with optional startup message capture
5. Render `<Wizard>` component, await `waitUntilExit()`
6. On wizard result: `deriveInstallMode()` determines eject/plugin/mixed install mode
7. If eject/mixed: **Operation: `copyLocalSkills()`** -- copy eject-source skills split by scope
8. If plugin/mixed: **Operation: `ensureMarketplace()`** -- register marketplace, then **Operation: `installPluginSkills()`** -- install each plugin by scope. Falls back to eject if marketplace unavailable.
9. **Operation: `writeProjectConfig()`** -- generate and write `.claude-src/config.ts`
10. **Operation: `loadAgentDefs()`** -- load agent definitions
11. **Operation: `discoverInstalledSkills()`** -- find all installed skills
12. **Operation: `compileAgents()`** -- compile agents to `.claude/agents/`
13. `checkPermissions()` -- render permission warning if needed

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `loadSource`, `ensureMarketplace`, `installPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/lib/installation/index.ts` -- `detectProjectInstallation`, `deriveInstallMode`, `resolveInstallPaths`, `buildAgentScopeMap`
- `src/cli/lib/configuration/config-writer.ts` -- `ensureBlankGlobalConfig`
- `src/cli/lib/permission-checker.tsx` -- `checkPermissions`
- `src/cli/components/wizard/wizard.tsx` -- Wizard component
- `src/cli/components/common/select-list.tsx` -- SelectList for dashboard

**Exported utilities:**

- `formatDashboardText(data: DashboardData): string`
- `showDashboard(projectDir, log?): Promise<string | null>`
- `getDashboardData(projectDir): Promise<DashboardData>`

### `edit` (src/cli/commands/edit.tsx)

**Purpose:** Modify installed skills via wizard re-entry with diff-based change detection. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, sources, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

**Flags:**

| Flag      | Type    | Description                       |
| --------- | ------- | --------------------------------- |
| --refresh | boolean | Force refresh from remote sources |
| --source  | string  | Skills source path or URL         |

**Flow:**

1. **Operation: `detectProject()`** -- detect installation + load project config
2. **Operation: `loadSource()`** -- load matrix with startup messages
3. Discover current installed skills: `discoverAllPluginSkills()` + merge with config skills
4. Render `<Wizard>` with `initialStep="build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`, `initialDomains`, `initialAgents`, `startupMessages`
5. `detectConfigChanges()` -- compute added/removed skills, added/removed agents, source changes, scope changes, agent scope changes. Returns `ConfigChanges` type.
6. `logChangeSummary(changes, newSkills, oldSkills)` -- renders styled diff using display names from matrix, scope labels `[G]`/`[P]`, and green `+` for G-to-P scope migrations
7. `detectMigrations()` + `executeMigration()` -- handle eject-to-plugin and plugin-to-eject mode migrations
8. `applyScopeChanges()` -- `migrateLocalSkillScope()` for local skills, `migratePluginSkillScopes()` for plugin skills (uninstall old scope + install new scope)
9. `applySourceChanges()` -- delete old local copies for non-migration source changes
10. `applyPluginChanges()` -- **Operation: `ensureMarketplace()`**, **Operation: `installPluginSkills()`** for added plugins, **Operation: `uninstallPluginSkills()`** for removed
11. **Operation: `copyLocalSkills()`** for newly added local-source skills
12. **Operation: `loadAgentDefs()`**, **Operation: `writeProjectConfig()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgents()`**
13. `cleanupStaleAgentFiles()` -- remove old agent .md files after scope changes

**Exported utilities (`@internal`, for testing):**

- `ConfigChanges` type -- shape of the diff between old and new config (added/removed skills, agents, source changes, scope changes, agent scope changes)
- `detectConfigChanges(oldConfig, wizardResult)` -- computes `ConfigChanges` from old `ProjectConfig` and new `WizardResultV2`
- `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` -- migrates plugin skill scope registrations (uninstall old scope, install new scope). Returns `PluginScopeMigrationResult`.
- `PluginScopeMigrationResult` type -- `{ migrated: SkillId[]; failed: Array<{ id: SkillId; error: string }> }`

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `ensureMarketplace`, `installPluginSkills`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `deriveInstallMode`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`

### `compile` (src/cli/commands/compile.ts)

**Purpose:** Compile agents using installed skills and agent definitions. Runs dual-pass for global and project installations.

**Flags:**

| Flag           | Type    | Description               |
| -------------- | ------- | ------------------------- |
| --verbose (-v) | boolean | Enable verbose logging    |
| --source       | string  | Skills source path or URL |

**Flow:**

1. **Operation: `detectBothInstallations(cwd)`** -- returns `{ global, project, hasBoth }`
2. Error if neither installation found
3. `resolveSource()` from configuration -- resolve and log source
4. **Operation: `loadAgentDefs({ projectDir })`** -- load agent definitions
5. `buildCompilePasses()` -- build compile pass list: global pass (if exists) + project pass (if exists). When both exist, each pass gets a `scopeFilter` to prevent cross-scope overwrites.
6. For each pass:
   a. **Operation: `discoverInstalledSkills(projectDir)`** -- discover all skills
   b. **Operation: `compileAgents({ projectDir, sourcePath, skills, pluginDir, outputDir, scopeFilter })`** -- compile agents with optional scope filter

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`
- `src/cli/lib/configuration/index.ts` -- `resolveSource`

### `validate` (src/cli/commands/validate.ts)

**Purpose:** Validate every registered source, installed plugin, installed skill, and installed agent. Read-only validation that walks every registered source, every installed plugin, every installed skill, and every installed agent. Prints a summary table with per-directory counts; exits non-zero if any pass produced an error.

**Args:** None. No `static args` declared.

**Flags:** None. `static flags = {}` and `static baseFlags = {}` -- validate overrides the base `--source` flag (validate is a zero-flag command that walks every registered source automatically).

**Key dependencies:** `resolveAllSources()`, `isLocalSource()` from configuration. `validateSource()` from source-validator. `validateAllPlugins()`, `printPluginValidationResult()`, `validateSkillFrontmatter()`, `validateAgentFrontmatter()`, `getUserPluginsDir()`, `getProjectPluginsDir()` from plugins. `resolveInstallPaths()` from installation. `metadataValidationSchema`, `customMetadataValidationSchema`, `isCustomMetadata()` from schemas. `formatZodErrors()` from schema-validator.

### `list` (src/cli/commands/list.tsx)

**Purpose:** Show installation information (skills, agents, mode, source). Alias: `ls`. Ink-based React component for TTY, plain text fallback for non-TTY.

**Flags:** `--source` (inherited)

**Flow:**

1. `detectInstallation()` from `installation/installation.ts` -- find installation
2. If no installation: print "No installation found" message and return
3. `loadProjectConfig(projectDir)` from `configuration/project-config.ts` -- load project config
4. If no config or non-TTY: fallback to `getInstallationInfo()` + `formatInstallationDisplay()` (plain text) from `plugins/index.ts`
5. If TTY with config: `render(<ListView>)` -- Ink component showing mode, source, and `<SkillAgentSummary>` component. Uses `useApp().exit()` via `setTimeout` to auto-exit after render.

**Key dependencies:**

- `src/cli/lib/installation/installation.ts` -- `detectInstallation()`
- `src/cli/lib/configuration/project-config.ts` -- `loadProjectConfig()`
- `src/cli/lib/plugins/index.ts` -- `getInstallationInfo()`, `formatInstallationDisplay()` (non-TTY fallback)
- `src/cli/components/wizard/skill-agent-summary.tsx` -- `SkillAgentSummary` component (TTY mode)
- `src/cli/types/config.ts` -- `SkillConfig`, `AgentScopeConfig` types

### `doctor` (src/cli/commands/doctor.ts)

**Purpose:** Diagnose common configuration issues (config validity, skills resolved, agents compiled, orphan detection, source reachable).

**Flags:** None. `static flags = {}` and `static baseFlags = {}` -- doctor overrides the base `--source` flag because diagnostics always run against the current project.

**Behavior:** Calls `setVerbose(true)` unconditionally, so output is always verbose.

**Checks run:** Config Valid, Skills Resolved, Agents Compiled, No Orphans, Source Reachable.

**Key dependencies:** **Operation: `detectProject()`**, **Operation: `loadSource()`**. Uses `validateProjectConfig()` from configuration, `discoverLocalSkills()` from skills, `getStackSkillIds()` from stacks.

### `eject` (src/cli/commands/eject.ts)

**Purpose:** Eject skills, agent partials, or templates for local customization.

**Args:**

| Arg  | Required | Description                                                   |
| ---- | -------- | ------------------------------------------------------------- |
| type | no       | What to eject: `agent-partials`, `templates`, `skills`, `all` |

**Flags:**

| Flag      | Short | Type    | Description                          |
| --------- | ----- | ------- | ------------------------------------ |
| --force   | -f    | boolean | Overwrite existing files             |
| --output  | -o    | string  | Output directory (default: .claude/) |
| --refresh |       | boolean | Force refresh from remote source     |
| --source  | -s    | string  | Skills source path or URL            |

**Key dependencies:** **Operation: `loadSource()`**. Uses `saveSourceToProjectConfig()`, `resolveSource()`, `loadProjectSourceConfig()` from configuration. `copySkillsToLocalFlattened()` from skills.

### `search` (src/cli/commands/search.ts)

**Purpose:** Read-only catalog browse. Searches every registered source (primary + extras) by id, displayName, slug, description, or category. Prints a table via `@oclif/table`. Use `import skill` to install a found skill.

**Args:**

| Arg   | Required | Description                                                         |
| ----- | -------- | ------------------------------------------------------------------- |
| query | yes      | Search query (matches id, displayName, slug, description, category) |

**Flags:** None. `static flags = {}` and `static baseFlags = {}` -- search overrides the base `--source` flag (search is a zero-flag command that hits all registered sources).

**Key dependencies:** **Operation: `loadSource()`**. Uses `resolveAllSources()` from configuration, `fetchFromSource()`, `parseFrontmatter()` from loading, `printTable()` from `@oclif/table`.

### `uninstall` (src/cli/commands/uninstall.tsx)

**Purpose:** Remove CLI-managed skills, compiled agents, and plugins from project. Preserves user-created content.

**Flags:**

| Flag     | Short | Type    | Description                         |
| -------- | ----- | ------- | ----------------------------------- |
| --yes    | -y    | boolean | Skip confirmation prompt            |
| --all    |       | boolean | Also remove .claude-src/ config dir |
| --source | -s    | string  | Skills source path or URL           |

**Key dependencies:** `listPluginNames()`, `getProjectPluginsDir()` from plugins. `readForkedFromMetadata()` from skills. `loadProjectConfigFromDir()` from configuration. `claudePluginUninstall()`, `isClaudeCLIAvailable()` from exec.

### `update` (src/cli/commands/update.tsx)

**Purpose:** Update local skills from source. Compare, confirm, copy, recompile.

**Args:**

| Arg   | Required | Description                         |
| ----- | -------- | ----------------------------------- |
| skill | no       | Specific skill to update (optional) |

**Flags:**

| Flag           | Short | Type    | Description                           |
| -------------- | ----- | ------- | ------------------------------------- |
| --yes          | -y    | boolean | Skip confirmation prompt              |
| --no-recompile |       | boolean | Skip agent recompilation after update |
| --source       | -s    | string  | Skills source path or URL             |

**Key dependencies:** **Operation: `loadSource()`**, **Operation: `compareSkillsWithSource()`**, **Operation: `collectScopedSkillDirs()`**, **Operation: `findSkillMatch()`**, **Operation: `compileAgents()`**, **Operation: `discoverInstalledSkills()`**. Uses `injectForkedFromMetadata()` from skills.

### `import skill` (src/cli/commands/import/skill.ts)

**Purpose:** Import skills from third-party GitHub repositories into local `.claude/skills/`.

**Args:**

| Arg    | Required | Description                                        |
| ------ | -------- | -------------------------------------------------- |
| source | yes      | GitHub repository source (github:owner/repo, etc.) |

**Flags:**

| Flag      | Short | Type    | Description                                        |
| --------- | ----- | ------- | -------------------------------------------------- |
| --skill   | -n    | string  | Name of the specific skill to import               |
| --all     | -a    | boolean | Import all skills from the repository              |
| --list    | -l    | boolean | List available skills without importing            |
| --subdir  |       | string  | Subdirectory containing skills (default: `skills`) |
| --force   | -f    | boolean | Overwrite existing skills                          |
| --refresh |       | boolean | Force refresh from remote (ignore cache)           |
| --source  | -s    | string  | Skills source path or URL                          |

**Key dependencies:** `fetchFromSource()` from loading. `importedSkillMetadataSchema` from schemas. `computeFileHash()`, `getCurrentDate()` from versioning.

### `new skill` (src/cli/commands/new/skill.ts)

**Feature flag:** `FEATURE_FLAGS.NEW_SKILL_COMMAND` (currently `false`). Command exits with an error if the flag is disabled. See `src/cli/lib/feature-flags.ts`.

**Purpose:** Create a new local skill scaffold with SKILL.md and metadata.yaml.

**Args:**

| Arg  | Required | Description                    |
| ---- | -------- | ------------------------------ |
| name | yes      | Name of the skill (kebab-case) |

**Flags:**

| Flag       | Short | Type    | Description                                        |
| ---------- | ----- | ------- | -------------------------------------------------- |
| --author   | -a    | string  | Author identifier (e.g., @myhandle)                |
| --category | -c    | string  | Skill category (default: from LOCAL_DEFAULTS)      |
| --domain   | -d    | string  | Domain (e.g., web, api, cli)                       |
| --force    | -f    | boolean | Overwrite existing skill directory                 |
| --output   | -o    | string  | Output directory (overrides marketplace detection) |
| --source   | -s    | string  | Skills source path or URL                          |

**Key dependencies:** `resolveAuthor()` from configuration. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer. `detectInstallation()` from installation. `generateSkillCategoriesTs()`, `generateSkillRulesTs()` from skills/generators.

### `new agent` (src/cli/commands/new/agent.tsx)

**Feature flag:** `FEATURE_FLAGS.NEW_AGENT_COMMAND` (currently `false`). Command exits with an error if the flag is disabled.

**Purpose:** Create a new custom agent using AI generation via the agent-summoner meta-agent.

**Args:**

| Arg  | Required | Description       |
| ---- | -------- | ----------------- |
| name | yes      | Name of the agent |

**Flags:**

| Flag              | Short | Type    | Description                      |
| ----------------- | ----- | ------- | -------------------------------- |
| --purpose         | -p    | string  | Purpose/description of the agent |
| --non-interactive | -n    | boolean | Run in non-interactive mode      |
| --refresh         | -r    | boolean | Force refresh remote source      |
| --source          | -s    | string  | Skills source path or URL        |

**Key dependencies:** `resolveSource()` from configuration. `getAgentDefinitions()` from agents. `isClaudeCLIAvailable()` from exec. Spawns `claude` CLI process. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer.

### `new marketplace` (src/cli/commands/new/marketplace.ts)

**Feature flag:** `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` (currently `false`). Command exits with an error if the flag is disabled.

**Purpose:** Scaffold a new private marketplace directory with skills, stacks, categories, rules, and config.

**Args:**

| Arg  | Required | Description                                           |
| ---- | -------- | ----------------------------------------------------- |
| name | yes      | Marketplace name (kebab-case), or "." for current dir |

**Flags:**

| Flag     | Short | Type    | Description                               |
| -------- | ----- | ------- | ----------------------------------------- |
| --force  | -f    | boolean | Overwrite existing directory              |
| --output | -o    | string  | Parent directory to create marketplace in |
| --source | -s    | string  | Skills source path or URL                 |

**Key dependencies:** `generateConfigSource()` from config-writer. `generateMarketplace()`, `writeMarketplace()` from marketplace-generator. `compileAllSkillPlugins()` from skill-plugin-compiler. `generateSkillCategoriesTs()`, `generateSkillRulesTs()` from skills/generators. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer.

## Build Subcommands

### `build marketplace` (src/cli/commands/build/marketplace.ts)

**Purpose:** Generate marketplace.json from built plugins for plugin distribution.

**Flags:**

| Flag          | Short | Type    | Description                                               |
| ------------- | ----- | ------- | ----------------------------------------------------------- |
| --plugins-dir | -p    | string  | Plugins directory (default: `dist/plugins`)              |
| --output      | -o    | string  | Output file (default: `.claude-plugin/marketplace.json`) |
| --name        |       | string  | Marketplace name override                                |
| --verbose     | -v    | boolean | Enable verbose logging                                   |
| --source      | -s    | string  | Skills source path or URL                                |

**Key dependencies:** `generateMarketplace()`, `writeMarketplace()`, `getMarketplaceStats()` from marketplace-generator.

### `build plugins` (src/cli/commands/build/plugins.ts)

**Purpose:** Build skills and agents into standalone plugins. Skills directory is read from the `DIRS.skills` constant; not configurable via flag.

**Flags:** `static baseFlags = {}` -- overrides the base `--source` flag (build plugins reads from local `DIRS.skills`, not a remote source).

| Flag         | Short | Type    | Description                                |
| ------------ | ----- | ------- | ------------------------------------------ |
| --agents-dir | -a    | string  | Agents source directory (optional)         |
| --output-dir | -o    | string  | Output directory (default: `dist/plugins`) |
| --skill      |       | string  | Path to skill directory                    |
| --verbose    | -v    | boolean | Enable verbose logging                     |

**Key dependencies:** `compileAllSkillPlugins()`, `compileSkillPlugin()` from skills. `compileAllAgentPlugins()` from agents.

> **`build stack` removed:** This command no longer exists. Only `build marketplace` and `build plugins` are in `src/cli/commands/build/`. Stack-to-plugin compilation now goes through the marketplace/plugins build pipeline.

## Feature-Gated Commands

The following commands are gated behind `FEATURE_FLAGS` in `src/cli/lib/feature-flags.ts`. All three are currently disabled (flag `false`). The command prints an error and exits if invoked.

| Command           | Flag                      | Current Value |
| ----------------- | ------------------------- | ------------- |
| `new skill`       | `NEW_SKILL_COMMAND`       | `false`       |
| `new agent`       | `NEW_AGENT_COMMAND`       | `false`       |
| `new marketplace` | `NEW_MARKETPLACE_COMMAND` | `false`       |

## Error Handling Pattern

All commands follow this pattern:

```typescript
try {
  // operation
} catch (error) {
  this.handleError(error); // from BaseCommand -> this.error(message, { exit: EXIT_CODES.ERROR })
}
```

For specific exit codes:

```typescript
this.error(message, { exit: EXIT_CODES.INVALID_ARGS });
```

Exit codes defined in `src/cli/lib/exit-codes.ts`:

- `SUCCESS: 0`
- `ERROR: 1`
- `INVALID_ARGS: 2`
- `NETWORK_ERROR: 3`
- `CANCELLED: 4`

## User-Facing Messages

All message constants centralized in `src/cli/utils/messages.ts`:

- `ERROR_MESSAGES` - Error strings (10 entries)
- `SUCCESS_MESSAGES` - Success strings (4 entries)
- `STATUS_MESSAGES` - Progress/status strings (11 entries)
- `INFO_MESSAGES` - Informational strings (6 entries)

## Operations Layer Usage by Command

| Command           | Operations Used                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`            | `loadSource`, `ensureMarketplace`, `installPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`, `loadAgentDefs`                                           |
| `edit`            | `detectProject`, `loadSource`, `ensureMarketplace`, `installPluginSkills`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgents`, `discoverInstalledSkills`, `loadAgentDefs` |
| `compile`         | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                   |
| `doctor`          | `detectProject`, `loadSource`                                                                                                                                                                            |
| `eject`           | `loadSource`                                                                                                                                                                                             |
| `search`          | `loadSource`                                                                                                                                                                                             |
| `update`          | `loadSource`, `compareSkillsWithSource`, `collectScopedSkillDirs`, `findSkillMatch`, `compileAgents`, `discoverInstalledSkills`                                                                          |
| `validate`        | (none -- uses lib functions directly)                                                                                                                                                                    |
| `list`            | (none -- uses installation, configuration, plugins directly)                                                                                                                                             |
| `uninstall`       | (none -- uses lib functions directly)                                                                                                                                                                    |
| `import skill`    | (none -- uses loading/fetching directly)                                                                                                                                                                 |
| `new skill`       | (none -- uses configuration/installation directly)                                                                                                                                                       |
| `new agent`       | (none -- uses agents/configuration directly)                                                                                                                                                             |
| `new marketplace` | (none -- uses generators directly)                                                                                                                                                                       |
| `build *`         | (none -- uses skill/agent compilers directly)                                                                                                                                                            |
