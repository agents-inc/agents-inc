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
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.146.1 + 0.147.0 + 0.147.1)
     ✓ command-file inventory (source set == index-table set) and a full flag/arg/alias diff over
       every documented table; the `uninstall` and `validate` sections re-verified against source
     ✗ prose for init, edit, compile, list, doctor, eject, search, update, import/new/build — 2026-07-30
     ! GAP: prepublishOnly now runs lint before typecheck; this doc has no npm-scripts section to hold it
-->

# Commands Reference

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

## Command Architecture

All commands extend `BaseCommand` (`src/cli/base-command.ts`).

**Base flags available to all commands:**

| Flag     | Short | Type   | Description               |
| -------- | ----- | ------ | ------------------------- |
| --source | -s    | string | Skills source path or URL |

**Operations layer:** Commands use composable operations from `src/cli/lib/operations/index.ts` as the primary interface to lower-level lib functions. Commands should not bypass operations for functionality that an operation covers. See `reference/features/operations-layer.md` for full operations documentation.

## Init Hook (src/cli/hooks/init.ts)

The single oclif lifecycle hook, registered in `package.json` under `oclif.hooks.init` (`./dist/hooks/init`). It runs **before every command** and has two responsibilities:

1. **Bare-`cc` dashboard.** When invoked with no command (`options.id === undefined`) in an already-initialized project, it calls `runDashboardFlow(projectDir, options.config, "standalone")` (exported from `src/cli/commands/init.tsx`) with `DashboardOrigin` `"standalone"`. If a dashboard was shown, it calls `this.exit(EXIT_CODES.SUCCESS)` -- the bare invocation never falls through to a command. A `"standalone"` Edit selection carries no `--project-setup` flag (contrast the `init`-originated dashboard, whose Edit selection does).
2. **Source resolution.** `extractSourceFlag(options.argv)` reads the source flag from raw argv (oclif has not parsed flags yet at hook time), then `resolveSource(sourceFlag, projectDir)` assigns `sourceConfig` onto the oclif `Config` (a boundary cast to `ConfigWithSource`; read back via `BaseCommand.sourceConfig`). Wrapped in try/catch -- a config-resolution failure is swallowed so each command decides how to handle a missing `sourceConfig`.

**`extractSourceFlag` precedence:** `-s <value>` wins over `--source <value>`, which wins over `--source=<value>`.

**Key dependencies:**

- `src/cli/commands/init.tsx` -- `runDashboardFlow`
- `src/cli/lib/configuration/index.ts` -- `resolveSource`
- `src/cli/base-command.ts` -- `ConfigWithSource` (the `sourceConfig` boundary type)
- `src/cli/lib/exit-codes.ts` -- `EXIT_CODES`

## Commands Index

| Command             | File                                    | Type | Summary                                                                        |
| ------------------- | --------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| `init`              | `src/cli/commands/init.tsx`             | tsx  | Initialize project (interactive wizard/dashboard)                              |
| `edit`              | `src/cli/commands/edit.tsx`             | tsx  | Edit skills in the plugin                                                      |
| `compile`           | `src/cli/commands/compile.ts`           | ts   | Compile agents from skills + refresh `config-types.ts` (global + project pass) |
| `validate`          | `src/cli/commands/validate.ts`          | ts   | Validate every registered source, plugin, skill, and agent (read-only)         |
| `list`              | `src/cli/commands/list.tsx`             | tsx  | Show installation information (alias: `ls`)                                    |
| `doctor`            | `src/cli/commands/doctor.ts`            | ts   | Diagnose configuration issues                                                  |
| `eject`             | `src/cli/commands/eject.ts`             | ts   | Eject skills, agent partials, or templates                                     |
| `search`            | `src/cli/commands/search.ts`            | ts   | Search the catalog of available skills (read-only)                             |
| `uninstall`         | `src/cli/commands/uninstall.tsx`        | tsx  | Uninstall from project or global scope (always removes the config manifest)    |
| `update`            | `src/cli/commands/update.tsx`           | tsx  | Update local skills from source                                                |
| `import skill`      | `src/cli/commands/import/skill.ts`      | ts   | Import a skill from third-party GitHub repo                                    |
| `new skill`         | `src/cli/commands/new/skill.ts`         | ts   | (FEATURE-GATED: `NEW_SKILL_COMMAND=false`) scaffold a local skill              |
| `new agent`         | `src/cli/commands/new/agent.tsx`        | tsx  | (FEATURE-GATED: `NEW_AGENT_COMMAND=false`) AI-generate an agent                |
| `new marketplace`   | `src/cli/commands/new/marketplace.ts`   | ts   | (FEATURE-GATED: `NEW_MARKETPLACE_COMMAND=false`) scaffold marketplace          |
| `build marketplace` | `src/cli/commands/build/marketplace.ts` | ts   | Generate marketplace.json from built plugins                                   |
| `build plugins`     | `src/cli/commands/build/plugins.ts`     | ts   | Build skill/agent plugins                                                      |

## Primary Commands (Detailed)

### `init` (src/cli/commands/init.tsx)

**Purpose:** Interactive wizard to set up skills and agents in a project. When run in an already-initialized project, shows a dashboard with quick actions (Edit, Compile, Doctor, List).

**Flags:**

| Flag      | Type    | Description               |
| --------- | ------- | ------------------------- |
| --refresh | boolean | Force refresh from remote |
| --source  | string  | Skills source path or URL |

**Flow:**

1. `showDashboardIfInitialized(projectDir)` -- delegates to `runDashboardFlow(projectDir, config, "init", log)`. `detectInstallation()` detects an existing install; if found, `showDashboard()` renders the Dashboard component with quick actions (Edit/Compile/Doctor/List), then `config.runCommand(selected, argv)` delegates. The dashboard passes its origin: an `init`-originated Edit selection carries the hidden `--project-setup` flag (`dashboardCommandArgv()`); a bare-`cc` (`"standalone"`) Edit carries none. In non-interactive (no TTY): prints `formatDashboardText()` and returns null. Returns before the wizard when a dashboard was shown.
2. If not initialized: render `<Spinner>`, then `Promise.all([loadSourceOrFail(flags), loadGlobalConfigIfExists()])` -- **Operation: `loadSource()`** loads the skills matrix (with startup message capture); `loadGlobalConfigIfExists()` loads global config to pre-hydrate the wizard.
3. `runWizard()` -- hydrates the wizard store and renders `<Wizard>` via `runWizardSession()` (not a direct `render()` + `waitUntilExit()`). Returns `WizardResultV2 | null`; `null` exits `EXIT_CODES.CANCELLED`.
4. Guard: if `result.skills.length === 0`, `this.error("No skills selected", { exit: EXIT_CODES.ERROR })`.
5. `handleInstallation()`: `deriveInstallMode()` determines eject/plugin/mixed from active (non-excluded) skills.
6. If plugin/mixed: `requireMarketplaceOrExit()` (BaseCommand) resolves/registers the marketplace up front, BEFORE any filesystem mutation. **No fallback to eject** -- an unresolvable marketplace hard-errors (`EXIT_CODES.ERROR`).
7. If eject/mixed: `copyEjectSkillsStep()` -- **Operation: `copyLocalSkills()`** copies eject-source skills split by scope.
8. If plugin/mixed: `installPluginsStep()` -- **Operation: `installPluginSkills()`**; hard-errors (`pluginInstallFailureError`) on any per-skill failure before config is written.
9. `writeConfigAndCompile()`: **Operation: `writeProjectConfig()`** (writes `.claude-src/config.ts`; `ensureBlankGlobalConfig()` runs inside this operation, not in the command), **Operation: `loadAgentDefs()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`** (compiles agents across scopes; single home-root pass or split global+project passes), then `recompilePropagatedProjects(configResult.propagatedProjects)`.
10. `checkPermissions()` -- render permission warning (Ink) if needed, awaiting `waitUntilExit()`. Reading a settings file runs `warnUnknownFields(raw, EXPECTED_SETTINGS_KEYS, ...)`; `EXPECTED_SETTINGS_KEYS` (`src/cli/lib/permission-checker.tsx`) includes `enabledPlugins` and `extraKnownMarketplaces` because the Claude CLI writes both during this CLI's own plugin-install path -- a settings file this CLI produced must never trigger the unknown-field warning. Genuinely unknown fields still warn.

**Propagated-project recompile (D-240).** `writeProjectConfig` returns `ConfigWriteResult.propagatedProjects` -- the registered project directories whose `config.ts` this run's global change was fanned out into. Their compiled agents are now stale, so `recompilePropagatedProjects()` feeds the list to **Operation: `recompilePropagatedProjectAgents()`**, which recompiles each project at project scope with per-project failure isolation. Empty list is a no-op (nothing logged). Per-project warnings are re-emitted via `this.warn()`; the summary line reads `Recompiled agents in N registered projects` with a ` (N failed)` suffix when any failed.

**Not-installed detection.** `detectInstallationInDir` (`src/cli/lib/installation/installation.ts`) returns `null` for a config that declares neither skills nor agents, so a content-less config reads as NOT installed and `init` routes to the setup wizard instead of the dashboard. It also returns `null` when the config file vanished between the `fileExists` probe and the load. A **corrupt** config is different: `loadProjectConfigFromDir` throws `ConfigLoadError`, which propagates to the caller rather than becoming a phantom eject installation.

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `loadSource`, `installPluginSkills`, `pluginInstallFailureError`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `recompilePropagatedProjectAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (wraps `requireMarketplace` operation; no `ensureMarketplace` fallback)
- `src/cli/lib/installation/index.ts` -- `detectInstallation`, `detectGlobalInstallation`, `deriveInstallMode`, `resolveInstallPaths`, `buildAgentScopeMap`, `isHomeDirectory`, `INSTALL_MODE_LABELS`
- `src/cli/lib/configuration/project-config.ts` -- `loadProjectConfig`, `loadProjectConfigFromDir`
- `src/cli/lib/plugins/plugin-info.ts` -- `getInstallationInfo`
- `src/cli/lib/permission-checker.tsx` -- `checkPermissions`
- `src/cli/components/wizard/run-wizard-session.tsx` -- `runWizardSession` (renders the Wizard component)
- `src/cli/components/common/select-list.tsx` -- SelectList for dashboard

**Exported utilities:**

- `runDashboardFlow(projectDir, config, origin, log?): Promise<boolean>` -- shared dashboard entry (used by `init` and the bare-`cc` init hook)
- `DashboardOrigin` type -- `"init" | "standalone"`, threaded into `dashboardCommandArgv()`
- `DashboardCommand` type -- `"edit" | "compile" | "doctor" | "list"`, derived from `DASHBOARD_OPTIONS`; the command a dashboard selection runs
- `formatDashboardText(data: DashboardData): string`
- `showDashboard(projectDir, log?): Promise<DashboardCommand | null>`
- `getDashboardData(projectDir): Promise<DashboardData>`

### `edit` (src/cli/commands/edit.tsx)

**Purpose:** Modify installed skills via wizard re-entry with diff-based change detection. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, sources, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

**Flags:**

| Flag      | Type    | Description                       |
| --------- | ------- | --------------------------------- |
| --refresh | boolean | Force refresh from remote sources |
| --source  | string  | Skills source path or URL         |

Plus a hidden internal boolean flag `--project-setup` (`EDIT_PROJECT_SETUP_FLAG`, `hidden: true`) set only when `init`'s dashboard delegates to Edit as the project-materialisation step. See `reference/commands/edit.md`.

**Flow:** (see `reference/commands/edit.md` for the full method-by-method flow)

1. **Operation: `detectProject()`** -- detect installation + load project config
2. **Operation: `loadSource()`** -- load matrix with startup messages
3. Discover current installed skills: `discoverAllPluginSkills()` + merge with config skills (excluded entries filtered)
4. `runWizardSession()` renders `<Wizard>` with `initialStep="build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`, `initialDomains`, `initialAgents`, `startupMessages`
5. Filter excluded entries once, then `detectConfigChanges(filteredOldConfig, filteredResult, fullEntries)` -- returns `ConfigChanges`
6. **No-change branch** (`!hasAnyChanges(changes)`): logs `"No changes made."` and returns -- UNLESS `isProjectSetup` (`flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`), in which case it still runs `writeConfigAndCompile()` to materialise the project (init dashboard flow)
7. `logChangeSummary()` -- styled diff using display names from matrix, scope labels `[G]`/`[P]`, green `+` for G-to-P scope migrations, dual-scope `[P]` add/remove lines
8. `applyMigrations()` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches; returns migrated `Set<SkillId>`
9. `recordGlobalSourceMigrations()` -- rewrites `source` on active-global entries this run migrated, in the global config (project-context runs only)
10. `applyScopeChanges()` -- `migrateLocalSkillScope()` for eject skills, `migratePluginSkillScopes()` for plugin skills (marketplace required)
11. `applySourceChanges()` -- `deleteLocalSkill()` on the old scope dir for non-migration eject-source changes
12. `applyPluginChanges()` -- **Operation: `installPluginSkills()`** for added plugins (hard-errors on failure), **Operation: `uninstallPluginSkills()`** for removed; marketplace via `requireMarketplaceOrExit()`
13. `copyNewLocalSkills()` -- **Operation: `copyLocalSkills()`** for newly added eject-source skills
14. `removeDeletedLocalSkills()` -- `deleteLocalSkill()` for fully-deselected eject skills (D-233)
15. `writeConfigAndCompile()` -- **Operation: `loadAgentDefs()`**, **Operation: `writeProjectConfig()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`**, then `recompilePropagatedProjects(configResult.propagatedProjects)` -- **Operation: `recompilePropagatedProjectAgents()`** (D-240; same contract as `init`)
16. `cleanupStaleAgentFiles()` -- remove old agent .md files after scope changes / deselection

**Global immutability (D-277).** A globally installed skill or agent cannot be deselected from a project in any flow, `init` included, so `removedSkills` / `removedAgents` never contain an active global entry when the edit runs at project scope. Domain deselection is a view filter that drops only project-owned skills. The rule is enforced in the wizard store, not in this command -- see `reference/concepts/scope-system.md`.

**Exported utilities (`@internal`, for testing):**

- `ConfigChanges` type -- diff between old and new config (added/removed skills, agents, source changes, scope changes, agent scope changes, plus `dualScopeSkillTransitions`/`dualScopeAgentTransitions` sets)
- `detectConfigChanges(oldConfig, wizardResult, fullEntries?)` -- computes `ConfigChanges` from old `ProjectConfig` and new `WizardResultV2`; optional `fullEntries` (tombstone-inclusive) classifies dual-scope transitions
- `applyMigratedGlobalSources(globalSkills, migratedSources)` -- rewrites `source` on active-global entries; returns `{ skills, changed }`
- `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` -- migrates plugin skill scope registrations. Returns `PluginScopeMigrationResult`.
- `PluginScopeMigrationResult` type -- `{ migrated: SkillId[]; failed: Array<{ id: SkillId; error: string }> }`

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `installPluginSkills`, `pluginInstallFailureError`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig` (+ `ConfigWriteResult`), `compileAgentsAllScopes`, `recompilePropagatedProjectAgents`, `discoverInstalledSkills`, `loadAgentDefs`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (no `ensureMarketplace` fallback)
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory`, `installBaseDir`, `resolveInstallPaths`, `writeConfigFile`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`

### `compile` (src/cli/commands/compile.ts)

**Purpose:** Compile agents using installed skills and agent definitions, and refresh each compiled scope's `config-types.ts`. Runs dual-pass for global and project installations.

**Flags:**

| Flag           | Type    | Description               |
| -------------- | ------- | ------------------------- |
| --verbose (-v) | boolean | Enable verbose logging    |
| --source       | string  | Skills source path or URL |

**Flow:**

1. `detectInstallations(cwd)` -- **Operation: `detectBothInstallations(cwd)`**, returning `{ global, project, hasBoth }`. A `ConfigLoadError` (config file present but unparseable) is caught and re-raised via `this.error(..., { exit: EXIT_CODES.ERROR })` naming the offending file, **before any write** -- a corrupt config must never let compile run config-less and resurrect every built-in agent (D-273).
2. Error `ERROR_MESSAGES.NO_INSTALLATION` if neither installation found
3. `resolveAndLogSource()` -- `resolveSource()` from configuration, logs `Source: <sourceOrigin>`
4. `loadAgentDefsOrFail()` -- **Operation: `loadAgentDefs({ projectDir })`**
5. `buildCompilePasses()` -- global pass (`projectDir = os.homedir()`) if a global installation exists, project pass (`projectDir = cwd`) if a project installation exists. When `hasBoth`, each pass gets a `scopeFilter` (`"global"` / `"project"`) to prevent cross-scope overwrites; with only one installation the pass is unfiltered.
6. For each pass (`runCompilePass`):
   a. `discoverAllSkills()` -- **Operation: `discoverInstalledSkills(projectDir)`**
   b. If `totalSkillCount === 0`: log `No skills found for <label> pass, skipping`, still run `refreshConfigTypes()`, and return `false`. The config loads independently of discovered skills, so a hand-edited `config.ts` listing skills with nothing installed for that scope must still get fresh unions.
   c. `warnUnresolvedStackSkills()` -- emits `this.warn()` for each configured stack skill absent from disk (excluded ids filtered via `effectivelyExcludedSkillIds`); such skills are dropped from the recompiled agents rather than silently omitted (D-254)
   d. **Operation: `compileAgents({ projectDir, sourcePath, skills, pluginDir, outputDir, scopeFilter })`**
   e. When the pass compiled zero agents and `label === "Project"`, `hintGlobalScopedAgents()` counts the config's active `scope === "global"` agents and, if non-zero, prints `globalScopedAgentsHint(count)` after `INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE` (D-275)
   f. `refreshConfigTypes()`
7. After all passes, if no pass had skills, hard-error `No skills found. Add skills with '<bin> add <skill>' ...` (`EXIT_CODES.ERROR`).

**`config-types.ts` regeneration.** The documented workflow is to hand-edit `config.ts` then run `compile`, so every pass regenerates the type unions for the scope it compiled via `regenerateScopeConfigTypes(projectDir, config, matrix, agents)` (`src/cli/lib/installation/local-installer.ts`), matching the wizard write path exactly: standalone narrowed unions at global scope (`writeStandaloneConfigTypes`), import-and-extend at project scope (`regenerateConfigTypes`). Success logs `INFO_MESSAGES.CONFIG_TYPES_REFRESHED`. When `loadProjectConfigFromDir` finds no config the refresh is skipped at verbose level. **Any failure downgrades to a warning** (`configTypesRefreshFailed(reason)`) -- the compiled agents are already written and remain valid; only the unions may be stale.

The matrix for that refresh is loaded with `loadSkillsMatrixFromSource({ sourceFlag, projectDir, skipExtraSources: true, matrixOnly: true })`. `matrixOnly` skips the `fetchFromSource` clone for the default source (the matrix is the pre-computed `BUILT_IN_MATRIX` anyway) so `compile` stays offline on a cold cache; `sourcePath` comes back empty. `skipExtraSources` is not a divergence from the wizard's fully tagged load -- extra sources only annotate `availableSources`/`activeSource` for wizard UI tagging and the config-types writer never reads them, so the emitted types are byte-identical (pinned by the `skipExtraSources` parity test in `local-installer.test.ts`).

**Stale built-in agent pruning (D-264).** `compileAgents` calls `pruneStaleAgentsForPass` (`src/cli/lib/operations/project/compile-agents.ts`), which removes built-in agent `.md` files no longer compiled into `outputDir`. It runs **only on a scope-UNfiltered pass with an `outputDir`** -- an unfiltered pass owns its entire output directory. A scope-filtered pass (the `hasBoth` two-pass compile, or the D-240 registered-project recompile) sees one scope's roster and must never delete another scope's files, so it skips pruning. Hand-authored agents are preserved by the prune predicate (`pruneStaleCompiledAgents` in `src/cli/lib/agents/list-compiled-agents.ts`).

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`
- `src/cli/lib/configuration/index.ts` -- `resolveSource`, `loadProjectConfig`, `loadProjectConfigFromDir`, `effectivelyExcludedSkillIds`, `ConfigLoadError`
- `src/cli/lib/installation/index.ts` -- `regenerateScopeConfigTypes`, `Installation`
- `src/cli/lib/loading/index.ts` -- `loadSkillsMatrixFromSource` (with `matrixOnly` + `skipExtraSources`)
- `src/cli/lib/stacks/index.ts` -- `getStackSkillIds`
- `src/cli/utils/messages.ts` -- `configTypesRefreshFailed`, `globalScopedAgentsHint`, `INFO_MESSAGES.CONFIG_TYPES_REFRESHED`

### `validate` (src/cli/commands/validate.ts)

**Purpose:** Validate every registered source, installed plugin, installed skill, and installed agent. Read-only validation that walks every registered source, every installed plugin, every installed skill, and every installed agent. Prints a summary table with per-directory counts; exits non-zero if any pass produced an error.

**Args:** None. No `static args` declared.

**Flags:** None. `static flags = {}` and `static baseFlags = {}` -- validate overrides the base `--source` flag (validate is a zero-flag command that walks every registered source automatically).

**Flow (`validateAllRegistered`):** four labelled passes, in order -- `Validating sources` (primary + extras from `resolveAllSources`), `Validating plugins`, `Validating skills`, `Validating agents`. Each of the last three validates the global directory and, when `!isHomeDirectory(projectDir)`, the project directory too (at the home root both resolve to the same place, so only one pass runs). Counts are summed by `sumCounts`; the run ends with `Result: N error(s), M warning(s)` and exits `EXIT_CODES.ERROR` when `errors > 0`.

**Plugin pass -- claude CLI v2 registry.** `validatePluginsDirectory` first probes `getInstalledPluginsRegistryPath(pluginsDir)` (`installed_plugins.json`, the claude CLI >= 2.1.220 cache layout). When that file exists, `validateRegistryPlugins` reads it via `listRegisteredPluginInstalls` and runs `validatePlugin(installPath)` against **each recorded install path**. Behaviour:

| Registry state              | Outcome                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Absent                      | Falls through to the direct-children scan (`findPluginDirectories` + `validateAllPlugins`)             |
| Present but records zero    | `validateRegistryPlugins` returns `undefined`; caller falls back to the direct-children scan           |
| Present with records        | Each recorded `installPath` validated; a path that no longer exists is an **invalid plugin**           |
| Unreadable / schema-invalid | `listRegisteredPluginInstalls` throws; counted as **1 error** (`failed: <reason>`), not scanned around |

Before this pass existed, the direct-children-only scan made the v2 cache layout invisible and installed plugins were never validated.

**Skill metadata -- advisory over-length `cliDescription`.** `validateInstalledSkillMetadata` parses `metadata.yaml` with `parseYaml`, runs `validateSkillMetadata()`, and on failure splits the issues with `splitMetadataValidationIssues(result.error, rawMetadata)` from `src/cli/lib/schemas.ts`. An over-length `cliDescription` (> `CLI_DESCRIPTION_MAX_LENGTH`) is downgraded to a **warning carrying the actual length** -- the runtime schemas accept any length and the value only feeds wizard description text, while the strict schema keeps `max(60)` as the declared contract. An empty or missing `cliDescription`, and every other issue, stays an **error**. `valid` is `errors.length === 0`, so an advisory warning alone no longer fails the run. `validateSource()` applies the same split for source-repo skills.

**Directory-name rule.** Enforced during source validation by `checkSkillDirName` (`src/cli/lib/source-validator.ts`), which compares the directory name against the skill's **machine id read from `SKILL.md` frontmatter** (`parseFrontmatter(...).name`), not `displayName`. It runs independently of whether the metadata validated. Missing/invalid frontmatter, or an unreadable `SKILL.md`, produces a warning (`Cannot verify directory name '<dir>': ...`) rather than an error. Comparing `displayName` was unsatisfiable under the marketplace convention -- human display names living in `<domain>-<category>-<slug>` directories.

**Parse-failure causes -- reported in one phase, not the other (0.147.1).** Two `catch` blocks in `src/cli/lib/source-validator.ts` bound the error and discarded it, in the command whose entire purpose is telling you what is wrong with your source repo. Both now interpolate `getErrorMessage(error)`:

| Site                                                      | Message emitted                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `validateSource` -- skill `metadata.yaml` parse           | `Failed to parse YAML: <cause>` (severity `error`) -- was losing a `YAMLParseError`'s line/column   |
| `validateSource` -- categories/rules cross-reference load | `Cross-reference validation skipped: failed to load categories/rules: <cause>` (severity `warning`) |

The second was self-evidencing before the fix: a template literal with no interpolation, the residue of a deleted `${getErrorMessage(error)}`.

> **Known inconsistency -- the same sentence carries a cause from one phase and not the other.** `validateYamlFiles` (`src/cli/lib/source-validator.ts`) still emits a bare `Failed to parse YAML` with **no cause**, from a bare `catch {`. It has exactly three call sites, all in the optional source-repo phases: `validateStacks` (stack skill `metadata.yaml`, and `*/config.yaml`) and `validateAgents` (agent `metadata.yaml`). `validateConfigFiles` does **not** route through it -- it runtime-loads `.ts` config files via `validateTsConfig`, whose own `catch` already reports through `formatLoadError`.
>
> Deliberately out of scope for the 0.147.1 pass: with no binding there is no lint signal, so it was invisible to the sweep that found the other two. It is also the more general problem -- a linter can only ever see the bound-and-discarded variant. Do not read the presence of a cause on a `Failed to parse YAML` line as diagnostic of which file failed; it is diagnostic of which _phase_ produced it.

**Key dependencies:** `resolveAllSources()`, `isLocalSource()`, `SourceEntry` from configuration. `validateSource()` from source-validator. `validateAllPlugins()`, `validatePlugin()`, `printPluginValidationResult()`, `validateSkillFrontmatter()`, `validateAgentFrontmatter()`, `getUserPluginsDir()`, `getProjectPluginsDir()`, `getInstalledPluginsRegistryPath()`, `listRegisteredPluginInstalls()`, `ResolvedPlugin` from plugins. `resolveInstallPaths()`, `isHomeDirectory()` from installation. `validateSkillMetadata()`, `splitMetadataValidationIssues()` from schemas. `listAgentMdFiles()` from agents.

### `list` (src/cli/commands/list.tsx)

**Purpose:** Show installation information (skills, agents, mode, source). Alias: `ls`. Ink-based React component for TTY, plain text fallback for non-TTY.

**Flags:** `--source` (inherited)

**Flow:**

1. `detectInstallation()` from `installation/installation.ts` -- find installation. A content-less config (no skills, no agents) is not an installation, so this returns `null` and the command prints the not-found message.
2. If no installation: print "No installation found." + `Run '<bin> init' to create one.` and return
3. `loadProjectConfig(projectDir)` from `configuration/project-config.ts` -- load project config
4. If no config or non-TTY: fallback to `getInstallationInfo()` + `formatInstallationDisplay()` (plain text) from `plugins/index.ts`
5. If TTY with config: filter excluded skills/agents, `hydrateWizardStore({ installedSkillConfigs, installedAgentConfigs })`, then `render(<ListView>)` -- Ink component showing mode (`INSTALL_MODE_LABELS[installation.mode]`), source, and the `<SkillAgentSummary>` component. `ListView` calls `useApp().exit()` via a `setTimeout(..., 0)` effect to auto-exit after render; the command awaits `waitUntilExit()` then `clear()`.

**No version field.** `InstallationInfo` (`src/cli/lib/plugins/plugin-info.ts`) is `{ mode, name, skillCount, agentCount, configPath, agentDirs, skillsDir }` -- there is **no `version` field**. It previously held the install mode and the formatter prefixed it with `v`, so the header printed `Installation: agents-inc vplugin`. `formatInstallationDisplay` now emits the mode exactly once:

```
Installation: <name>
  Mode:    <INSTALL_MODE_LABELS[mode]>
  Skills:  <skillCount>
  Agents:  <agentCount>
  Config:  <configPath>
  Agents:  <dir>            # one line per entry in agentDirs
```

**Key dependencies:**

- `src/cli/lib/installation/installation.ts` -- `detectInstallation()`, `INSTALL_MODE_LABELS`
- `src/cli/lib/configuration/project-config.ts` -- `loadProjectConfig()`
- `src/cli/lib/plugins/index.ts` -- `getInstallationInfo()`, `formatInstallationDisplay()` (non-TTY fallback)
- `src/cli/stores/wizard-store.ts` -- `hydrateWizardStore()` (feeds `SkillAgentSummary`)
- `src/cli/components/wizard/skill-agent-summary.tsx` -- `SkillAgentSummary` component (TTY mode)
- `src/cli/types/config.ts` -- `SkillConfig`, `AgentScopeConfig` types

### `doctor` (src/cli/commands/doctor.ts)

**Purpose:** Diagnose common configuration issues (config validity, skills resolved, agents compiled, orphan detection, source reachable).

**Flags:** None. `static flags = {}` and `static baseFlags = {}` -- doctor overrides the base `--source` flag because diagnostics always run against the current project.

**Behavior:** Calls `setVerbose(true)` unconditionally, so output is always verbose.

**Checks run** (display order): Config Valid, Skills Resolved, Agents Compiled, No Orphans, Skills Installed, Plugins Installed, Source Reachable. `Skills Installed` is the eject-mode on-disk check (`checkSkillsInstalled`); `Plugins Installed` (`checkPluginSkillsInstalled`) verifies the plugin registry grouped by each skill's own scope (added D-253). `doctor` exits `EXIT_CODES.ERROR` if any check fails.

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

**Purpose:** Remove CLI-managed skills, compiled agents, plugins, **and the `.claude-src/` config manifest** (`config.ts` + `config-types.ts`). User-created content is preserved.

**Flags:**

| Flag     | Short | Type    | Description               |
| -------- | ----- | ------- | ------------------------- |
| --yes    | -y    | boolean | Skip confirmation prompt  |
| --source | -s    | string  | Skills source path or URL |

> **`--all` removed (D-274, breaking).** Manifest removal is now unconditional -- plain `uninstall` does what `--all` used to do. `static flags` is `{ ...BaseCommand.baseFlags, yes }`; there is no `all` key. The old default left `config.ts` + `config-types.ts` behind, so a "successful" uninstall still left the project looking installed.

**Flow (`run`):**

1. `printHeader()`
2. `detectUninstallTarget(projectDir, onConfigLoadFailed)` -- builds `UninstallTarget` (plugins, local skills/agents, `.claude/`, `.claude-src/config.ts`, `.claude-src/config-types.ts`, loaded config, configured agents). CLI-owned plugins are the intersection of `listPluginNames()` with `getCliInstalledPluginKeys(activeConfig)`. The second parameter is a warn callback -- see "corrupt PROJECT config" below.
3. `hasAnythingToRemove(target)` -- true when any of `hasPlugins`, `hasLocalSkills`, `hasLocalAgents`, **`hasClaudeSrcConfig`, `hasClaudeSrcConfigTypes`**. False -> `reportNothingToUninstall()` and return.
4. Confirmation: `--yes` prints the plan via `printRemovalPlan()` (always returns `true`); otherwise `confirmRemoval()` renders `<UninstallConfirm>` through `promptConfirm()`. Cancel -> `this.exit(EXIT_CODES.CANCELLED)`.
5. `executeUninstall(target, projectDir)`
6. `reportSuccess()` -- `SUCCESS_MESSAGES.UNINSTALL_COMPLETE`

**Removal plan.** `buildRemovalPlan(target)` is the single pure builder shared by `printRemovalPlan` (plain text) and the `UninstallConfirm` Ink component, so both emit byte-identical item strings and only add their own indentation/styling. Sections, in order:

| Section              | Emitted when                                      | Items                                                            |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `Plugins:`           | `hasPlugins`                                      | `cliPluginNames`                                                 |
| `CLI-managed files:` | `hasLocalSkills \|\| hasLocalAgents`              | `<skillsDir>/ (matching sources)`, `<agentsDir>/ (CLI-compiled)` |
| `Config:`            | `hasClaudeSrcConfig \|\| hasClaudeSrcConfigTypes` | `<claudeSrcDir>/config.ts`, `<claudeSrcDir>/config-types.ts`     |

**`executeUninstall` order (scope-dependent):**

1. `isGlobalUninstall = isHomeDirectory(projectDir)`. When global, `prepareGlobalPropagation()` runs **first** -- the `projects[]` registry and the source used to regenerate each project's `config-types.ts` both live in the global config this run is about to delete.
2. `uninstallPlugins()` when `hasPlugins`; a throw here hard-errors (`EXIT_CODES.ERROR`).
3. `removeLocalFiles()` -- `removeMatchingSkills` (only dirs carrying `forkedFrom` metadata; others are skipped with a warning), `removeMatchingAgents` (only basenames listed in `config.agents`), then `cleanupEmptyDirs`. A throw hard-errors.
4. **Global uninstall:** `updateRegisteredProjects(propagation)` and return. **Project uninstall:** `deregisterProjectPath(projectDir)`.

**Config manifest + directory cleanup.** `removeConfigManifest` deletes `config.ts` and `config-types.ts` from `.claude-src/`, then `removeDirIfEmpty(claudeSrcDir)` removes `.claude-src/` **only when it is empty afterwards** -- user-owned content there (e.g. ejected templates) keeps the directory alive. Logging: `Removed .claude-src/` when the directory went, otherwise `Removed CLI config from .claude-src/`. `.claude/` is removed only when empty, else `Kept .claude/ (contains user content)`.

**Project uninstall -- deregistration.** Always calls `deregisterProjectPath(projectDir)` so future global edits stop propagating back into a removed project. Failure is **warned, not swallowed**: `Could not update the global project registry: <reason>`. A missing, project-less, or corrupt (`ConfigLoadError`) global config must never fail the uninstall.

**Corrupt PROJECT config -- uninstall proceeds (0.146.1).** `loadUninstallConfig(projectDir, onLoadFailed)` wraps the `loadProjectConfigFromDir` call in `detectUninstallTarget`:

```ts
catch (error) {
  if (!(error instanceof ConfigLoadError)) throw error;
  onLoadFailed(getErrorMessage(error));
  return null;
}
```

`ConfigLoadError` is caught **only**; any other error still propagates as a real fault. The callback `run()` passes warns:

```
Could not read the project config — plugins and compiled agents it lists may be left behind: <reason>
```

An unreadable config is then treated exactly like a **missing** one (`null`), so the run continues, removes the manifest, and exits 0. Only the _plan_ degrades -- the plugins and compiled agents the config named can no longer be identified, while file removal proceeds.

Previously a `ConfigLoadError` escaped `run()` and killed the command precisely when the config was unreadable -- that is, exactly when a user most needs to uninstall; the only way out was to hand-delete `.claude-src/`. This closes the corrupt-**project**-config path alongside the corrupt-**global**-config path deregistration already handled (above). Both call sites hold the same posture; see `reference/features/configuration.md` -> `ConfigLoadError` call-site posture table.

**Global uninstall -- registered-project propagation.** Two halves:

- `prepareGlobalPropagation()` (before removal) returns `null` when `config.projects` is empty. Otherwise it loads, in parallel, `loadSkillsMatrixFromSource({ projectDir, skipExtraSources: true, matrixOnly: true })` and `loadAgentDefs({ projectDir })`, producing `GlobalPropagationData { globalConfig, matrix, agents }`. A load failure warns via `registeredProjectsUpdateFailed(...)` and returns `null` -- it never aborts.
- `updateRegisteredProjects()` (after removal) calls `pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)`, which strips the inlined global-scoped entries from every registered project and regenerates each project's `config-types.ts`. It runs **after** the global manifest is gone so the regenerated project types fall back to the standalone form instead of importing from a deleted global `config-types.ts`. Each `result.skipped` path warns via `registeredProjectUpdateSkipped(path)`; a non-empty `result.updated` logs `registeredProjectsUpdated(count)`. A throw is caught and warned -- **no failure here may abort the uninstall**.

`matrixOnly` + `skipExtraSources` keep this load offline and quiet: an uninstall must not hang on a cold cache or fail on an unreachable remote. The types emitted are byte-identical to the wizard's fully tagged load (same parity test as `compile`).

**Exported for testing (`@internal`):** `UninstallTarget` type, `getCliInstalledPluginKeys(config)`, `uninstallPlugins(target, projectDir, onUninstalled?)`.

**Key dependencies:** `listPluginNames()`, `getProjectPluginsDir()`, `buildMarketplacePluginRef()`, `parseMarketplacePluginRef()`, `toClaudePluginScope()` from plugins. `readForkedFromMetadata()` from skills. `loadProjectConfigFromDir()` from configuration. `deregisterProjectPath()`, `isHomeDirectory()`, `pruneGlobalEntriesFromRegisteredProjects()`, `resolveInstallPaths()` from installation. `loadSkillsMatrixFromSource()` from loading. **Operation: `loadAgentDefs()`**. `listAgentMdFiles()` from agents. `claudePluginUninstallBestEffort()`, `isClaudeCLIAvailable()` from exec. `promptConfirm()` from `components/common/prompt-confirm.tsx`, `Confirm` from `components/common/confirm.tsx`. `registeredProjectsUpdated()`, `registeredProjectUpdateSkipped()`, `registeredProjectsUpdateFailed()` from `utils/messages.ts`.

### `update` (src/cli/commands/update.tsx)

**Purpose:** Update local skills from source. Compare, confirm, copy, recompile.

**Args:**

| Arg   | Required | Description                         |
| ----- | -------- | ----------------------------------- |
| skill | no       | Specific skill to update (optional) |

**Flags:**

| Flag     | Short | Type    | Description               |
| -------- | ----- | ------- | ------------------------- |
| --yes    | -y    | boolean | Skip confirmation prompt  |
| --source | -s    | string  | Skills source path or URL |

Agents are always recompiled after a successful update (`recompileAfterUpdate()`); there is no flag to skip recompilation.

**Key dependencies:** **Operation: `loadSource()`**, **Operation: `compareSkillsWithSource()`**, **Operation: `collectScopedSkillDirs()`**, **Operation: `findSkillMatch()`**, **Operation: `compileAgents()`**, **Operation: `discoverInstalledSkills()`**. Uses `injectForkedFromMetadata()` from skills.

### `import skill` (src/cli/commands/import/skill.ts)

**Purpose:** Import skills from third-party GitHub repositories into local `.claude/skills/`.

**Args:**

| Arg    | Required | Description                                                                                     |
| ------ | -------- | ----------------------------------------------------------------------------------------------- |
| source | yes      | GitHub repository source: `github:owner/repo`, `https://github.com/owner/repo`, or `owner/repo` |

**Flags:** `static baseFlags = {}` -- overrides the base `--source` flag (the source arg is the GitHub repo).

| Flag    | Short | Type    | Description                             |
| ------- | ----- | ------- | --------------------------------------- |
| --skill | -n    | string  | Name of the specific skill to import    |
| --all   | -a    | boolean | Import all skills from the repository   |
| --list  | -l    | boolean | List available skills without importing |
| --force | -f    | boolean | Overwrite existing skills               |

**Key dependencies:** `fetchFromSource()` from loading. `importedSkillMetadataSchema` from schemas. `computeFileHash()`, `getCurrentDate()` from versioning.

### `new skill` (src/cli/commands/new/skill.ts)

**Feature flag:** `FEATURE_FLAGS.NEW_SKILL_COMMAND` (currently `false`). Command exits with an error if the flag is disabled. See `src/cli/lib/feature-flags.ts`.

**Purpose:** Create a new local skill scaffold with SKILL.md and metadata.yaml.

**Args:**

| Arg  | Required | Description                    |
| ---- | -------- | ------------------------------ |
| name | yes      | Name of the skill (kebab-case) |

**Flags:** `static baseFlags = {}` -- overrides the base `--source` flag.

| Flag       | Short | Type    | Description                                         |
| ---------- | ----- | ------- | --------------------------------------------------- |
| --author   | -a    | string  | Author identifier (e.g., @myhandle)                 |
| --category | -c    | string  | Skill category (default: `LOCAL_DEFAULTS.CATEGORY`) |
| --domain   | -d    | string  | Domain (e.g., web, api, cli)                        |
| --force    | -f    | boolean | Overwrite existing skill                            |

**Key dependencies:** `resolveAuthor()` from configuration. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer. `detectInstallation()` from installation. `generateSkillCategoriesTs()`, `generateSkillRulesTs()` from skills/generators.

### `new agent` (src/cli/commands/new/agent.tsx)

**Feature flag:** `FEATURE_FLAGS.NEW_AGENT_COMMAND` (currently `false`). Command exits with an error if the flag is disabled.

**Purpose:** Create a new custom agent using AI generation via the agent-summoner meta-agent.

**Args:**

| Arg  | Required | Description       |
| ---- | -------- | ----------------- |
| name | yes      | Name of the agent |

**Flags:**

| Flag      | Short | Type    | Description                      |
| --------- | ----- | ------- | -------------------------------- |
| --purpose | -p    | string  | Purpose/description of the agent |
| --force   | -f    | boolean | Overwrite existing agent         |
| --source  | -s    | string  | Skills source path or URL        |

**Key dependencies:** `resolveSource()` from configuration. `getAgentDefinitions()` from agents. `isClaudeCLIAvailable()` from exec. Spawns the `claude` CLI process to run the `agent-summoner` meta-agent. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer.

### `new marketplace` (src/cli/commands/new/marketplace.ts)

**Feature flag:** `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` (currently `false`). Command exits with an error if the flag is disabled.

**Purpose:** Scaffold a new private marketplace directory with skills, stacks, categories, rules, and config.

**Args:**

| Arg  | Required | Description                                           |
| ---- | -------- | ----------------------------------------------------- |
| name | yes      | Marketplace name (kebab-case), or "." for current dir |

**Flags:**

| Flag     | Short | Type    | Description                  |
| -------- | ----- | ------- | ---------------------------- |
| --force  | -f    | boolean | Overwrite existing directory |
| --source | -s    | string  | Skills source path or URL    |

**Key dependencies:** `generateConfigSource()` from config-writer. `generateMarketplace()`, `writeMarketplace()` from marketplace-generator. `compileAllSkillPlugins()` from skill-plugin-compiler. `generateSkillCategoriesTs()`, `generateSkillRulesTs()` from skills/generators. `loadConfigTypesDataInBackground()`, `regenerateConfigTypes()` from config-types-writer.

## Build Subcommands

### `build marketplace` (src/cli/commands/build/marketplace.ts)

**Purpose:** Generate marketplace.json from built plugins for plugin distribution.

**Flags:** `static baseFlags = {}` -- overrides the base `--source` flag (reads from the local plugins directory, not a remote source).

| Flag          | Short | Type    | Description                                              |
| ------------- | ----- | ------- | -------------------------------------------------------- |
| --name        |       | string  | Marketplace name override (must be kebab-case)           |
| --plugins-dir | -p    | string  | Plugins directory (default: `dist/plugins`)              |
| --output      | -o    | string  | Output file (default: `.claude-plugin/marketplace.json`) |
| --verbose     | -v    | boolean | Enable verbose logging                                   |

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

**Stale-plugin pruning:** After a full-scan clean compile, `pruneStaleSkillPlugins()` removes skill-plugin directories under the output dir that no longer correspond to a compiled skill. A candidate is confirmed a skill plugin via `readPluginManifest()`: directories whose manifest declares `agents` are preserved (agent plugins are out of scope for this run) and directories without a manifest are left untouched. Pruning is **skipped** (the private `compileSkills()` helper returns `null`) in two cases: `--skill` targets a single skill (pruning would wipe every other plugin), or any skill fails to compile (a failed skill is indistinguishable from a removed one). Each removed directory logs `Pruned stale plugin: <name>`.

**Key dependencies:** `compileAllSkillPlugins()`, `compileSkillPlugin()`, `printCompilationSummary()` from skills. `compileAllAgentPlugins()`, `printAgentCompilationSummary()` from agents. `readPluginManifest()` from plugins. `listDirectories()`, `remove()` from `utils/fs`.

> **`build stack` removed:** This command no longer exists. Only `build marketplace` and `build plugins` are in `src/cli/commands/build/`. Stack-to-plugin compilation now goes through the marketplace/plugins build pipeline.

## Feature-Gated Commands

The following commands are gated behind `FEATURE_FLAGS` in `src/cli/lib/feature-flags.ts`. All three are currently disabled (flag `false`). The command prints `featureDisabledError(commandName)` and exits if invoked.

| Command           | Flag                      | Current Value |
| ----------------- | ------------------------- | ------------- |
| `new skill`       | `NEW_SKILL_COMMAND`       | `false`       |
| `new agent`       | `NEW_AGENT_COMMAND`       | `false`       |
| `new marketplace` | `NEW_MARKETPLACE_COMMAND` | `false`       |

**Full `FEATURE_FLAGS` inventory** (`src/cli/lib/feature-flags.ts`). The remaining four gate wizard UI, not commands; no other flags exist:

| Flag                      | Current Value | Gates                                                        |
| ------------------------- | ------------- | ------------------------------------------------------------ |
| `SOURCE_SEARCH`           | `false`       | Search pill in the source grid (step-sources)                |
| `SOURCE_CHOICE`           | `false`       | Intermediate source choice screen (recommended vs customize) |
| `INFO_PANEL`              | `true`        | `I` opens the info panel overlay                             |
| `FILTER_INCOMPATIBLE`     | `false`       | `F` filters incompatible skills in the build step (D-269)    |
| `NEW_SKILL_COMMAND`       | `false`       | `new skill`                                                  |
| `NEW_AGENT_COMMAND`       | `false`       | `new agent`                                                  |
| `NEW_MARKETPLACE_COMMAND` | `false`       | `new marketplace`                                            |

`FILTER_INCOMPATIBLE` gates both the `F` keypress and its footer hint; the store action stays present but dormant for a one-flag re-enable (it was disabled over a dual-scope collapse bug).

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
- `INFO_MESSAGES` - Informational strings (7 entries; `CONFIG_TYPES_REFRESHED` added for `compile`)

The same module also exports five **message builder functions** for messages that interpolate a count, path, or reason:

| Function                                 | Used by     | Purpose                                                             |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `globalScopedAgentsHint(count)`          | `compile`   | Names the global-scoped agent count after a zero-agent project pass |
| `configTypesRefreshFailed(reason)`       | `compile`   | Warns that `config-types.ts` unions may be stale                    |
| `registeredProjectsUpdated(count)`       | `uninstall` | Summary after pruning registered projects                           |
| `registeredProjectUpdateSkipped(path)`   | `uninstall` | Warns one unreachable registered project                            |
| `registeredProjectsUpdateFailed(reason)` | `uninstall` | Warns that no registered project could be updated                   |

## Operations Layer Usage by Command

| Command           | Operations Used                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`            | `loadSource`, `installPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `recompilePropagatedProjectAgents`, `discoverInstalledSkills`, `loadAgentDefs` (marketplace via `requireMarketplaceOrExit`)                                           |
| `edit`            | `detectProject`, `loadSource`, `installPluginSkills`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `recompilePropagatedProjectAgents`, `discoverInstalledSkills`, `loadAgentDefs` (marketplace via `requireMarketplaceOrExit`) |
| `compile`         | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                                                        |
| `doctor`          | `detectProject`, `loadSource`                                                                                                                                                                                                                                                 |
| `eject`           | `loadSource`                                                                                                                                                                                                                                                                  |
| `search`          | `loadSource`                                                                                                                                                                                                                                                                  |
| `update`          | `loadSource`, `compareSkillsWithSource`, `collectScopedSkillDirs`, `findSkillMatch`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                               |
| `validate`        | (none -- uses lib functions directly)                                                                                                                                                                                                                                         |
| `list`            | (none -- uses installation, configuration, plugins directly)                                                                                                                                                                                                                  |
| `uninstall`       | `loadAgentDefs` (global-uninstall propagation prep; everything else via lib functions directly)                                                                                                                                                                               |
| `import skill`    | (none -- uses loading/fetching directly)                                                                                                                                                                                                                                      |
| `new skill`       | (none -- uses configuration/installation directly)                                                                                                                                                                                                                            |
| `new agent`       | (none -- uses agents/configuration directly)                                                                                                                                                                                                                                  |
| `new marketplace` | (none -- uses generators directly)                                                                                                                                                                                                                                            |
| `build *`         | (none -- uses skill/agent compilers directly)                                                                                                                                                                                                                                 |
