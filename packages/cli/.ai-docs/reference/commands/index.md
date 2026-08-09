---
scope: reference
area: commands
keywords: [init, edit, compile, doctor, build, eject, list, search, uninstall, update]
related:
  - reference/architecture-overview.md
  - reference/features/wizard-flow.md
  - reference/features/operations-layer.md
  - reference/features/compilation-pipeline.md
  - reference/commands/edit.md
last_validated: 2026-08-09
---

# Commands Reference

## Command Architecture

All commands extend `BaseCommand` (`src/cli/base-command.ts`).

**No flag is shared by all commands.** `BaseCommand` declares no `baseFlags`: `--source` / `-s` was
the only one it ever held, and naming a source became `init`'s decision alone (owner ruling
2026-08-09), so the flag is declared in `init`'s own `static flags` and every other command refuses
it (`Nonexistent flag: --source`, exit 2). Every command after `init` resolves the source that
install recorded — project config → global config → default.

**Operations layer:** Commands use composable operations from `src/cli/lib/operations/index.ts` as the primary interface to lower-level lib functions. Commands should not bypass operations for functionality that an operation covers. See `reference/features/operations-layer.md` for full operations documentation.

### The shared narration surface lives on `BaseCommand`, not on each command

A statement about one operation is written once. Every member below is `protected` on `BaseCommand`; a command that performs the operation calls the shared reporter rather than spelling its own wording, because four copies of the same sentence had already drifted into two spellings of it.

| Member                                                         | Callers                                | What it guarantees                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureConfigReadable(projectDir)`                             | `init`, `edit`                         | Refuses before anything renders when a config file exists but throws `ConfigLoadError`. Checks the project's own config AND the global one every project write inlines.                                                            |
| `ensureSavedSkillsReadable(savedSkills, matrix, projectDir)`   | `edit`                                 | One layer below the above: refuses, still before the wizard mounts, when a saved entry the catalogue lacks names a local skill that IS installed and whose `metadata.yaml` describes no skill. See `concepts/guard-pattern.md` #11 |
| `reportValidationErrors(validation)`                           | `init`, `edit`                         | Warns each `SelectionValidation.errors` entry. Advisory — the selection installs either way and no exit code turns on them. `init` used to compute them and drop them.                                                             |
| `installPluginSkillsReported(skills, marketplace, projectDir)` | `init`, `edit`                         | `announcePluginInstall()` + `installPluginSkills()` + `reportPluginInstalls()`. `edit` used to run the same install in silence.                                                                                                    |
| `announcePluginInstall()`                                      | eject→plugin migration                 | The opening half alone, for the caller whose install belongs to `executeMigration`                                                                                                                                                 |
| `reportPluginInstalls(result)`                                 | the two above                          | Per-skill lines, then the hard error on any `failed` — before any config records a marketplace `source` for a skill with no plugin registration                                                                                    |
| `reportPropagatedRecompile(report)`                            | `init`, `edit`, `compile`, `uninstall` | Renders the recompile a gated write already performed on every OTHER registered project. Early-returns on empty `propagated.updated`.                                                                                              |
| `requireMarketplaceOrExit(...)`                                | `init`, `edit`                         | Resolves the marketplace or hard-exits. **No fallback to eject.**                                                                                                                                                                  |
| `ensureTerminalSize()`                                         | every command (via `init()`)           | Blocks below `MIN_TERMINAL_SIZE`, waiting on `resize` plus a 500ms poll for terminals that resize without emitting one                                                                                                             |

### Every Ink render goes through `src/cli/components/render.ts`

A command that draws an Ink tree imports `render` from `../components/render.js`, **never `from "ink"`**. `render.ts` is the only file in `src/` that imports Ink's own `render`, and the wrapper exists for one rule: when the destination stream is a TTY it passes `interactive: true`, so a genuine terminal beats Ink's CI-environment guess; when it is not (piped output, redirected logs, CI without a terminal) it passes nothing and Ink's own detection stands. An explicit `interactive` from the caller wins — the spread order guarantees it.

The failure the rule prevents is not cosmetic: under its CI guess Ink buffers every frame and writes only at exit, so a screen awaiting input is never painted. That hung one CI run for 49 minutes, because the E2E harness hands the child a real pseudo-terminal while the runner's environment says `CI`. The harness deliberately passes `CI` / `GITHUB_ACTIONS` through for that reason — see [`testing/harness-decisions.md`](../testing/harness-decisions.md).

The five call sites are `commands/init.tsx`, `commands/edit.tsx`, `commands/list.tsx`, `components/common/prompt-confirm.tsx` and `components/wizard/run-wizard-session.tsx`. `render.ts` is a `.ts` file under `components/`, so it is not a tsup entry (the components glob is `*.tsx`) — it is bundled transitively into each command's chunk. See [`build-and-packaging.md`](../build-and-packaging.md) §2.

## Init Hook (src/cli/hooks/init.ts)

The single oclif lifecycle hook, registered in `package.json` under `oclif.hooks.init` (`./dist/hooks/init`). It runs **before every command** and has two responsibilities:

1. **Bare-`cc` dashboard.** When invoked with no command (`options.id === undefined`) in an already-initialized project, it calls `runDashboardFlow(projectDir, options.config, "standalone")` (exported from `src/cli/commands/init.tsx`) with `DashboardOrigin` `"standalone"`. If a dashboard was shown, it calls `this.exit(EXIT_CODES.SUCCESS)` -- the bare invocation never falls through to a command. A `"standalone"` Edit selection carries no `--project-setup` flag (contrast the `init`-originated dashboard, whose Edit selection does).
2. **Source resolution.** For `init` alone (`options.id === "init"`), `extractSourceFlag(options.argv)` reads the source flag from raw argv (oclif has not parsed flags yet at hook time). `resolveSource({ caller, flag, projectDir })` then assigns `sourceConfig` onto the oclif `Config` (a boundary cast to `ConfigWithSource`; read back via `BaseCommand.sourceConfig`). `caller` is `"init"` for the init command and `"stored"` for every other, which is what decides whether `CC_SOURCE` is consulted. Wrapped in try/catch -- a config-resolution failure is swallowed so each command decides how to handle a missing `sourceConfig`.

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
| `list`              | `src/cli/commands/list.tsx`             | tsx  | Show installation information (alias: `ls`)                                    |
| `doctor`            | `src/cli/commands/doctor.ts`            | ts   | Validate installed content, then diagnose the installation's state             |
| `eject`             | `src/cli/commands/eject.ts`             | ts   | Eject skills, agent partials, or templates                                     |
| `search`            | `src/cli/commands/search.ts`            | ts   | Search the catalog of available skills (read-only)                             |
| `uninstall`         | `src/cli/commands/uninstall.tsx`        | tsx  | Uninstall from project or global scope (always removes the config manifest)    |
| `update`            | `src/cli/commands/update.ts`            | ts   | Refresh the marketplaces this installation uses                                |
| `build marketplace` | `src/cli/commands/build/marketplace.ts` | ts   | Generate marketplace.json from built plugins                                   |
| `build plugins`     | `src/cli/commands/build/plugins.ts`     | ts   | Build skill/agent plugins                                                      |

> **Four commands were removed and none has a replacement invocation.** `import skill`, `new skill`, `new marketplace` and `new agent` no longer parse — oclif exits `127` on each (asserted as `EXIT_CODES.UNKNOWN_COMMAND` in `e2e/pages/constants.ts`; `src/cli/lib/exit-codes.ts` does not define it, because no command of ours returns it). There is no `src/cli/commands/import/` or `src/cli/commands/new/` directory, and there is no `--` flag or subcommand that stands in for them; authoring a skill, a marketplace or an agent is done in the marketplace repository. `new skill` and `new marketplace` are tracked to return (`todo/cli.md` -> CLI-453 / CLI-454); `new agent` is not. `generateMarketplace()` survived the deletion because `build marketplace` calls it — do not read its presence as the command's.

## Primary Commands (Detailed)

### `init` (src/cli/commands/init.tsx)

**Purpose:** Interactive wizard to set up skills and agents in a project. When run in an already-initialized project, shows a dashboard with quick actions (Edit, Compile, Doctor, List).

**Flags:**

| Flag          | Type   | Description                                                                    |
| ------------- | ------ | ------------------------------------------------------------------------------ |
| --source (-s) | string | Skills source path or URL — **the only command that declares it**              |
| --from        | string | Install a configuration shared from agentsinc.sh by its id, without the wizard |

> **`init` is one spine with two producers.** `--from <id>` fetches a shared seed payload and converts it to a `WizardResultV2` (`selectionFromSharedConfig`); a bare `init` runs the wizard (`selectionFromWizard`). Everything after the producer — the empty guard and the whole install pipeline — is identical. `--from` also bypasses the dashboard diversion, because an id is an explicit instruction rather than a request to be shown around — but it does **not** install over what it finds: it is greenfield-only and refuses an existing installation with a message naming `uninstall`. Wire contract, mapping and both refusals: [features/seed-contract.md](../features/seed-contract.md).

**Flow:**

0. `BaseCommand.ensureConfigReadable(projectDir)` -- refuses when a config file exists but cannot be loaded, before any route below reads it. See "Unreadable configs are recreated, not edited" under `edit`.
1. `showDashboardIfInitialized(projectDir)` -- **skipped entirely when `--from` is present.** delegates to `runDashboardFlow(projectDir, config, "init", log)`. `detectInstallation()` detects an existing install; if found, `showDashboard()` renders the Dashboard component with quick actions (Edit/Compile/Doctor/List), then `config.runCommand(selected, argv)` delegates. The dashboard passes its origin: an `init`-originated Edit selection carries the hidden `--project-setup` flag (`dashboardCommandArgv()`); a bare-`cc` (`"standalone"`) Edit carries none. In non-interactive (no TTY): prints `formatDashboardText()` and returns null. Returns before the wizard when a dashboard was shown.
2. If not initialized: render `<Spinner>`, then `Promise.all([loadSourceOrFail(flags), loadGlobalConfigIfExists()])` -- **Operation: `loadSource()`** loads the skills matrix (with startup message capture); `loadGlobalConfigIfExists()` loads global config to pre-hydrate the wizard.
3. Producer: `selectionFromSharedConfig(flags.from, flags, projectDir)` when `--from` is set, else `selectionFromWizard(flags, projectDir)` -- the latter hydrates the wizard store and renders `<Wizard>` via `runWizardSession()` (not a direct `render()` + `waitUntilExit()`). A `null` selection exits `EXIT_CODES.CANCELLED`. The `--from` producer opens with `refuseInstalledProject(projectDir)` (project-scoped detection, before the fetch) and, once the payload is decoded, `refuseBlockingGlobalInstall(result)` -- both `EXIT_CODES.ERROR`. The decode itself hard-errors on a `(project skill, resting-global sub-agent)` pair via `decodeSeedOrFail`.
4. Guard: if `selection.result.skills.length === 0 && selection.result.selectedAgents.length === 0`, `this.error(selection.emptyMessage, { exit: EXIT_CODES.ERROR })`. **Both must be empty** -- a sub-agent is installable on its own, so an agent-only selection with zero skills installs successfully. The producer supplies the wording, because only it knows whether empty means "nothing chosen" or "a payload this catalog cannot install".
5. `handleInstallation()`: `deriveInstallMode()` determines eject/plugin/mixed from active (non-excluded) skills.
6. If plugin/mixed: `requireMarketplaceOrExit()` (BaseCommand) resolves/registers the marketplace up front, BEFORE any filesystem mutation. **No fallback to eject** -- an unresolvable marketplace hard-errors (`EXIT_CODES.ERROR`).
7. If eject/mixed: `copyEjectSkillsStep()` -- **Operation: `copyLocalSkills()`** copies eject-source skills split by scope.
8. If plugin/mixed: `installPluginsStep()` -- **Operation: `installPluginSkills()`**; hard-errors (`pluginInstallFailureError`) on any per-skill failure before config is written.
9. `writeConfigAndCompile()`: **Operation: `writeProjectConfig()`** (writes `.claude-src/config.ts` through the config-gate; `ensureBlankPair()` runs inside this operation, not in the command), **Operation: `loadAgentDefs()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`** (compiles agents across scopes; single home-root pass or split global+project passes), then `reportPropagatedRecompile(configResult.propagation)`.
10. `checkPermissions()` -- render permission warning (Ink) if needed, awaiting `waitUntilExit()`. Reading a settings file takes its `permissions` block and warns about nothing else in it: `settings.json` belongs to Claude Code, so `readSettingsPermissions` (`src/cli/lib/permission-checker.tsx`) judges no field of it. A malformed file still warns and is skipped.

**Propagated-project recompile.** `writeProjectConfig` returns `ConfigWriteResult.propagation`, a `GateReport`. The registered projects whose `config.ts` this run's global change fanned into have **already been recompiled by the config-gate**, at project scope with per-project failure isolation; the command only renders. `reportPropagatedRecompile()` (on `BaseCommand`, shared by `init`, `edit`, `compile` and `uninstall`) early-returns on an empty `propagated.updated` (nothing logged), re-emits `recompile.warnings` via `this.warn()`, and prints `propagatedRecompileSummary(rewrittenCount, unchangedCount, failedCount)` — `Recompiled agents in N registered projects, M unchanged`, with a ` (K failed)` suffix when any failed. A project whose agents all came back byte-identical is counted as unchanged rather than as recompiled; see the write-if-changed contract in [`features/agent-system.md`](../features/agent-system.md).

**Not-installed detection.** `detectInstallationInDir` (`src/cli/lib/installation/installation.ts`) returns `null` for a config that declares neither skills nor agents, so a content-less config reads as NOT installed and `init` routes to the setup wizard instead of the dashboard. It also returns `null` when the config file vanished between the `fileExists` probe and the load. A **corrupt** config is different: `loadProjectConfigFromDir` throws `ConfigLoadError`, which propagates to the caller rather than becoming a phantom eject installation.

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `loadSource`, `copyLocalSkills`, `writeProjectConfig` (+ `ConfigWriteResult`), `compileAgentsAllScopes` (+ `CompilationResult`), `discoverInstalledSkills`, `loadAgentDefs`, `SkillCopyResult`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (wraps `requireMarketplace` operation; no `ensureMarketplace` fallback), `installPluginSkillsReported`, `reportValidationErrors`, `reportPropagatedRecompile`, `ensureConfigReadable`
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

**Flags:** the hidden internal boolean flag `--project-setup` (`EDIT_PROJECT_SETUP_FLAG`, `hidden: true`) set only when `init`'s dashboard delegates to Edit as the project-materialisation step. See `reference/commands/edit.md`.

**Flow:** (see `reference/commands/edit.md` for the full method-by-method flow)

0. `BaseCommand.ensureConfigReadable(cwd)` -- refuses, before anything renders, when a config file exists but cannot be loaded. See "Unreadable configs are recreated, not edited" below.
1. **Operation: `detectProject()`** -- detect installation + load project config
2. **Operation: `loadSource()`** -- load matrix with startup messages
   2b. `BaseCommand.ensureSavedSkillsReadable(config.skills, matrix, projectDir)` -- still before the wizard mounts, refuses over an installed local skill whose `metadata.yaml` describes no skill. The other unresolvable classes fall through and are removed with a class-specific reason at step 7.
3. Discover current installed skills: `discoverAllPluginSkills()` + merge with config skills (excluded entries filtered)
4. `runWizardSession()` renders `<Wizard>` with `initialStep="build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`, `initialDomains`, `initialAgents`, `startupMessages`
5. Filter excluded entries once, then `detectConfigChanges(filteredOldConfig, filteredResult, fullEntries)` -- returns `ConfigChanges`
6. **No-change branch** (`!hasAnyChanges(changes)`): logs `"No changes made."` and returns -- UNLESS `isProjectSetup` (`flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`), in which case it still runs `writeConfigAndCompile()` to materialise the project (init dashboard flow)
7. `logChangeSummary()` -- styled diff using display names from matrix, scope labels `[G]`/`[P]`, green `+` for G-to-P scope migrations, dual-scope `[P]` add/remove lines. Removal rows for `result.unresolvableSkillIds` carry the reason from `unresolvedSkillRemovalReasons(ids, activeOldSkills, projectDir, loadedSourceLabel(sourceResult))` -- one of four class-specific sentences, not a single wording. See [`config/config-merger.md`](../config/config-merger.md)
8. `applyMigrations()` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches; returns migrated `Set<SkillId>`
9. `recordGlobalSourceMigrations()` -- rewrites `source` on active-global entries this run migrated, in the global config (project-context runs only), via `config-gate::mutateGlobal({ kind: "migrate-skill-sources" })`. Since the per-skill `source` decides the reference form a compiled agent emits, this classifies T1: the gate fans the change out to every OTHER registered project and recompiles their agents, and `reportPropagatedRecompile` renders the result. Runs BEFORE step 15, whose own write then classifies as a byte-identical no-op, so nothing fans out twice.
10. `applyScopeChanges()` -- `migrateLocalSkillScope()` for eject skills, `migratePluginSkillScopes()` for plugin skills (marketplace required)
11. `applySourceChanges()` -- `deleteLocalSkill()` on the old scope dir for non-migration eject-source changes
12. `applyPluginChanges()` -- **Operation: `installPluginSkills()`** for added plugins (hard-errors on failure), **Operation: `uninstallPluginSkills()`** for removed; marketplace via `requireMarketplaceOrExit()`
13. `copyNewLocalSkills()` -- **Operation: `copyLocalSkills()`** for newly added eject-source skills
14. `removeDeletedLocalSkills()` -- `deleteLocalSkill()` for fully-deselected eject skills
15. `writeConfigAndCompile()` -- **Operation: `loadAgentDefs()`**, **Operation: `writeProjectConfig()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`**, then `reportPropagatedRecompile(configResult.propagation)` (the shared `BaseCommand` reporter — same wording as `init`, because it is the same function)
16. `cleanupStaleAgentFiles()` -- remove old agent .md files after scope changes / deselection

**Global immutability.** A globally installed skill or agent cannot be deselected from a project in any flow, `init` included, so `removedSkills` / `removedAgents` never contain an active global entry when the edit runs at project scope. Domain deselection is a view filter that drops only project-owned skills. The rule is enforced in the wizard store, not in this command -- see `reference/concepts/scope-system.md`.

**Unreadable configs are recreated, not edited.** There are no versioned config migrations. `BaseCommand.ensureConfigReadable(projectDir)` runs as step 0 of both `edit` and `init` and hard-errors (`EXIT_CODES.ERROR`) with `configUnreadableError(...)` when a config file exists but throws `ConfigLoadError`. It checks the project's own config AND, from a project, the global one every project write inlines -- at the home root the two collapse into one check. A **missing** config passes through untouched, so `edit` still reports `No installation found` and `init` still routes to the wizard. The message carries the `ConfigLoadError` (file plus reason) and two ways forward: `uninstall` (which deliberately tolerates the same corruption) followed by `init`, or a configuration built at the editor URL (`EDITOR_URL` in `src/cli/consts.ts`) and installed with `init --from <id>`. `doctor` is deliberately not named as a way forward -- it diagnoses rather than repairs, and on an unreadable config it now names the state (`exists but could not be loaded`, in the content layer) rather than calling the file missing. Before this, `edit` reported an unreadable PROJECT config as `No installation found` (the load error was swallowed into `detectProject`'s `null`), an unreadable GLOBAL config carried the run past the wizard and surfaced only as a warned config write that never happened, and `init` printed the raw `ConfigLoadError`. Pinned by `e2e/commands/edit-corrupt-config.e2e.test.ts`.

**Exported utilities (`@internal`, for testing):**

- `ConfigChanges` type -- diff between old and new config (added/removed skills, agents, source changes, scope changes, agent scope changes, plus `dualScopeSkillTransitions`/`dualScopeAgentTransitions` sets)
- `detectConfigChanges(oldConfig, wizardResult, fullEntries?)` -- computes `ConfigChanges` from old `ProjectConfig` and new `WizardResultV2`; optional `fullEntries` (tombstone-inclusive) classifies dual-scope transitions
- `applyMigratedGlobalSources(globalSkills, migratedSources)` -- rewrites `source` on active-global entries; returns `{ skills, changed }`
- `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` -- migrates plugin skill scope registrations. Returns `PluginScopeMigrationResult`.
- `PluginScopeMigrationResult` type -- `{ migrated: SkillId[]; failed: Array<{ id: SkillId; error: string }> }`

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig` (+ `ConfigWriteResult`), `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs` (+ `AgentDefs`)
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (no `ensureMarketplace` fallback), `installPluginSkillsReported`, `announcePluginInstall` (the eject→plugin migration path), `reportValidationErrors`, `reportPropagatedRecompile`, `ensureConfigReadable`
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory`, `installBaseDir`, `resolveInstallPaths`, `writeConfigFile`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`, `unresolvedSkillRemovalReasons`

### `compile` (src/cli/commands/compile.ts)

**Purpose:** Compile agents using installed skills and agent definitions, and refresh the compiled scope's `config-types.ts`. Runs the ONE pass its working directory owns: inside a project, the project pass and nothing else; where no project installation is in play, the global pass.

**Flags:**

| Flag           | Type    | Description            |
| -------------- | ------- | ---------------------- |
| --verbose (-v) | boolean | Enable verbose logging |

**Flow:**

1. `detectInstallations(cwd)` -- **Operation: `detectBothInstallations(cwd)`**, returning `{ global, project, hasBoth }`. A `ConfigLoadError` (config file present but unparseable) is caught and re-raised via `this.error(..., { exit: EXIT_CODES.ERROR })` naming the offending file, **before any write** -- a corrupt config must never let compile run config-less and resurrect every built-in agent.
2. Error `ERROR_MESSAGES.NO_INSTALLATION` if neither installation found
3. `resolveAndLogSource(cwd)` -- `resolveSource({ caller: "stored", projectDir: cwd })` from configuration, logs `Source: <sourceOrigin>`. `compile` takes no `--source`: it recompiles an installation that already records which marketplace its skill references answer to.
4. `loadAgentDefsOrFail()` -- **Operation: `loadAgentDefs({ projectDir })`**
5. `buildCompilePasses()` -- the single pass this invocation owns. A project installation at `cwd` returns the project pass (`projectDir = cwd`) alone: a compile inside a project is a project-scope operation and writes nothing outside that project. Otherwise -- at the home directory, or in a directory with no config of its own -- the global pass (`projectDir = os.homedir()`) is returned. The project pass carries `scopeFilter: "project"` when `hasBoth`, because the project config inlines the global entries and an unfiltered pass would write global-scoped agents into the project's own agents directory; the global pass is unfiltered.
6. For each pass (`runCompilePass`):
   a. `discoverAllSkills()` -- **Operation: `discoverInstalledSkills(projectDir)`**
   b. If `totalSkillCount === 0`: log `No skills found for <label> pass, skipping`, still run `refreshConfigTypes()`, and return `false`. The config loads independently of discovered skills, so a hand-edited `config.ts` listing skills with nothing installed for that scope must still get fresh unions.
   c. `warnUnresolvedStackSkills()` -- emits `this.warn()` for each configured stack skill absent from disk (excluded ids filtered via `effectivelyExcludedSkillIds`); such skills are dropped from the recompiled agents rather than silently omitted
   d. **Operation: `compileAgents({ projectDir, sourcePath, skills, pluginDir, outputDir, scopeFilter })`**
   e. When the pass compiled zero agents and `label === "Project"`, `hintGlobalScopedAgents()` counts the config's active `scope === "global"` agents and, if non-zero, prints `globalScopedAgentsHint(count)` after `INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE`
   f. `refreshConfigTypes()`
7. After all passes, if no pass had skills, hard-error `No skills found. Add skills with '<bin> add <skill>' ...` (`EXIT_CODES.ERROR`).

**`config-types.ts` regeneration.** The documented workflow is to hand-edit `config.ts` then run `compile`, so every pass regenerates the type unions for the scope it compiled via `reconcileTypesFromDisk(projectDir, config, { matrix, agents }, { currentProjectDir: cwd })` (`src/cli/lib/config-gate/index.ts`), matching the wizard write path exactly: standalone narrowed unions at global scope, import-and-extend at project scope (`regenerateConfigTypes`). The hand-edited `config.ts` is an input and is never rewritten. Success logs `INFO_MESSAGES.CONFIG_TYPES_REFRESHED`. When `loadProjectConfigFromDir` finds no config the refresh is skipped at verbose level. **Any failure downgrades to a warning** (`configTypesRefreshFailed(reason)`) -- the compiled agents are already written and remain valid; only the unions may be stale.

**A global pass also propagates — and it is the only pass that can.** `compile` at `$HOME` fans the hand-edited global config out to every registered project and recompiles their agents, printing `propagatedRecompileSummary` through the shared `reportPropagatedRecompile()`; unreachable projects are warned via `registeredProjectUpdateSkipped(path)`. The fan-out is unconditional because a hand edit leaves no prior state to classify against, so every registered project's inlined copy must be assumed stale. A `compile` inside a project reaches none of this: it runs no global pass, and `reconcileTypesFromDisk` returns before the fan-out for any non-home `projectDir`. `currentProjectDir: cwd` excludes the directory the command was run from — the command's own subject. `reportPropagation()` runs OUTSIDE the refresh's `catch`, so an unreachable project is reported as that and not as a failed refresh.

The matrix for that refresh is loaded with `loadSkillsMatrixFromSource({ sourceFlag, projectDir, skipExtraSources: true, matrixOnly: true })`. `matrixOnly` skips the `fetchFromSource` clone for the default source (the matrix is the pre-computed `BUILT_IN_MATRIX` anyway) so `compile` stays offline on a cold cache; `sourcePath` comes back empty. `skipExtraSources` is not a divergence from the wizard's fully tagged load -- extra sources only annotate `availableSources`/`activeSource` for wizard UI tagging and the config-types writer never reads them, so the emitted types are byte-identical (pinned by the `skipExtraSources` parity test in `local-installer.test.ts`).

**An unusable `metadata.yaml` refuses the whole run.** `readSkillMetadata` (`src/cli/lib/loading/loader.ts`) is the **single judgment** of whether a `metadata.yaml` describes its skill, shared by `compile`'s discovery, the local-skill discovery behind config-types generation, and `doctor`'s content layer. It refuses both ways of describing nothing — a file nothing can be parsed out of, and a file that parses without the fields `localRawMetadataSchema` requires — returning `SkillMetadataRead` (`{ usable: true; metadata }` or `{ usable: false; reason }`). What each caller does about a refusal differs and the judgment does not: discovery skips the skill, `doctor` reports it, `compile` refuses.

`loadSkillsFromDir` collects each refusal into `LoadedSkills.unusableMetadata` (`UnusableSkillMetadata` = `{ skillDirName, metadataPath, reason }`), non-empty only under `requireMetadata` — a plugin skill carries no `metadata.yaml` to refuse. When `discoverAllSkills()` returns a non-empty list, `refuseUnusableSkillMetadata()` **logs** one `skillMetadataUnusableDetail(entry)` line per file (path plus reason, unwrapped) and then hard-errors with `skillMetadataUnusableError(entries)` (`EXIT_CODES.ERROR`). The detail is logged rather than carried in the error because oclif hard-wraps error text at the terminal width and a path split across two lines cannot be copied. The refusal exists because a skill this file cannot describe is skipped when `config-types.ts` is regenerated, so compiling it would write agents around a skill the generated types never carry.

**Stale built-in agent pruning.** `compileAgents` calls `pruneStaleAgentsForPass` (`src/cli/lib/operations/project/compile-agents.ts`), which removes built-in agent `.md` files no longer compiled into `outputDir`. It runs **only on a scope-UNfiltered pass with an `outputDir`** -- an unfiltered pass owns its entire output directory. A scope-filtered pass (the `hasBoth` project pass, `compileAgentsAllScopes`'s two project-context passes, or the registered-project recompile) sees one scope's roster and must never delete another scope's files, so it skips pruning. Hand-authored agents are preserved by the prune predicate (`pruneStaleCompiledAgents` in `src/cli/lib/agents/list-compiled-agents.ts`).

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`
- `src/cli/lib/configuration/index.ts` -- `resolveSource`, `loadProjectConfig`, `loadProjectConfigFromDir`, `effectivelyExcludedSkillIds`, `ConfigLoadError`
- `src/cli/lib/installation/index.ts` -- `Installation`
- `src/cli/lib/config-gate/index.ts` -- `reconcileTypesFromDisk`, `GateReport`
- `src/cli/lib/loading/index.ts` -- `loadSkillsMatrixFromSource` (with `matrixOnly` + `skipExtraSources`)
- `src/cli/lib/stacks/index.ts` -- `getStackSkillIds`
- `src/cli/utils/messages.ts` -- `configTypesRefreshFailed`, `globalScopedAgentsHint`, `INFO_MESSAGES.CONFIG_TYPES_REFRESHED`

### `list` (src/cli/commands/list.tsx)

**Purpose:** Show installation information (skills, agents, mode, source). Alias: `ls`. Ink-based React component for TTY, plain text fallback for non-TTY.

**Flags:** none

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

**Purpose:** The single "is everything OK?" command. There is no `validate` command; content validation is this command's first layer. It answers in two layers: content validation first, operational diagnosis second.

**Flags:** None (`static flags = {}`) -- diagnostics always run against the current project and the source it records.

**Behavior:** Calls `setVerbose(true)` unconditionally, so output is always verbose.

**Layer 1 -- content checks**, backed by `src/cli/lib/content-validator.ts` and printed under `Content checks`. Five rows in two tiers:

`CONFIG_CHECK` (`doctor.ts`) runs **first and alone**, before the other four. It is the file every other row is read out of, so a config that exists and cannot be parsed is a finding about that file and every row underneath would be a cascade of it. It is also the only report that can carry the loader's own reason -- the layers below re-read the file per check, and their diagnostics for it used to arrive spliced between the rows.

The remaining four are `CONTENT_CHECKS`, run in parallel. Each is a `GatedContentCheck` -- a `ContentCheck` plus `readsConfig`, declaring whether it consults `config.ts` to know WHAT to validate. When the config row failed, every `readsConfig: true` row is replaced by `skippedContentResult(kind)` rather than run; the rows that walk installed content on disk still run, because they say something true whatever state the config is in.

| Row       | `readsConfig`      | Walks                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config`  | — (it IS the gate) | `validateProjectConfigFile`: `countExistingConfigs` over the config dirs in play (the project's own and the global one it inlines) for the count, `findConfigLoadFailures` for the issues. An **absent** config is not a finding -- that is the legitimate state `init` exists for, and the operational layer already names it with the remedy that fits. |
| `Sources` | `true`             | the one source this installation reads from (`resolvePrimarySourceEntry`) when it is LOCAL, plus the cwd when `isSourceRepo(cwd)` and the source does not already resolve to it (D-210: a marketplace author's own repo). A remote source becomes a `-- skipped (remote source)` note.                                                                    |
| `Plugins` | `false`            | `getUserPluginsDir()` and, unless `isHomeDirectory(cwd)`, `getProjectPluginsDir(cwd)`                                                                                                                                                                                                                                                                     |
| `Skills`  | `false`            | every directory under the global and project `skillsDir`, config-referenced or not                                                                                                                                                                                                                                                                        |
| `Agents`  | `false`            | every `*.md` under the global and project `agentsDir`                                                                                                                                                                                                                                                                                                     |

Each returns a `ContentValidation` (`count`, `issues`, `notes`), which `toContentResult` maps onto the same `CheckResult` shape the operational rows use -- so one formatter, one summary, one exit code covers both layers. Issue lines render as `- [ERROR|WARN] <file>: <message>`. `contentMessage` distinguishes a pass that walked nothing (`No <noun>s to validate`) from one that walked entries -- a pass that walked nothing can still report an issue, because an unreadable plugin registry is a finding about the directory rather than about a plugin inside it.

**Layer 2 -- operational checks** (display order): Config Valid, Skills Resolved, Agents Compiled, No Orphans, Skills Installed, Plugins Installed, Source Reachable. `Skills Installed` is the eject-mode on-disk check (`checkSkillsInstalled`); `Plugins Installed` (`checkPluginSkillsInstalled`) verifies the plugin registry grouped by each skill's own scope.

**No Orphans has two verdicts, chosen by `resolveOrphansCheck` off the `ConfigState`.** With a config it is `checkNoOrphans`: the compiled agent files in each scope's `agentsDir` whose roster does not name them, a **warning** -- the next `compile` prunes exactly those (`pruneStaleCompiledAgents`). With an **absent** config it is `checkUnownedInstallation`: every installed skill directory and compiled agent file is unowned by definition, so the row names them all (display paths, one per line) and it is an **error**. Nothing repairs that state unattended -- `compile` and `edit` refuse without a config, and `uninstall` matches skill directories by their own `forked-from` metadata but identifies compiled agents only through a config, so it clears the skills and leaves the agents. Its tip (`kind: "orphans-unowned"`) is the only one that says so; the Config Valid tip beside it speaks about the file, not the leftovers. The names come from `listInstalledArtifacts` (`content-validator.ts`) -- the same two walks the content layer's `Skills` and `Agents` rows counted four lines above. With nothing installed the row keeps the skip: an empty directory with no config is the state `init` exists for. A config that **loads and fails validation** still skips -- there a file's owner is unreadable rather than absent, and no installation can be called stranded on the strength of a config nobody can trust.

**Why the layer runs second and conditionally.** `runOperationalChecks` returns `[]` -- printing one line instead of rows -- in two cases:

| Condition                                                                                | Line printed                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Any content check failed                                                                 | `Skipped -- fix the content errors above first`              |
| No `detectProject()` result, no `.claude-src/config.ts` on disk, and `isSourceRepo(cwd)` | `Skipped -- no installation here (skills source repository)` |

The first is the whole point of the ordering: an unresolved skill or an uncompiled agent standing on a broken `metadata.yaml` is that error's cascade. The second is the marketplace-author context -- one command, two contexts. The `fileExists` half of the second condition matters: a config that exists but fails to load also detects as "no project", and that is a finding, not an absence, so it still reaches the operational layer.

**Exit code:** one aggregate. `EXIT_CODES.ERROR` when any check in either layer has status `fail`; warnings never fail the run.

**Plugin pass -- claude CLI v2 registry.** `validatePluginsDirectory` (`src/cli/lib/content-validator.ts`) first probes `getInstalledPluginsRegistryPath(pluginsDir)` (`installed_plugins.json`, the claude CLI >= 2.1.220 cache layout). When that file exists, `validateRegistryPlugins` reads it via `listRegisteredPluginInstalls` and runs `validatePlugin(installPath)` against **each recorded install path**. Behaviour:

| Registry state              | Outcome                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Absent                      | Falls through to the direct-children scan (`findPluginDirectories` + `validateAllPlugins`)                                         |
| Present but records zero    | `validateRegistryPlugins` returns `undefined`; caller falls back to the direct-children scan                                       |
| Present with records        | Each recorded `installPath` validated; a path that no longer exists is an **invalid plugin**                                       |
| Unreadable / schema-invalid | `listRegisteredPluginInstalls` throws; counted as **1 error against the registry file itself** (count stays 0), not scanned around |

**Skill metadata -- advisory over-length `cliDescription`.** `validateInstalledSkillMetadata` parses `metadata.yaml` with `parseYaml`, runs `validateSkillMetadata()`, and on failure splits the issues with `splitMetadataValidationIssues(result.error, rawMetadata)` from `src/cli/lib/schemas.ts`. An over-length `cliDescription` (> `CLI_DESCRIPTION_MAX_LENGTH`) is downgraded to a **warning carrying the actual length** -- the runtime schemas accept any length and the value only feeds wizard description text, while the strict schema keeps `max(60)` as the declared contract. An empty or missing `cliDescription`, and every other issue, stays an **error**. `valid` is `errors.length === 0`, so an advisory warning alone no longer fails the run. `validateSource()` applies the same split for source-repo skills.

**Directory-name rule.** Enforced during source validation by `checkSkillDirName` (`src/cli/lib/source-validator.ts`), which compares the directory name against the skill's **machine id read from `SKILL.md` frontmatter** (`parseFrontmatter(...).name`), not `displayName`. It runs independently of whether the metadata validated. Missing/invalid frontmatter, or an unreadable `SKILL.md`, produces a warning (`Cannot verify directory name '<dir>': ...`) rather than an error. Comparing `displayName` was unsatisfiable under the marketplace convention -- human display names living in `<domain>-<category>-<slug>` directories.

**Parse-failure causes -- reported in one phase, not the other.** Two `catch` blocks in `src/cli/lib/source-validator.ts` bound the error and discarded it, in the command whose entire purpose is telling you what is wrong with your source repo. Both now interpolate `getErrorMessage(error)`:

| Site                                                      | Message emitted                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `validateSource` -- skill `metadata.yaml` parse           | `Failed to parse YAML: <cause>` (severity `error`) -- was losing a `YAMLParseError`'s line/column   |
| `validateSource` -- categories/rules cross-reference load | `Cross-reference validation skipped: failed to load categories/rules: <cause>` (severity `warning`) |

> **Known inconsistency -- the same sentence carries a cause from one phase and not the other.** `validateYamlFiles` (`src/cli/lib/source-validator.ts`) still emits a bare `Failed to parse YAML` with **no cause**, from a bare `catch {`. It has exactly three call sites, all in the optional source-repo phases: `validateStacks` (stack skill `metadata.yaml`, and `*/config.yaml`) and `validateAgents` (agent `metadata.yaml`). `validateConfigFiles` does **not** route through it -- it runtime-loads `.ts` config files via `validateTsConfig`, whose own `catch` already reports through `formatLoadError`.
>
> No linter can see this one: with no bound variable there is no unused-binding signal, and a linter can only ever catch the bound-and-discarded variant. Do not read the presence of a cause on a `Failed to parse YAML` line as diagnostic of which file failed; it is diagnostic of which _phase_ produced it.

**Key dependencies:** **Operation: `detectProject()`**, **Operation: `loadSource()`**. Uses `validateProjectConfig()` from configuration, `discoverLocalSkills()` from skills, `getStackSkillIds()` from stacks, `isSourceRepo()` from source-validator, `getProjectConfigPath()` from configuration, and the five pass functions from `src/cli/lib/content-validator.ts` (`validateProjectConfigFile`, `validateRegisteredSources`, `validateInstalledPlugins`, `validateInstalledSkills`, `validateInstalledAgents`), which in turn use `findConfigLoadFailures()`, `validateSource()`, `validatePlugin()`/`validateAllPlugins()`, `validateSkillFrontmatter()`, `validateAgentFrontmatter()`, `listRegisteredPluginInstalls()`, `validateSkillMetadata()`/`splitMetadataValidationIssues()` and `listAgentMdFiles()`.

### `eject` (src/cli/commands/eject.ts)

**Purpose:** Eject skills, agent partials, or templates for local customization.

**Args:**

| Arg  | Required | Description                                                   |
| ---- | -------- | ------------------------------------------------------------- |
| type | no       | What to eject: `agent-partials`, `templates`, `skills`, `all` |

**Flags:**

| Flag     | Short | Type    | Description                          |
| -------- | ----- | ------- | ------------------------------------ |
| --force  | -f    | boolean | Overwrite existing files             |
| --output | -o    | string  | Output directory (default: .claude/) |

`eject` declares no `--source`. It copies out of whatever source this installation reads (`resolveSource({ caller: "stored", … })` — the project config, then the global one, then the default) and records that source in the config it may invent; accepting a per-run override would let it eject from one source while recording another. `CC_SOURCE` does not steer it either: the environment names a source at install time only.

**Key dependencies:** **Operation: `loadSource()`**. Uses `resolveSource()`, `loadProjectSourceConfig()` from configuration; `ensureBlankPair()`, `mutateGlobal()`, `writeProjectPartial()`, `lazyGateDeps()` from the config-gate; `copySkillsToLocalFlattened()` from skills.

**Config writes are scope-branched through the config-gate.** `recordSource()` and `ensureMinimalConfig()` each branch on `isHomeDirectory(projectDir)`:

| Scope       | `recordSource`                                                                                                                    | `ensureMinimalConfig` (create-only-if-absent)                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `$HOME`     | `mutateGlobal({ kind: "set-source", ... })` — registered projects inline the scalar, so the gate fans the config half out to them | `ensureBlankPair()` then `recordSource()`                              |
| project dir | `writeProjectPartial(projectDir, { ...existing, source })`                                                                        | `writeProjectPartial(...)` with the resolved source/marketplace/author |

**Behaviour change: `eject` at `~` now writes the `config-types.ts` sibling.** The invented config's first line is `import type { ProjectConfig } from "./config-types"`, which could not resolve because the old `ensureBlankGlobalConfig` wrote `config.ts` alone. `ensureBlankPair()` writes both halves. The `"Source saved to…"` / `"Created…"` lines and the create-only-if-absent rule are unchanged.

### `search` (src/cli/commands/search.ts)

**Purpose:** Read-only catalog browse. Searches every registered source (primary + extras) by id, displayName, slug, description, or category. Prints a table via `@oclif/table`. Installing a found skill is the wizard's job (`init` / `edit`).

**Args:**

| Arg   | Required | Description                                                         |
| ----- | -------- | ------------------------------------------------------------------- |
| query | yes      | Search query (matches id, displayName, slug, description, category) |

**Flags:** None (`static flags = {}`) -- a zero-flag command that reads whatever source the installation is configured with.

**Key dependencies:** **Operation: `loadSource()`**, and nothing else — the matrix it returns already carries the local skills merged in, so the whole catalog is one load. `printTable()` from `@oclif/table` renders it.

### `uninstall` (src/cli/commands/uninstall.tsx)

**Purpose:** Remove CLI-managed skills, compiled agents, plugins, **and the `.claude-src/` config manifest** (`config.ts` + `config-types.ts`). User-created content is preserved.

**Flags:**

| Flag  | Short | Type    | Description              |
| ----- | ----- | ------- | ------------------------ |
| --yes | -y    | boolean | Skip confirmation prompt |

> **`--all` was removed (breaking).** `static flags` is `{ yes }` — there is no `all` key, and oclif rejects the flag. Manifest removal is unconditional: plain `uninstall` does what `--all` did. Leaving `config.ts` + `config-types.ts` behind made a "successful" uninstall leave the project looking installed.

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
4. **Global uninstall:** `updateRegisteredProjects(propagation)` and return. **Project uninstall:** `mutateGlobal({ kind: "deregister-project", projectDir }, lazyGateDeps(projectDir))`.

**Config manifest + directory cleanup.** `removeConfigManifest` deletes `config.ts` and `config-types.ts` from `.claude-src/`, then `removeDirIfEmpty(claudeSrcDir)` removes `.claude-src/` **only when it is empty afterwards** -- user-owned content there (e.g. ejected templates) keeps the directory alive. Logging: `Removed .claude-src/` when the directory went, otherwise `Removed CLI config from .claude-src/`. `.claude/` is removed only when empty, else `Kept .claude/ (contains user content)`.

**Project uninstall -- deregistration.** Always calls `config-gate::mutateGlobal({ kind: "deregister-project", projectDir })` so future global edits stop propagating back into a removed project. Failure is **warned, not swallowed**: `Could not update the global project registry: <reason>`. A missing, project-less, or corrupt (`ConfigLoadError`) global config must never fail the uninstall. **The uninstall stays offline:** a `projects[]`-only change is classified as having no consequences, so the lazy matrix/agent loaders handed to the gate are never called, and the types half is not rewritten (nothing derives a union from the registration list).

**Global uninstall -- prune AND recompile.** `updateRegisteredProjects` calls `config-gate::propagateGlobalRemoval(propagation.globalConfig, { matrix, agents })`, which prunes the CLI-inlined global rows from every registered project and **recompiles those projects' agents** — they were compiled against the rows this uninstall just removed. It writes no pair (the pair it would derive from has just been deleted, which is why it is a dedicated entry point rather than a flag on a writing one). Rendering order: one `registeredProjectUpdateSkipped(path)` warn per skipped project, then `registeredProjectsUpdated(n)`, then each recompile warning, then `propagatedRecompileSummary` — `Recompiled agents in N registered projects, M unchanged`, with a ` (K failed)` suffix. Any throw becomes `registeredProjectsUpdateFailed(reason)` — a failure here must never abort the uninstall.

**Corrupt PROJECT config -- uninstall proceeds.** `loadUninstallConfig(projectDir, onLoadFailed)` wraps the `loadProjectConfigFromDir` call in `detectUninstallTarget`:

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

**Key dependencies:** `listPluginNames()`, `getProjectPluginsDir()`, `buildMarketplacePluginRef()`, `parseMarketplacePluginRef()`, `toClaudePluginScope()` from plugins. `readForkedFromMetadata()` from skills. `loadProjectConfigFromDir()` from configuration. `lazyGateDeps()`, `mutateGlobal()`, `propagateGlobalRemoval()` from the config-gate. `isHomeDirectory()`, `resolveInstallPaths()` from installation. `loadSkillsMatrixFromSource()` from loading. **Operation: `loadAgentDefs()`**. `listAgentMdFiles()` from agents. `claudePluginUninstallBestEffort()`, `isClaudeCLIAvailable()` from exec. `promptConfirm()` from `components/common/prompt-confirm.tsx`, `Confirm` from `components/common/confirm.tsx`. `registeredProjectsUpdated()`, `registeredProjectUpdateSkipped()`, `registeredProjectsUpdateFailed()` from `utils/messages.ts`.

### `update` (src/cli/commands/update.ts)

**Purpose:** Run Claude's own marketplace update for every marketplace this installation uses, and nothing else.

**Args:** none. **Flags:** none — `static flags = {}`. A plain refresh confirms nothing and reads no skills source, so neither `--yes` nor `--source` has anything to mean.

**Flow (`run`):**

1. `loadInstalledConfig(cwd)` — `loadProjectConfig()`, which reads the project's own config and falls back to the home one. `null` (no config anywhere) warns `ERROR_MESSAGES.NO_INSTALLATION` and returns **successfully**; a `ConfigLoadError` is a fault, not an absence, and hard-errors (`EXIT_CODES.ERROR`) naming the file.
2. Filter the config's skills to the active ones (`!excluded`).
3. `reportEjectedSkills()` — logs `INFO_MESSAGES.EJECTED_SKILLS_USER_OWNED` once when any active entry has `source === EJECT_SOURCE`. Informational, never a warning.
4. `configuredMarketplaces()` — the deduplicated non-`EJECT_SOURCE` `source` values, in config order. Empty logs `INFO_MESSAGES.NO_PLUGIN_MARKETPLACES` and returns successfully.
5. `requireClaudeCli()` — `isClaudeCLIAvailable()`, else hard-error `ERROR_MESSAGES.CLAUDE_CLI_NOT_FOUND`.
6. `refreshMarketplaces()` — one `claudePluginMarketplaceUpdate(name)` per marketplace, in sequence. Each failure is warned with its cause (`marketplaceRefreshFailed`) and collected; a non-empty collection hard-errors with `marketplacesRefreshFailed(names)`. Otherwise `marketplacesRefreshed(count)`.

**Ejected skills are not this command's business.** Eject means the user owns the copy, so `update` never reads a skills source, compares a content hash, or rewrites a skill directory. The step-3 line is the whole of what it says about them.

**No recompile and no registered-project fan-out.** A compiled sub-agent references a plugin skill by pointer, so refreshed marketplace content lands without any compiled agent changing. There is nothing to recompile at the cwd and nothing to propagate outward, which is why this command touches neither `compileAgents` nor the config-gate.

**The Claude-CLI check is gated on there being work for it.** An eject-only installation returns at step 4 and so never calls `isClaudeCLIAvailable()` — a missing Claude CLI cannot fail a run that had no reason to shell out.

**Key dependencies:** `loadProjectConfig()` from configuration; `claudePluginMarketplaceUpdate()`, `isClaudeCLIAvailable()` from `utils/exec`; `EJECT_SOURCE` from consts. It uses **no operation** — the operations layer covers source loading, comparison and compilation, none of which this command does.

## Build Subcommands

### `build marketplace` (src/cli/commands/build/marketplace.ts)

**Purpose:** Generate marketplace.json from built plugins for plugin distribution.

**Flags:** no `--source` -- it reads from the local plugins directory, not a remote source.

| Flag          | Short | Type    | Description                                              |
| ------------- | ----- | ------- | -------------------------------------------------------- |
| --name        |       | string  | Marketplace name override (must be kebab-case)           |
| --plugins-dir | -p    | string  | Plugins directory (default: `dist/plugins`)              |
| --output      | -o    | string  | Output file (default: `.claude-plugin/marketplace.json`) |
| --verbose     | -v    | boolean | Enable verbose logging                                   |

**Key dependencies:** `generateMarketplace()`, `writeMarketplace()`, `getMarketplaceStats()` from marketplace-generator.

### `build plugins` (src/cli/commands/build/plugins.ts)

**Purpose:** Build skills and agents into standalone plugins. Skills directory is read from the `DIRS.skills` constant; not configurable via flag.

**Flags:** no `--source` -- `build plugins` reads from local `DIRS.skills`, not a remote source.

| Flag         | Short | Type    | Description                                |
| ------------ | ----- | ------- | ------------------------------------------ |
| --agents-dir | -a    | string  | Agents source directory (optional)         |
| --output-dir | -o    | string  | Output directory (default: `dist/plugins`) |
| --skill      |       | string  | Path to skill directory                    |
| --verbose    | -v    | boolean | Enable verbose logging                     |

**Stale-plugin pruning:** After a full-scan clean compile, `pruneStaleSkillPlugins()` removes skill-plugin directories under the output dir that no longer correspond to a compiled skill. A candidate is confirmed a skill plugin via `readPluginManifest()`: directories whose manifest declares `agents` are preserved (agent plugins are out of scope for this run) and directories without a manifest are left untouched. Pruning is **skipped** (the private `compileSkills()` helper returns `null`) in two cases: `--skill` targets a single skill (pruning would wipe every other plugin), or any skill fails to compile (a failed skill is indistinguishable from a removed one). Each removed directory logs `Pruned stale plugin: <name>`.

**Key dependencies:** `compileAllSkillPlugins()`, `compileSkillPlugin()`, `printCompilationSummary()` from skills. `compileAllAgentPlugins()`, `printAgentCompilationSummary()` from agents. `readPluginManifest()` from plugins. `listDirectories()`, `remove()` from `utils/fs`.

> **`build stack` was removed.** Only `build marketplace` and `build plugins` exist under `src/cli/commands/build/`; stack-to-plugin compilation goes through the marketplace/plugins build pipeline.

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

Four constant objects, enumerated exhaustively:

| Object             | Members                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_MESSAGES`   | `UNKNOWN_ERROR`, `UNKNOWN_ERROR_SHORT`, `NO_INSTALLATION`, `NO_SKILLS_FOUND`, `VALIDATION_FAILED`, `FAILED_RESOLVE_SOURCE`, `FAILED_LOAD_AGENT_PARTIALS`, `FAILED_COMPILE_AGENTS`, `CLAUDE_CLI_NOT_FOUND`                                                                             |
| `SUCCESS_MESSAGES` | `UNINSTALL_COMPLETE`, `INIT_SUCCESS`, `PLUGIN_COMPILE_COMPLETE`                                                                                                                                                                                                                       |
| `STATUS_MESSAGES`  | `INSTALLING_PLUGINS`, `LOADING_SKILLS`, `LOADING_MARKETPLACE_SOURCE`, `RECOMPILING_AGENTS`, `COMPILING_AGENTS`, `DISCOVERING_SKILLS`, `RESOLVING_SOURCE`, `RESOLVING_MARKETPLACE_SOURCE`, `LOADING_AGENT_PARTIALS`, `FETCHING_REPOSITORY`, `COPYING_SKILLS`, `UPDATING_PLUGIN_SKILLS` |
| `INFO_MESSAGES`    | `NO_CHANGES_MADE`, `RUN_COMPILE`, `NO_AGENTS_TO_RECOMPILE`, `NO_PLUGIN_INSTALLATION`, `NO_LOCAL_INSTALLATION`, `NOT_INSTALLED`, `CONFIG_TYPES_REFRESHED`, `EJECTED_SKILLS_USER_OWNED`, `NO_PLUGIN_MARKETPLACES`                                                                       |

The same module exports these **message builder functions** for messages that interpolate a count, path, name or reason. No other function is exported from it:

| Function                                 | Called from            | Purpose                                                                                  |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `pluginsInstalled(count)`                | `base-command.ts`      | Summary after a plugin install step                                                      |
| `propagatedRecompileSummary(...)`        | `base-command.ts`      | `Recompiled agents in N registered projects, M unchanged`, with its ` (K failed)` suffix |
| `configUnreadableError(...)`             | `base-command.ts`      | The `ensureConfigReadable` refusal, naming the file, the reason and two ways forward     |
| `recompileSummary(...)`                  | `edit`, `compile`      | Per-run agent recompile summary                                                          |
| `globalScopedAgentsHint(count)`          | `compile`              | Names the global-scoped agent count after a zero-agent project pass                      |
| `configTypesRefreshFailed(reason)`       | `compile`              | Warns that `config-types.ts` unions may be stale                                         |
| `skillMetadataUnusableDetail(entry)`     | `compile`, `edit`      | One logged `<dir> — <path>` + reason line per unusable `metadata.yaml`                   |
| `skillMetadataUnusableError(entries)`    | `compile`              | `compile`'s refusal, naming the skills it discovered                                     |
| `savedSkillMetadataUnusableError(...)`   | `base-command.ts`      | `ensureSavedSkillsReadable`'s pre-wizard refusal over a SAVED entry's installed skill    |
| `marketplacesRefreshed(count)`           | `update`               | Summary after refreshing every configured marketplace                                    |
| `marketplaceRefreshFailed(name, reason)` | `update`               | Warns one marketplace that would not refresh                                             |
| `marketplacesRefreshFailed(names)`       | `update`               | The hard error naming every marketplace that failed                                      |
| `registeredProjectsUpdated(count)`       | `uninstall`            | Summary after pruning registered projects                                                |
| `registeredProjectUpdateSkipped(path)`   | `compile`, `uninstall` | Warns one unreachable registered project                                                 |
| `registeredProjectsUpdateFailed(reason)` | `uninstall`            | Warns that no registered project could be updated                                        |
| `sharedConfigExistingInstall(...)`       | `init`                 | The `--from` refusal on an existing project installation                                 |
| `sharedConfigGlobalInstall(...)`         | `init`                 | The `--from` refusal on a blocking global installation                                   |

## Operations Layer Usage by Command

| Command     | Operations Used                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | `loadSource`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs` (plugin install via `installPluginSkillsReported`, marketplace via `requireMarketplaceOrExit`)                                           |
| `edit`      | `detectProject`, `loadSource`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs` (plugin install via `installPluginSkillsReported`, marketplace via `requireMarketplaceOrExit`) |
| `compile`   | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                                               |
| `doctor`    | `detectProject`, `loadSource`                                                                                                                                                                                                                                        |
| `eject`     | `loadSource`                                                                                                                                                                                                                                                         |
| `search`    | `loadSource`                                                                                                                                                                                                                                                         |
| `update`    | (none -- wraps `claude plugin marketplace update` via `utils/exec`, reading its marketplace list from `loadProjectConfig`)                                                                                                                                           |
| `list`      | (none -- uses installation, configuration, plugins directly)                                                                                                                                                                                                         |
| `uninstall` | `loadAgentDefs` (global-uninstall propagation prep; everything else via lib functions directly)                                                                                                                                                                      |
| `build *`   | (none -- uses skill/agent compilers directly)                                                                                                                                                                                                                        |
