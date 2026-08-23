---
scope: reference
area: commands
keywords:
  [
    init,
    edit,
    compile,
    doctor,
    build,
    new,
    new-marketplace,
    eject,
    list,
    search,
    share,
    uninstall,
    update,
  ]
related:
  - reference/architecture-overview.md
  - reference/features/wizard-flow.md
  - reference/features/operations-layer.md
  - reference/features/compilation-pipeline.md
  - reference/commands/edit.md
  - reference/utilities.md
last_validated: 2026-08-18
---

# Commands Reference

## Command Architecture

All commands extend `BaseCommand` (`src/cli/base-command.ts`).

**No flag is shared by all commands.** `BaseCommand` declares no `baseFlags`: the marketplace flag
was the only one it ever held, and naming a marketplace is `init`'s decision alone, so
`--marketplace` / `-m` is declared in `init`'s own `static flags` and every other command refuses it
(`Nonexistent flag`, exit 2). Every command after `init` resolves the marketplace that install
recorded — project config → global config → default.

> **`--source` / `-s` were withdrawn and have no alias.** Nothing reads either spelling: oclif
> refuses them at parse, because no command declares either spelling and none carries them as an
> alias. The replacement is `--marketplace` / `-m` on `init`. Pre-1.0 aliases nothing, so a run that
> types the old flag names no marketplace rather than quietly choosing one.

**Operations layer:** Commands use composable operations from `src/cli/lib/operations/index.ts` as the primary interface to lower-level lib functions. Commands should not bypass operations for functionality that an operation covers. See `reference/features/operations-layer.md` for full operations documentation.

### The shared narration surface lives on `BaseCommand`, not on each command

A statement about one operation is written once. Every member below is `protected` on `BaseCommand`; a command that performs the operation calls the shared reporter rather than spelling its own wording, because four copies of the same sentence had already drifted into two spellings of it.

| Member                                                                 | Callers                                | What it guarantees                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureConfigReadable(projectDir)`                                     | `init`, `edit`                         | Refuses before anything renders when a config file exists but throws `ConfigLoadError`. Checks the project's own config AND the global one every project write inlines.                                                                                                |
| `ensureSavedSkillsReadable(savedSkills, matrix, projectDir)`           | `edit`                                 | One layer below the above: refuses, still before the wizard mounts, when a saved entry the catalogue lacks names a local skill that IS installed and whose `metadata.yaml` describes no skill. See `concepts/guard-pattern.md` #11                                     |
| `refuseProjectScopedContentAtHome(result, projectDir)`                 | `init --from`, `edit --from`           | Refuses a DECODED selection carrying a project-scoped skill or sub-agent when `isHomeDirectory(projectDir)`, via `sharedConfigProjectScopeAtHome`. Both `--from` producers call it at the same point — after the decode, before any skip warning and before any write  |
| `reportValidationErrors(validation)`                                   | `init`, `edit`                         | Warns each `SelectionValidation.errors` entry. Advisory — the selection installs either way and no exit code turns on them.                                                                                                                                            |
| `installPluginSkillsReported(skills, marketplace, projectDir, matrix)` | `init`, `edit`                         | `unbackedPluginInstallError` refusal + `announcePluginInstall()` + `installPluginSkills()` + `reportPluginInstalls()`. The matrix argument is what makes the first refusal possible before the Claude CLI is asked anything                                            |
| `announcePluginInstall()`                                              | eject→plugin migration                 | The opening half alone, for the caller whose install belongs to `executeMigration`                                                                                                                                                                                     |
| `reportPluginInstalls(result)`                                         | the two above                          | Per-skill lines, then the hard error on any `failed` — before any config records a marketplace `origin` for a skill with no plugin registration                                                                                                                        |
| `reportUnassignedSkills(config)`                                       | `init`, `edit`                         | Names every selected skill this save left in no sub-agent's stack, and the sub-agents the scope rule kept it away from                                                                                                                                                 |
| `reportPropagatedRecompile(report)`                                    | `init`, `edit`, `compile`, `uninstall` | Renders the recompile a gated write already performed on every OTHER registered project. Early-returns on empty `propagated.updated`.                                                                                                                                  |
| `requireMarketplaceOrExit(...)`                                        | `init`, `edit`                         | Resolves the marketplace or hard-exits. **No fallback to eject.**                                                                                                                                                                                                      |
| `reportIncompleteWork(what, recovery)` / `recordIncompleteWork(...)`   | `init`, `edit`, `eject`                | Warns where the failure is explicable AND records it for the ending; the recording half alone is for a caller that has already printed its own per-item reasons. Never aborts — every caller sits past the mutation it is reporting on                                 |
| `hasIncompleteWork` / `exitIfWorkIncomplete()`                         | `init`, `edit`, `eject`                | The third ending. `hasIncompleteWork` is what withdraws each command's success line; `exitIfWorkIncomplete()` prints `completedWithFailures()` and exits `EXIT_CODES.COMPLETED_WITH_FAILURES`. A command that records and never calls it exits 0 over its own failures |
| `ensureTerminalSize()`                                                 | every command (via `init()`)           | Blocks below `MIN_TERMINAL_SIZE`, waiting on `resize` plus a 500ms poll for terminals that resize without emitting one                                                                                                                                                 |

### Every Ink render goes through `src/cli/components/render.ts`

A command that draws an Ink tree imports `render` from `../components/render.js`, **never `from "ink"`**. `render.ts` is the only file in `src/` that imports Ink's own `render`, and the wrapper exists for one rule: when the destination stream is a TTY it passes `interactive: true`, so a genuine terminal beats Ink's CI-environment guess; when it is not (piped output, redirected logs, CI without a terminal) it passes nothing and Ink's own detection stands. An explicit `interactive` from the caller wins — the spread order guarantees it.

The failure the rule prevents is not cosmetic: under its CI guess Ink buffers every frame and writes only at exit, so a screen awaiting input is never painted. That hung one CI run for 49 minutes, because the E2E harness hands the child a real pseudo-terminal while the runner's environment says `CI`. The harness deliberately passes `CI` / `GITHUB_ACTIONS` through for that reason — see [`testing/harness-decisions.md`](../testing/harness-decisions.md).

The five call sites are `commands/init.tsx`, `commands/edit.tsx`, `commands/list.tsx`, `components/common/prompt-confirm.tsx` and `components/wizard/run-wizard-session.tsx`. `render.ts` is a `.ts` file under `components/`, so it is not a tsup entry (the components glob is `*.tsx`) — it is bundled transitively into each command's chunk. See [`build-and-packaging.md`](../build-and-packaging.md) §2.

## Init Hook (src/cli/hooks/init.ts)

The single oclif lifecycle hook, registered in `package.json` under `oclif.hooks.init` (`./dist/hooks/init`). It runs **before every command** and has one responsibility.

**Bare-`cc` dashboard.** When invoked with no command (`options.id === undefined`) in an already-initialized project, it calls `runDashboardFlow(process.cwd(), options.config, "standalone")` (exported from `src/cli/commands/init.tsx`) with `DashboardOrigin` `"standalone"`. If a dashboard was shown, it calls `this.exit(EXIT_CODES.SUCCESS)` -- the bare invocation never falls through to a command. A `"standalone"` Edit selection carries no `--project-setup` flag (contrast the `init`-originated dashboard, whose Edit selection does).

**Key dependencies:**

- `src/cli/commands/init.tsx` -- `runDashboardFlow`
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
| `share`             | `src/cli/commands/share.ts`             | ts   | Share this installation as an id anyone can install                            |
| `uninstall`         | `src/cli/commands/uninstall.tsx`        | tsx  | Uninstall from project or global scope (always removes the config manifest)    |
| `update`            | `src/cli/commands/update.ts`            | ts   | Refresh the marketplaces this installation uses                                |
| `build marketplace` | `src/cli/commands/build/marketplace.ts` | ts   | Generate marketplace.json from built plugins                                   |
| `build plugins`     | `src/cli/commands/build/plugins.ts`     | ts   | Build skill/agent plugins                                                      |
| `new marketplace`   | `src/cli/commands/new/marketplace.ts`   | ts   | Scaffold a marketplace of your own                                             |

Thirteen commands, in two topics (`build`, `new`) plus eleven at the root. `list` is reachable under
two names — `list` and the `ls` alias — so `--help` prints fourteen rows for thirteen classes. The
roster is `src/cli/commands/**` and nothing else: `oclif.commands.strategy` is `"pattern"` over
`./dist/commands`, so a file under that tree IS a command and a command is nothing else.

**The table above is bound to that tree.** `scripts/check-enumeration-drift.ts` holds a row reading
the directory and comparing its ids against this table's first column, in both directions — a
command added without a row here, or a row naming a file that has gone, fails the check by name.
Nothing declares an id, so the reader derives each from the path with the extension off and
`oclif.topicSeparator` between the segments. **It reads the TREE, not `--help`**, which is why `ls`
is deliberately not a member: an alias is discovered by oclif in a built `dist/` and would make
`list` two rows for one class, and a `--help` diff needs the binary while this row runs in the same
source-reading pass as its neighbours.

> **Three commands were removed and none has a replacement invocation.** `import skill`, `new skill` and `new agent` no longer parse — oclif exits `127` on each (asserted as `EXIT_CODES.UNKNOWN_COMMAND` in `e2e/pages/constants.ts`; `src/cli/lib/exit-codes.ts` does not define it, because no command of ours returns it). There is no `src/cli/commands/import/` directory, and there is no `--` flag or subcommand that stands in for them; authoring a skill or an agent is done in the marketplace repository. `new skill` is tracked to return in `todo/cli.md`; `new agent` is not. `generateMarketplace()` survived the deletion because `build marketplace` calls it — do not read its presence as the command's.
>
> **`new marketplace` is NOT one of them — it is live.** `src/cli/commands/new/marketplace.ts` exists, `agents-inc new marketplace --help` exits `0`, and `new` is a topic in the root help output. It has its own E2E arc (`e2e/commands/new-marketplace.e2e.test.ts`) and is journey 35 in `standards/e2e/user-journeys.md`. Its section is [below](#new-subcommands).

## Primary Commands (Detailed)

### `init` (src/cli/commands/init.tsx)

**Purpose:** Interactive wizard to set up skills and agents in a project. When run in an already-initialized project, shows a dashboard with quick actions (Edit, Compile, Doctor, List).

**Flags:**

| Flag               | Type   | Description                                                                    |
| ------------------ | ------ | ------------------------------------------------------------------------------ |
| --marketplace (-m) | string | Skills marketplace path or URL — **the only command that declares it**         |
| --from             | string | Install a configuration shared from agentsinc.sh by its id, without the wizard |

> **`init` is one spine with two producers.** `--from <id>` fetches a shared seed payload and converts it to a `WizardResultV2` (`selectionFromSharedConfig`); a bare `init` runs the wizard (`selectionFromWizard`). Everything after the producer — the empty guard and the whole install pipeline — is identical. `--from` also bypasses the dashboard diversion, because an id is an explicit instruction rather than a request to be shown around — but it does **not** install over what it finds: it is greenfield-only and refuses an existing installation with a message naming `uninstall`. It also refuses a payload carrying project-scoped skills or sub-agents when run at the home directory — a refusal about the LOCATION rather than about anything already installed there, so its message names a project directory as the way out and never `uninstall`. A payload may also NAME the marketplace its skills come from — `sharedConfigSourceFlags` resolves `flags.marketplace ?? payload.marketplace`, so an explicit `--marketplace` outranks it and an absent one puts the load back on the rungs it always walked. Wire contract, mapping and all three refusals: [features/seed-contract.md](../features/seed-contract.md).

**Flow:**

0. `BaseCommand.ensureConfigReadable(projectDir)` -- refuses when a config file exists but cannot be loaded, before any route below reads it. See "Unreadable configs are recreated, not edited" under `edit`.
1. `showDashboardIfInitialized(projectDir)` -- **skipped entirely when `--from` is present.** delegates to `runDashboardFlow(projectDir, config, "init", log)`. `detectInstallation()` detects an existing install; if found, `showDashboard()` renders the Dashboard component with quick actions (Edit/Compile/Doctor/List), then `config.runCommand(selected, argv)` delegates. The dashboard passes its origin: an `init`-originated Edit selection carries the hidden `--project-setup` flag (`dashboardCommandArgv()`); a bare-`cc` (`"standalone"`) Edit carries none. In non-interactive (no TTY): prints `formatDashboardText()` and returns null. Returns before the wizard when a dashboard was shown.
2. If not initialized: `loadWizardInputsUnderSpinner(flags)` renders `<Spinner label={STATUS_MESSAGES.LOADING_SKILLS} />` and awaits `loadSourceOrFail(flags)` -- **Operation: `loadSource()`** loads the skills matrix (with startup message capture). The spinner is taken down in a `finally` and never a `catch`: a source that cannot be loaded refuses the run from inside that await, and the throw has to reach oclif untouched or both the error rendering and the exit code change with it. **Nothing on this path reads a config of any scope** -- see below.
3. Producer: `selectionFromSharedConfig(flags.from, flags, projectDir)` when `--from` is set, else `selectionFromWizard(flags, projectDir)` -- the latter hydrates the wizard store and renders `<Wizard>` via `runWizardSession()` (not a direct `render()` + `waitUntilExit()`). A `null` selection exits `EXIT_CODES.CANCELLED`. The `--from` producer opens with `refuseInstalledProject(projectDir)` (project-scoped detection, before the fetch) and, once the payload is decoded, runs `refuseProjectScopedContentAtHome(result, projectDir)` then `refuseBlockingGlobalInstall(result)` -- all three `EXIT_CODES.ERROR`. The decode itself hard-errors on a `(project skill, resting-global sub-agent)` pair via `decodeSeedOrFail`.
4. Guard: if `selection.result.skills.length === 0 && selection.result.selectedAgents.length === 0`, `this.error(selection.emptyMessage, { exit: EXIT_CODES.ERROR })`. **Both must be empty** -- a sub-agent is installable on its own, so an agent-only selection with zero skills installs successfully. The producer supplies the wording, because only it knows whether empty means "nothing chosen" or "a payload this catalog cannot install".
5. `handleInstallation()`: `deriveInstallMode()` determines eject/plugin/mixed from active (non-excluded) skills.
6. If plugin/mixed: `requireMarketplaceOrExit()` (BaseCommand) resolves/registers the marketplace up front, BEFORE any filesystem mutation. **No fallback to eject** -- an unresolvable marketplace hard-errors (`EXIT_CODES.ERROR`).
7. If eject/mixed: `copyEjectSkillsStep()` -- **Operation: `copyLocalSkills()`** copies eject-source skills split by scope.
8. If plugin/mixed: `installPluginSkillsReported()` -- **Operation: `installPluginSkills()`**; hard-errors (`pluginInstallFailureError`) on any per-skill failure before config is written.
9. `writeConfigAndCompile()`: **Operation: `writeProjectConfig()`** (writes `.claude-src/config.ts` through the config-gate; `ensureBlankPair()` runs inside this operation, not in the command), **Operation: `loadAgentDefs()`**, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`**, then `reportCompilation(compileResult)` and `reportPropagatedRecompile(configResult.propagation)`. `reportCompilation` prints `Compiled N agents`, appends ` (M failed)` when the pass lost any, re-emits the compiler's own per-agent `warnings`, and records `agentsNotCompiled(failed)` off `failed` — never off `warnings`, which also carries `No agents found to recompile` from a scope with nothing in it on every project-context run.
10. `checkPermissions()` -- render permission warning (Ink) if needed, awaiting `waitUntilExit()`. Reading a settings file takes its `permissions` block and warns about nothing else in it: `settings.json` belongs to Claude Code, so `readSettingsPermissions` (`src/cli/lib/permission-checker.tsx`) judges no field of it. A malformed file still warns and is skipped.
11. `exitIfWorkIncomplete()` -- called from `run()`, which is two statements: `install()` then this. `init` has the same THIRD ending `edit` has. The compile is the last thing it does, so a sub-agent that would not be written cannot be aborted into — the skills are copied and both generated files describe them — and what is owed is the account. A run holding any recorded failure withholds the `initSucceeded()` line, prints `completedWithFailures()` and exits `EXIT_CODES.COMPLETED_WITH_FAILURES`. Until 2026-08-21 this command read `compileResult.compiled` and never `.failed` or `.warnings`, so it printed a count that was correct about successes, claimed success and exited 0 over a roster missing a sub-agent.

**Propagated-project recompile.** `writeProjectConfig` returns `ConfigWriteResult.propagation`, a `GateReport`. The registered projects whose `config.ts` this run's global change fanned into have **already been recompiled by the config-gate**, at project scope with per-project failure isolation; the command only renders. `reportPropagatedRecompile()` (on `BaseCommand`, shared by `init`, `edit`, `compile` and `uninstall`) early-returns on an empty `propagated.updated` (nothing logged), re-emits `recompile.warnings` via `this.warn()`, and prints `propagatedRecompileSummary(rewrittenCount, unchangedCount, failedCount)` — `Recompiled agents in N registered projects, M unchanged`, with a ` (K failed)` suffix when any failed. A project whose agents all came back byte-identical is counted as unchanged rather than as recompiled; see the write-if-changed contract in [`features/agent-system.md`](../features/agent-system.md).

**`init`'s wizard never hydrates from a saved roster, structurally.** `runWizard` calls `runWizardSession({ hydrate: { isEditingFromGlobalScope: isGlobalRoot }, ... })` and hands it no config, no skills and no agents — `isGlobalRoot` is `isHomeDirectory(projectDir)`, and that flag is the whole of the hydration. Step 1's divert makes the question moot as well: `detectInstallation(projectDir)` falls back to `detectGlobalInstallation()` when the project has nothing, so whenever there is a global install to hydrate FROM, the dashboard is shown and `run()` returns before `selectionFromWizard` is reached. `--from` is the only thing that skips the divert, and it routes to `selectionFromSharedConfig`, never to the wizard.

**`edit` is what hydrates a saved roster** — it reads the project config and inlines the global one, which is where behaviour "for `init` with an existing install" belongs. The dashboard's own Edit entry is the route there: an `init`-originated selection runs `edit --project-setup`.

**Not-installed detection.** `detectInstallationInDir` (`src/cli/lib/installation/installation.ts`) returns `null` for a config that declares neither skills nor agents, so a content-less config reads as NOT installed and `init` routes to the setup wizard instead of the dashboard. It also returns `null` when the config file vanished between the `fileExists` probe and the load. A **corrupt** config is different: `loadProjectConfigFromDir` throws `ConfigLoadError`, which propagates to the caller rather than becoming a phantom eject installation.

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `loadSource`, `copyLocalSkills`, `writeProjectConfig` (+ `ConfigWriteResult`), `compileAgentsAllScopes` (+ `CompilationResult`), `discoverInstalledSkills`, `loadAgentDefs`, `SkillCopyResult`
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (wraps `requireMarketplace` operation; no `ensureMarketplace` fallback), `installPluginSkillsReported`, `reportValidationErrors`, `reportPropagatedRecompile`, `ensureConfigReadable`, `recordIncompleteWork`, `hasIncompleteWork`, `exitIfWorkIncomplete`
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

**Purpose:** Modify what is installed here — from the wizard, or from a configuration shared by id — and apply the difference. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, origins, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

**Flags:**

| Flag            | Type    | Description                                                                                                                                  |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| --ui            | boolean | `default: false`. Mint an id for this installation and open it in the browser at agentsinc.sh, instead of opening the wizard                 |
| --from          | string  | `helpValue: "<id>"`. Apply a configuration shared from agentsinc.sh by its id, **removing whatever it leaves out**                           |
| --project-setup | boolean | `hidden: true`. Internal (`EDIT_PROJECT_SETUP_FLAG`), set only when `init`'s dashboard delegates to Edit as the project-materialisation step |

> **`--ui` and `--from` are the two directions of one round trip and cannot be combined.** Both together is refused with `SHARED_CONFIG_ONE_DIRECTION` (`EXIT_CODES.ERROR`) before either spends anything. `--from` is destructive and interactive: it confirms its removals at a terminal, and a run with no TTY is refused with `sharedConfigNeedsTerminal(id)` **before** the fetch and before the catalogue load — the message names `init --from` as the headless alternative, which installs into a clean directory and removes nothing. **`edit --from` also refuses project-scoped payload content at the home directory**, through the same `BaseCommand.refuseProjectScopedContentAtHome` `init --from` calls, at the same point of the same value: after the decode, before the skip warnings, `EXIT_CODES.ERROR`. Full method-by-method flow, the confirm's shape and the ownership rule: [`commands/edit.md`](./edit.md); the wire contract: [`features/seed-contract.md`](../features/seed-contract.md).

**Flow:** (see `reference/commands/edit.md` for the full method-by-method flow)

0. `BaseCommand.ensureConfigReadable(cwd)` -- refuses, before anything renders, when a config file exists but cannot be loaded. See "Unreadable configs are recreated, not edited" below.
1. Both-flags refusal (`--ui` with `--from`), then `openInEditor(cwd)` and return when `--ui` is set: `seedPayloadForInstallation()` → `publishSeedConfig()` → print `Shared as <id>` + `sharedConfigDestinations(id)` → `openUrl(editorConfigUrl(id))` only under a TTY.
2. `fetchSharedConfigOrFail(flags.from)` when `--from` is set — the no-TTY refusal, then `fetchSeedConfig()`.
3. `loadContextUnderSpinner()`: **Operation: `detectProject()`** + **Operation: `loadSource()`** + `discoverAllPluginSkills()` merged with config skills (excluded entries filtered), behind a spinner cleared in a `finally`.
   3a. `resolveEditRoot(installation, cwd, flags[EDIT_PROJECT_SETUP_FLAG])` -- the ONE directory decision, read by every layer below as an `EditRoot`. `edit` names no directory: it edits the installation `detectProject` found, so the root is `installation.projectDir` and a working directory holding no config of its own is not one. `--project-setup` is the exception the flag exists for: `cc init` run in a directory declares that directory the installation being set up, so the root is `cwd` there. Consequence worth knowing: a bare `cc edit` in a directory with no installation of its own edits the GLOBAL one, the scope toggle is not offered, and nothing is written beside it -- setting a project up is `cc init`'s job, through the dashboard's Edit.
4. `BaseCommand.ensureSavedSkillsReadable(config.skills, matrix, projectDir)` -- still before the wizard mounts, refuses over an installed local skill whose `metadata.yaml` describes no skill. The other unresolvable classes fall through and are removed with a class-specific reason at step 8.
5. Producer. Wizard: `runWizardSession()` renders `<Wizard>` with `initialStep="build"`, `installedSkillIds`, `installedSkillConfigs`, `installedAgentConfigs`, `isEditingFromGlobalScope`, `initialDomains`, `initialAgents`, `startupMessages`. Shared: `registerExternalSkills()` → `seedToWizardResult()` → `refuseProjectScopedContentAtHome()` → skip warnings → `skillsAuthoredHere()` → `reconcileSharedConfig()`.
6. Filter excluded entries once, then `detectConfigChanges(filteredOldConfig, filteredResult, fullEntries)` -- returns `ConfigChanges`
7. Shared producer only: `confirmSharedConfigOrCancel(changes, kept)` renders `RemovalPlanConfirm` and exits `EXIT_CODES.CANCELLED` unless approved, then `writeCarriedSkills()` writes the skills the configuration brought with it. Both sit above the no-change return.
8. **No-change branch** (`!hasAnyChanges(changes)`): logs `"No changes made."` and returns -- UNLESS `isProjectSetup` (`flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`), in which case it still runs `writeConfigAndCompile()` to materialise the project (init dashboard flow)
9. `logChangeSummary()` -- styled diff using display names from matrix, scope labels `[G]`/`[P]`, green `+` for G-to-P scope migrations, dual-scope `[P]` add/remove lines. Removal rows for `result.unresolvableSkillIds` carry the reason from `unresolvedSkillRemovalReasons(ids, activeOldSkills, projectDir, loadedSourceLabel(sourceResult))` -- one of four class-specific sentences, not a single wording. See [`config/config-merger.md`](../config/config-merger.md)
10. `applyMigrations()` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches; returns migrated `Set<SkillId>`
11. `recordGlobalSourceMigrations()` -- rewrites `origin` on active-global entries this run migrated, in the global config (project-context runs only), via `config-gate::mutateGlobal({ kind: "migrate-skill-sources" })`. Since the per-skill `origin` decides the reference form a compiled agent emits, this classifies T1: the gate fans the change out to every OTHER registered project and recompiles their agents, and `reportPropagatedRecompile` renders the result. Runs BEFORE step 17, whose own write then classifies as a byte-identical no-op, so nothing fans out twice.
12. `applyScopeChanges()` -- `migrateLocalSkillScope()` for eject skills, `migratePluginSkillScopes()` for plugin skills (marketplace required)
13. `applySourceChanges()` -- `deleteLocalSkill()` on the old scope dir for non-migration eject-origin changes
14. `applyPluginChanges()` -- **Operation: `installPluginSkills()`** for added plugins (hard-errors on failure), **Operation: `uninstallPluginSkills()`** for removed; marketplace via `requireMarketplaceOrExit()`
15. `copyNewLocalSkills()` -- **Operation: `copyLocalSkills()`** for newly added eject-origin skills
16. `removeDeletedLocalSkills()` -- `deleteLocalSkill()` for fully-deselected eject skills
17. `writeConfigAndCompile()` -- **Operation: `loadAgentDefs()`**, **Operation: `writeProjectConfig()`**, `reportUnassignedSkills()`, **Operation: `discoverInstalledSkills()`**, **Operation: `compileAgentsAllScopes()`**, then `reportPropagatedRecompile(configResult.propagation)` (the shared `BaseCommand` reporter — same wording as `init`, because it is the same function)
18. `cleanupStaleAgentFiles()` -- **Operation: `removeCompiledAgents()`** per scope directory holding a stale file, after scope changes / deselection
19. `exitIfWorkIncomplete()` -- called from `run()`, one statement after the whole of the above. `edit` has a THIRD ending beside success and refusal: steps 11, 12, 17 and 18 each report a failure they cannot abort into through `reportIncompleteWork`, and a run holding any of them prints `completedWithFailures()` — each failure with the one command that finishes it — and exits `EXIT_CODES.COMPLETED_WITH_FAILURES` instead of `✓ Done`. **The mechanism is `BaseCommand`'s**, not this command's: `init` and `eject` take the same ending, and the recorded list is private to the base class with `hasIncompleteWork` the only reading a subclass gets. Which warn sites are on that side and which are advisory is held by `src/cli/lib/__tests__/failure-reporting-classification.test.ts`, which rosters `edit.tsx`, `init.tsx`, `eject.ts` and `base-command.ts` — and additionally refuses any command under `src/cli/commands/` that records incomplete work without calling `exitIfWorkIncomplete()`, because a shared recorder makes filing a failure into a list nothing reads possible for the first time.

**Global immutability.** A globally installed skill or agent cannot be deselected from a project in any flow, `init` included, so `removedSkills` / `removedAgents` never contain an active global entry when the edit runs at project scope. Domain deselection is a view filter that drops only project-owned skills. **Two layers hold the rule, and they protect different things:** `authoritativeScope: "owned"` in `mergeConfigs` protects the config ROW, while the removal DIFF is what drives `uninstallPluginSkills` / `deleteLocalSkill` / `removeCompiledAgents` and reaches the disk regardless. The wizard store is what keeps a global entry out of that diff for every keystroke-driven run; `edit --from` bypasses the store, so `reconcileSharedConfig` puts such entries back into the result before the diff is taken. See [`commands/edit.md`](./edit.md) and `reference/concepts/scope-system.md`.

**Unreadable configs are recreated, not edited.** There are no versioned config migrations. `BaseCommand.ensureConfigReadable(projectDir)` runs as step 0 of both `edit` and `init` and hard-errors (`EXIT_CODES.ERROR`) with `configUnreadableError(...)` when a config file exists but throws `ConfigLoadError`. It checks the project's own config AND, from a project, the global one every project write inlines -- at the home root the two collapse into one check. A **missing** config passes through untouched, so `edit` still reports `No installation found` and `init` still routes to the wizard. The message carries the `ConfigLoadError` (file plus reason) and two ways forward: `uninstall` (which deliberately tolerates the same corruption) followed by `init`, or a configuration built at the editor URL (`EDITOR_URL` in `src/cli/consts.ts`) and installed with `init --from <id>`. `doctor` is deliberately not named as a way forward -- it diagnoses rather than repairs, and on an unreadable config it names the state (`exists but could not be loaded`, in the content layer) rather than calling the file missing. Pinned by `e2e/commands/edit-corrupt-config.e2e.test.ts`.

**Exported utilities (`@internal`, for testing):**

- `ConfigChanges` type -- diff between old and new config (added/removed skills, agents, origin changes under the key `sourceChanges`, scope changes, agent scope changes, plus `dualScopeSkillTransitions`/`dualScopeAgentTransitions` sets)
- `detectConfigChanges(oldConfig, wizardResult, fullEntries?)` -- computes `ConfigChanges` from old `ProjectConfig` and new `WizardResultV2`; optional `fullEntries` (tombstone-inclusive) classifies dual-scope transitions
- `applyMigratedGlobalSources(globalSkills, migratedSources)` -- rewrites `origin` on active-global entries; returns `{ skills, changed }`. Defined in `config-gate/index.ts` and re-exported from `edit.tsx`
- `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` -- migrates plugin skill scope registrations; `skills` is `Pick<SkillConfig, "id" | "origin">[]`. Returns `PluginScopeMigrationResult`.
- `PluginScopeMigrationResult` type -- `{ migrated: SkillId[]; failed: Array<{ id: SkillId; error: string }> }`

**Key dependencies:**

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig` (+ `ConfigWriteResult`), `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs` (+ `AgentDefs`), `removeCompiledAgents` (+ `RemoveCompiledAgentsOptions`)
- `src/cli/base-command.ts` -- `requireMarketplaceOrExit` (no `ensureMarketplace` fallback), `installPluginSkillsReported`, `announcePluginInstall` (the eject→plugin migration path), `reportValidationErrors`, `reportUnassignedSkills`, `reportPropagatedRecompile`, `ensureConfigReadable`, `ensureSavedSkillsReadable`
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory`, `installBaseDir`, `resolveInstallPaths`, `INSTALL_MODE_DESCRIPTIONS`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`, `unresolvedSkillRemovalReasons`
- `src/cli/lib/seed/` -- `seedPayloadForInstallation` + `skillsAuthoredHere` (`installation-payload.ts`), `fetchSeedConfig`, `publishSeedConfig`, `registerExternalSkills` + `writeExternalSkills` (`external-skills.ts`), `seedToWizardResult`, `reconcileSharedConfig` (`seed-apply.ts`)
- `src/cli/components/common/` -- `RemovalPlanConfirm` + `RemovalPlanSection`, `promptConfirm`, `Spinner`; `src/cli/utils/open-url.ts` -- `openUrl`

### `compile` (src/cli/commands/compile.ts)

**Purpose:** Compile agents using installed skills and agent definitions, and refresh the compiled scope's `config-types.ts`. Runs the ONE pass its working directory owns: inside a project, the project pass and nothing else; where no project installation is in play, the global pass.

**Flags:**

| Flag           | Type    | Description            |
| -------------- | ------- | ---------------------- |
| --verbose (-v) | boolean | Enable verbose logging |

**Flow:**

1. `detectInstallations(cwd)` -- **Operation: `detectBothInstallations(cwd)`**, returning `{ global, project, hasBoth }`. A `ConfigLoadError` (config file present but unparseable) is caught and re-raised via `this.error(..., { exit: EXIT_CODES.ERROR })` naming the offending file, **before any write** -- a corrupt config must never let compile run config-less and resurrect every built-in agent.
2. Error `ERROR_MESSAGES.NO_INSTALLATION` if neither installation found
3. `resolveAndLogSource(cwd)` -- logs `STATUS_MESSAGES.RESOLVING_SOURCE`, then `resolveSource({ caller: "stored", projectDir: cwd })` from configuration, then `Marketplace: <sourceOrigin>`. A throw logs `ERROR_MESSAGES.FAILED_RESOLVE_SOURCE` and goes to `handleError` (`EXIT_CODES.ERROR`) — which is where an unreadable `.claude-src/config.ts` would land, except that step 1 has already refused one. `compile` takes no `--marketplace` flag: it recompiles an installation that already records which marketplace its skill references answer to.
4. `loadAgentDefsOrFail()` -- **Operation: `loadAgentDefs()`**, which takes no argument: agent partials ship with the CLI, so there is nothing here for a caller to vary.
5. `buildCompilePasses()` -- the single pass this invocation owns. A project installation at `cwd` returns the project pass (`projectDir = cwd`) alone: a compile inside a project is a project-scope operation and writes nothing outside that project. Otherwise -- at the home directory, or in a directory with no config of its own -- the global pass (`projectDir = os.homedir()`) is returned. The project pass carries `scopeFilter: "project"` when `hasBoth`, because the project config inlines the global entries and an unfiltered pass would write global-scoped agents into the project's own agents directory; the global pass is unfiltered.
6. For each pass (`runCompilePass`):
   a. `discoverAllSkills()` -- **Operation: `discoverInstalledSkills(projectDir)`**
   b. If `totalSkillCount === 0`: log `No skills found for <label> pass, skipping`, still run `refreshConfigTypes()`, and return `false`. The config loads independently of discovered skills, so a hand-edited `config.ts` listing skills with nothing installed for that scope must still get fresh unions.
   c. `warnUnresolvedStackSkills()` -- emits `this.warn()` for each configured stack skill absent from disk (excluded ids filtered via `effectivelyExcludedSkillIds`); such skills are dropped from the recompiled agents rather than silently omitted
   d. **Operation: `compileAgents({ projectDir, sourcePath, skills, pluginDir, outputDir, scopeFilter })`**
   e. When the pass compiled zero agents and `label === "Project"`, `hintGlobalScopedAgents()` counts the config's active `scope === "global"` agents and, if non-zero, prints `globalScopedAgentsHint(count)` after `INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE`
   f. `refreshConfigTypes()`
7. After all passes, if no pass had skills, hard-error `ERROR_MESSAGES.NO_SKILLS_TO_COMPILE` (`EXIT_CODES.ERROR`) -- `No skills found. Run '<bin> init' to choose skills, or add your own under .claude/skills/.` The refusal is only reachable past step 2, so an installation exists and the state it describes is a configuration with nothing installed under it: the same state `doctor` reports as `config-empty` and names `init` for, because `init` on a config that declares nothing opens the wizard rather than the dashboard. It names `init` and not `edit` for that reason -- `edit` modifies the currently installed skills, and there are none to modify. **The command a refusal names has to be one `Help` can route**, so check any new one against the roster this page enumerates rather than against what feels like it should exist.

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

**No version field, and no skills path.** `InstallationInfo` (`src/cli/lib/plugins/plugin-info.ts`) is `{ mode, name, skillCount, agentCount, configPath, agentDirs }` -- there is **no `version` field**, and `skillsDir` went the way `agentsDir` did: it named one project-scoped directory beside a count that spans both scopes, nothing read it, and `features/plugin-system.md` records why removing it beat widening it. `formatInstallationDisplay` emits the mode exactly once:

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

**Behavior:** Prints its report and nothing else. Every row's `details` are unconditional -- `formatCheckLine` gates them on nothing, which is what the removal of `doctor --verbose` meant. The shared `verbose()` logger (`src/cli/utils/logger.ts`) stays OFF: the command switched it on until 2026-08-23 as the mechanical residue of that same flag removal, which spliced the loaders' own trace between the section headings and the rows they head -- 27 lines over a directory holding nothing, each restating a row printed underneath it. `e2e/commands/doctor-report-shape.e2e.test.ts` asserts each section as one contiguous block, so adjacency rather than presence is what holds it.

**Layer 1 -- content checks**, backed by `src/cli/lib/content-validator.ts` and printed under `Content checks`. Five rows in two tiers:

`CONFIG_CHECK` (`doctor.ts`) runs **first and alone**, before the other four. It is the file every other row is read out of, so a config that exists and cannot be parsed is a finding about that file and every row underneath would be a cascade of it. It is also the only report that can carry the loader's own reason -- the layers below re-read the file per check.

The remaining four are `CONTENT_CHECKS`, run in parallel. Each is a `GatedContentCheck` -- a `ContentCheck` plus two gates. `readsConfig` declares whether it consults `config.ts` to know WHAT to validate: when the config row failed, every `readsConfig: true` row is replaced by `skippedContentResult(kind)` rather than run, while the rows that walk installed content on disk still run, because they say something true whatever state the config is in. `blocks` declares which operational rows this pass's errors stand down, and is read one layer down -- see "Which operational rows a content error stands down" below.

| Row            | `readsConfig`      | Walks                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config`       | — (it IS the gate) | `validateProjectConfigFile`: `countExistingConfigs` over the config dirs in play (the project's own and the global one it inlines) for the count, `findConfigLoadFailures` for the issues. An **absent** config is not a finding -- that is the legitimate state `init` exists for, and the operational layer already names it with the remedy that fits. |
| `Marketplaces` | `true`             | the one marketplace this installation reads from (`resolvePrimarySourceEntry`) when it is LOCAL, plus the cwd when `isSourceRepo(cwd)` and the marketplace does not already resolve to it (a marketplace author's own repo). A remote one becomes a `— skipped (remote)` note.                                                                            |
| `Plugins`      | `false`            | `getUserPluginsDir()` and, unless `isHomeDirectory(cwd)`, `getProjectPluginsDir(cwd)`                                                                                                                                                                                                                                                                     |
| `Skills`       | `false`            | every directory under the global and project `skillsDir`, config-referenced or not                                                                                                                                                                                                                                                                        |
| `Agents`       | `false`            | every `*.md` under the global and project `agentsDir`                                                                                                                                                                                                                                                                                                     |

Each returns a `ContentValidation` (`count`, `issues`, `notes`), which `toContentResult` maps onto the same `CheckResult` shape the operational rows use -- so one formatter, one summary, one exit code covers both layers. Issue lines render as `- [ERROR|WARN] <file>: <message>`. `contentMessage` distinguishes a pass that walked nothing (`No <noun>s to validate`) from one that walked entries -- a pass that walked nothing can still report an issue, because an unreadable plugin registry is a finding about the directory rather than about a plugin inside it.

**Layer 2 -- operational checks** (display order): Config Valid, Skills Resolved, Agents Compiled, No Orphans, Skills Installed, Plugins Installed, Marketplace Reachable. `Skills Installed` is the eject-mode on-disk check (`checkSkillsInstalled`); `Plugins Installed` (`checkPluginSkillsInstalled`) verifies the plugin registry grouped by each skill's own scope.

**No Orphans has two verdicts, chosen by `resolveOrphansCheck` off the `ConfigState`.** With a config it is `checkNoOrphans`: the compiled agent files in each scope's `agentsDir` whose roster does not name them, a **warning** -- the next `compile` prunes exactly those (`pruneStaleCompiledAgents`). With an **absent** config it is `checkUnownedInstallation`: nothing declares what is installed, so the row names it (display paths, one per line) and it is an **error**. **It names what this CLI can prove it wrote, not everything on disk** -- a skill directory carrying `forkedFrom` and a compiled agent carrying the compiler's provenance marker. A hand-authored skill directory or agent file is named by neither list, because the row is an offer to `uninstall` and that command would refuse it. Nothing repairs the state unattended -- `compile` and `edit` refuse without a config -- but `uninstall` does not need one: it matches skill directories by their own `forked-from` metadata and compiled agents by the marker each carries, so it clears both halves of what the row named. Its tip (`kind: "orphans-unowned"`) is the only one that says so; the Config Valid tip beside it speaks about the file, not the leftovers. The names come from `listInstalledArtifacts` (`content-validator.ts`), whose two walks apply exactly the ownership question `uninstall` asks -- the same two walks the content layer's `Skills` and `Agents` rows counted four lines above, minus the entries neither can prove are this CLI's. With nothing installed the row keeps the skip: an empty directory with no config is the state `init` exists for. A config that **loads and fails validation** still skips -- there a file's owner is unreadable rather than absent, and no installation can be called stranded on the strength of a config nobody can trust.

**Why the layer runs second and conditionally.** `runOperationalChecks` returns `[]` -- printing one line instead of rows -- in two cases, and in two cases only:

| Condition                                                                                | Line printed                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| The `Config` content row failed (`SKIP_AFTER_CONFIG_ERROR`)                              | `Skipped -- fix the content errors above first`              |
| No `detectProject()` result, no `.claude-src/config.ts` on disk, and `isSourceRepo(cwd)` | `Skipped -- no installation here (skills source repository)` |

The first is the one content finding that cascades into all seven rows -- every one of them is read out of `config.ts`, so none can answer when nobody can read it. The second is the marketplace-author context -- one command, two contexts. The `fileExists` half of the second condition matters: a config that exists but fails to load also detects as "no project", and that is a finding, not an absence, so it still reaches the operational layer.

**Which operational rows a content error stands down.** Every OTHER content failure is scoped to the rows that read what it is about, rather than silencing the layer. `failedContentKinds` collects the failed content rows once; `contentBlockedResult(row, failed)` asks `CONTENT_CHECKS` which of them name that row in `blocks`, and returns a `skip` whose message names the blocking pass (`skipRestatingContent`) instead of the blanket sentence. A skipped row is counted in neither column of the summary, which counts `pass`/`warn`/`fail` only.

| Operational row         | Reads                                                                      | Stood down by        |
| ----------------------- | -------------------------------------------------------------------------- | -------------------- |
| `Config Valid`          | `config.ts` via `validateProjectConfig`                                    | Config only          |
| `Skills Resolved`       | config + stack ids, `matrix.skills`, `discoverLocalSkills`                 | Marketplaces, Skills |
| `Agents Compiled`       | `fileExists` on each agent `.md` -- existence only, never opens it         | Config only          |
| `No Orphans`            | agent `.md` FILE NAMES vs config; `listInstalledArtifacts` directory names | Config only          |
| `Skills Installed`      | `fileExists` on `SKILL.md` -- existence only, never parses                 | Config only          |
| `Plugins Installed`     | `.claude/settings.json` `enabledPlugins` + the user plugin registry        | Plugins              |
| `Marketplace Reachable` | `loadSource()` -- reports its own outcome                                  | Config only          |

There are two genuine cascades and no others. `extractLocalSkill` DROPS a skill whose `metadata.yaml` is missing or unusable, so a "not found" from `Skills Resolved` would be the `Skills` content finding re-worded; and `resolvePluginInstallPaths` swallows an unparseable registry and returns `[]`, so every plugin-mode skill would read "no enabled plugin found". Nothing depends on the `Agents` content pass -- a `.md` with broken frontmatter changes neither "does the file exist" nor "what is it called" -- so it names no rows at all. Pinned by `src/cli/lib/__tests__/commands/doctor-content.test.ts` -> "operational rows an unrelated content error must not silence".

**One finding's severity turns on WHO is reading, and only one.** A slug a marketplace's relationship rules name that no skill carries (`rule-unresolved-slug` from `checkMatrixHealth`) is an **ERROR** for the marketplace's author and a **WARNING** for someone who merely consumes it. The rule that cannot act is the same defect either way; what differs is that the author can open the file and the consumer cannot, and a warning that sends a reader hunting through their own project for a typo in a file they do not own is worse than no warning at all. Every other health finding is reported at the severity the check gave it — that severity is a property of the defect alone.

| Layer                                                             | What it decides                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkMatrixHealth` (`src/cli/lib/matrix/matrix-health-check.ts`) | Emits `rule-unresolved-slug` at `error` — the AUTHOR's verdict, and the only one it can reach: a matrix says what is wrong with it and cannot say who is looking                                                    |
| `toSourceIssue` (`src/cli/lib/source-validator.ts`)               | Downgrades that one finding to `warning` for a `MarketplaceReader` of `"consumer"`, and rewords it via `consumedMarketplaceMessage` to lead with the marketplace and say outright that there is nothing here to fix |
| `readerFor` (`src/cli/lib/content-validator.ts`)                  | Decides which reader this is, per marketplace: `"author"` when `path.resolve(projectDir, source.url) === projectDir`, `"consumer"` otherwise                                                                        |

**`readerFor` asks the question per marketplace, not per run.** "Is there a marketplace under the cwd" would say nothing about the OTHER marketplace a config may point at, and the severity turns on the per-marketplace question. The `CWD_SOURCE_NAME` entry `localSourcesToValidate` appends answers `"author"` by construction, which is the whole of why a marketplace author's own repository is judged the way they need it to be. `MarketplaceReader` is a closed union (`"author" | "consumer"`) so a misspelled branch is a compile error rather than a condition quietly never true; `MatrixHealthFinding` is closed for the same reason.

**`Marketplace Reachable` names the marketplace and says how it was reached.** Its `message` carries where the skills were read FROM -- for a remote marketplace, the cache directory it was unpacked into -- and a detail line beneath it carries the ref plus the rung `resolveSource` answered on (`MARKETPLACE_CHOSEN_BY` in `doctor.ts`, exhaustive against `ResolvedConfig`'s `sourceOrigin`). The `default` rung is the one that had to be said out loud: with no configuration anywhere the resolver falls back to the public catalogue and this row FETCHES it, so a bare directory's report describes a network round trip to a marketplace nobody named. That is the check doing its job -- reachability is its whole subject -- and it was doing it silently.

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

| Arg  | Required | Description                                                                                 |
| ---- | -------- | ------------------------------------------------------------------------------------------- |
| type | no       | What to eject. `options: [...EJECT_TYPES]` — `agent-partials`, `templates`, `skills`, `all` |

**Flags:**

| Flag     | Short | Type    | Description                                                                                                                          |
| -------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| --force  | -f    | boolean | `default: false`. Overwrite existing files                                                                                           |
| --output | -o    | string  | Write everything into this directory instead of each eject type's own destination. No `default:` — absence routes to the table below |

**Three ARGUMENT refusals, all `EXIT_CODES.INVALID_ARGS`, all before anything is copied.** A
fourth refusal comes from below rather than from this command: an existing `.claude-src/config.ts`
that cannot be evaluated raises out of `resolveSource` / `loadProjectSourceConfig`, so `eject`
never invents a config over one it could not read nor rewrites a whole file from a scalar change.
See `features/configuration.md` -> `loadSourceConfig`.

**That fourth one is not an argument refusal and does not take a refusal's code.** It fires inside
`ensureConfig`, which runs AFTER `executeEject` — so the templates, partials or skills the command
was asked for are already on disk and stay there. `ensureConfig` catches it and calls
`reportIncompleteWork(...)` with `INCOMPLETE_WORK_RECOVERY.INSPECT_INSTALLATION`, `reportEnding()` withholds
`✓ Eject complete!`, and the run exits `EXIT_CODES.COMPLETED_WITH_FAILURES` — because `ERROR` says
nothing landed and the run can be repeated, which is the wrong instruction for a tree that now
holds an ejection. Pinned by `e2e/commands/config-unreadable-stops-the-guess.e2e.test.ts`, whose
eject leg asserts the ejected template beside the config that was correctly not invented.

| Refusal                                                              | Where               | Message                                                                   |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| No `type` arg at all (the arg is `required: false`, so oclif allows) | `validateEjectType` | `Please specify what to eject: agent-partials, templates, skills, or all` |
| A `type` the `options` list does not carry (`isEjectType` is false)  | `validateEjectType` | `Unknown eject type: <type>`                                              |
| `--output` resolving to a path that exists **as a file**             | `resolveOutputBase` | `Output path exists as a file: <path>`                                    |

**Where the bytes land.** `resolveOutputBase` returns `path.join(projectDir, CLAUDE_SRC_DIR)` —
`.claude-src/` — and `eject skills` ignores that base entirely unless `--output` was given. Three
eject types, three destinations, which is why the flag's own description names none of them and
this table carries all three. A one-line description that picked one destination would be wrong
about the other two, so the flag says what `--output` DOES and routes the reader here for where
its absence leads.

| Eject type       | Without `--output`                                | With `--output <dir>`                        |
| ---------------- | ------------------------------------------------- | -------------------------------------------- |
| `agent-partials` | `<project>/.claude-src/agents/`                   | `<dir>/` itself — `directOutput`, no nesting |
| `templates`      | `<project>/.claude-src/agents/_templates/`        | `<dir>/` itself                              |
| `skills`         | `<project>/.claude/skills/` (`LOCAL_SKILLS_PATH`) | `<dir>/` itself                              |

`--output` expands a leading `~` against `os.homedir()` before resolving, then resolves relative to
`projectDir`. `all` runs `agent-partials`, then `templates` with `force` forced true, then `skills`.

`eject` declares no `--marketplace` flag. It copies out of whatever source this installation reads (`resolveSource({ caller: "stored", … })` — the project config, then the global one, then the default) and records that source in the config it may invent; accepting a per-run override would let it eject from one source while recording another. `CC_MARKETPLACE` does not steer it either: the environment names a marketplace at install time only.

**Key dependencies:** **Operation: `loadSource()`**. Uses `resolveSource()`, `loadProjectSourceConfig()` from configuration; `ensureBlankPair()`, `mutateGlobal()`, `writeProjectPartial()`, `lazyGateDeps()` from the config-gate; `copySkillsToLocalFlattened()` from skills.

**Config writes are scope-branched through the config-gate.** `recordSource()` and `ensureMinimalConfig()` each branch on `isHomeDirectory(projectDir)`:

| Scope       | `recordSource`                                                                                                                            | `ensureMinimalConfig` (create-only-if-absent)                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `$HOME`     | `mutateGlobal({ kind: "set-source", ... })` — registered projects inline the scalar, so the gate fans the config half out to them         | `ensureBlankPair()` then `recordSource()`                                           |
| project dir | `writeProjectPartial(projectDir, { ...existing, marketplace: source })` — the field is `marketplace`; `ProjectConfig` has no `source` key | `writeProjectPartial(...)` with the resolved marketplace / marketplaceName / author |

**Behaviour change: `eject` at `~` now writes the `config-types.ts` sibling.** The invented config's first line is `import type { ProjectConfig } from "./config-types"`, which could not resolve because the old `ensureBlankGlobalConfig` wrote `config.ts` alone. `ensureBlankPair()` writes both halves. The `"Source saved to…"` / `"Created…"` lines and the create-only-if-absent rule are unchanged.

### `search` (src/cli/commands/search.ts)

**Purpose:** Read-only catalog browse. Searches the marketplace this installation reads from, plus the local skills already on disk, by id, displayName, slug, description, or category. Prints a table via `@oclif/table` whose five column headings are `ID`, `Name`, `Origin`, `Category`, `Description` — the third column's `key` is `source` and its rendered heading is `Origin`, so grep for one and read the other. `Origin` is the skill's own `activeSource` name (`eject` for a skill on disk, the resolved marketplace otherwise), not a fixed label; `activeSourceName` **throws** rather than guess when the tagging pass left a skill with no `activeSource`. `Description` is `truncateText`-ed to `MAX_DESCRIPTION_WIDTH`. Installing a found skill is the wizard's job (`init` / `edit`).

**Args:**

| Arg   | Required | Description                                                         |
| ----- | -------- | ------------------------------------------------------------------- |
| query | yes      | Search query (matches id, displayName, slug, description, category) |

**Flags:** None (`static flags = {}`) -- a zero-flag command that reads whatever source the installation is configured with.

**On an unreadable config it refuses rather than searching the default marketplace.** `search` runs
neither `ensureConfigReadable` nor installation detection, so the settings loader is the only thing
between it and a corrupt `.claude-src/config.ts`. That loader raises, the throw reaches
`runSearch`'s `catch` and `this.handleError`, and the command exits `EXIT_CODES.ERROR` carrying
`configUnreadableError(...)`. **A loader that reported such a file as ABSENT would send
`resolveSource` past it to `DEFAULT_SOURCE`**, and the results would be a listing of the public
catalogue presented as this installation's with nothing saying the configured marketplace had not
been read — which is why the refusal is the loader's rather than this command's. The same applies to
every other command in this position; see `reference/features/configuration.md` -> `loadSourceConfig`
for the per-call-site postures.

**Key dependencies:** **Operation: `loadSource()`**, and nothing else — the matrix it returns already carries the local skills merged in, so the whole catalog is one load. `printTable()` from `@oclif/table` renders it.

### `share` (src/cli/commands/share.ts)

**Purpose:** Turn the installation in the current directory into a configuration the agentsinc.sh store holds, and print the id it was given. The inverse of `init --from <id>`, and the only command that WRITES to the config store.

**Args:** none. **Flags:** none (`static flags = {}`) — the installation in the cwd is the whole of the input.

**Flow (`run`) — read, map, refuse, publish.** Everything that can fail locally fails before the POST: the store's write budget is the scarce half, and a write spent on a configuration that cannot be installed buys a dead link.

1. `seedPayloadForInstallation(process.cwd())` (`src/cli/lib/seed/installation-payload.ts`) — the read, the ownership judgement, the content reading, the mapping and the empty guard, all five in one call. `{ ok: false, error }` -> `this.error(prepared.error, { exit: EXIT_CODES.ERROR })`. **`edit --ui` calls the same function**, so the two commands mint the same id from the same directory and differ only in the ending.
2. `Sharing N skill(s) across M sub-agent(s)...` — counted off the PAYLOAD rather than the config, so what the command announces and what it posts cannot disagree.
3. `publishSeedConfig(payload)` — `{ ok: false, error }` becomes `this.error(..., { exit: EXIT_CODES.ERROR })`.
4. `reportShared(id)` — `Shared as <id>`, then both lines of `sharedConfigDestinations(id)`: `Install it:  npx agents-inc init --from <id>` and `Open it:     https://agentsinc.sh/?fromId=<id>`. An id nobody can act on is not a share, and exactly two things read one.

**What `seedPayloadForInstallation` does, in order:** `loadProjectConfig(projectDir)` (the project's own config, or the global one it inherits, carrying **both scopes' entries with each entry's own scope on it**; `null` -> `ERROR_MESSAGES.NO_INSTALLATION`, a `ConfigLoadError` -> its own message) → `judgeSkill` per entry, dropping every ejected skill directory that carries no `forkedFrom` because it is the user's own work and no round trip owns it → `readCarriedSkills` over the ones that do, rebuilding each added skill's whole directory → `configToSeedPayload(config, content)`, whose throw becomes this module's `{ ok: false }` → the empty guard (`skills === 0 && agents === 0`, the same guard `init --from` applies on arrival).

**Exit codes:** `EXIT_CODES.ERROR` for no installation, an unreadable config, an unshareable configuration, an empty selection, and any store failure. Success is `0`.

**The id is the payload's own hash**, so re-sharing an unchanged installation returns the id it already had.

**Key dependencies:** `seedPayloadForInstallation()` from `lib/seed/installation-payload.ts`; `publishSeedConfig()` from `lib/seed/publish-seed.ts`; `sharedConfigDestinations` from `utils/messages.ts`. It uses **no operation** — nothing is loaded, compiled or written locally. Full mapping and wire detail: [`reference/features/seed-contract.md`](../features/seed-contract.md).

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

**Removal plan.** `buildRemovalPlan(target)` is the single pure builder shared by `printRemovalPlan` (plain text) and the `UninstallConfirm` Ink component, so both emit byte-identical strings and only add their own indentation/styling. It returns two halves: the `sections` this run promises to remove, and the `kept` statements naming what it deliberately leaves behind. A section header is a promise about the items beneath it, so a section left with nothing to carry is not emitted at all (`sectionWithItems`). Sections, in order:

| Section              | Emitted when                                      | Items                                                                                                                        |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Plugins:`           | `hasPlugins`                                      | `cliPluginNames`                                                                                                             |
| `CLI-managed files:` | either item below survives its own condition      | `<skillsDir>/ (matching sources)` when `hasLocalSkills`; `<agentsDir>/ (CLI-compiled)` when `compiledAgentsEntry` yields one |
| `Config:`            | `hasClaudeSrcConfig \|\| hasClaudeSrcConfigTypes` | `<claudeSrcDir>/config.ts`, `<claudeSrcDir>/config-types.ts`                                                                 |

**Two authorities identify a compiled agent, in order.** `identifiableAgents(target)` returns `target.configuredAgents` when the configuration names any, and `target.markedAgents` otherwise. The configuration is first because a marker-less file it names is still this CLI's — every install predating the provenance marker is in exactly that state. The marker is the fallback, reached when there is no configuration left to read: provably this CLI's output, whoever lost the config. With neither, `compiledAgentsEntry` yields nothing and the plan carries no agent removal at all.

**The marker is the sweep's whole basis, and the split errs one way by construction.** `splitAgentsByProvenance(agentsDir)` (`src/cli/lib/agents/list-compiled-agents.ts`) reads every `*.md` in the directory and partitions it by `hasProvenanceMarker`. A file that cannot be read yields no marker and lands in `unmarked`, because "cannot prove it is ours" and "is not ours" call for the same answer. The marker itself is documented under [`reference/features/compilation-pipeline.md`](../features/compilation-pipeline.md).

**Both halves are stated.** `keptStatements(target, agentRemovals)` derives the kept list FROM the removal rather than from a second reading of the target, so the two halves of one plan cannot contradict each other — an agent named in both lists would be a promise to remove a file the same plan calls kept. Unmarked agents the removal does not claim produce `unmarkedAgentsKept(agentsDir, count)` (`utils/messages.ts`):

```
Kept N agents in <agentsDir>/ — no agents-inc marker, so this CLI did not compile them.
```

Plugins degrade the same way -- `cliPluginNames` is the intersection with a config nobody can read, so it comes back empty and `Plugins:` is not emitted. The agents item once keyed off `hasLocalAgents`, bare directory existence, and so promised a directory the same run then left untouched. Pinned by `e2e/commands/uninstall-corrupt-config.e2e.test.ts` and `e2e/commands/uninstall-marker-sweep.e2e.test.ts`.

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

**Do not let a `ConfigLoadError` escape `run()` here.** An unreadable config is exactly when a user most needs to uninstall, and letting the error through kills the command at that moment — leaving hand-deleting `.claude-src/` as the only way out. The corrupt-**project**-config path and the corrupt-**global**-config path deregistration hold the same posture; see `reference/features/configuration.md` -> `ConfigLoadError` call-site posture table.

**Global uninstall -- registered-project propagation.** Two halves:

- `prepareGlobalPropagation()` (before removal) returns `null` when `config.projects` is empty. Otherwise it loads, in parallel, `loadSkillsMatrixFromSource({ projectDir, skipExtraSources: true, matrixOnly: true })` and `loadAgentDefs()`, producing `GlobalPropagationData { globalConfig, matrix, agents }`. A load failure warns via `registeredProjectsUpdateFailed(...)` and returns `null` -- it never aborts.
- `updateRegisteredProjects()` (after removal) calls `pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)`, which strips the inlined global-scoped entries from every registered project and regenerates each project's `config-types.ts`. It runs **after** the global manifest is gone so the regenerated project types fall back to the standalone form instead of importing from a deleted global `config-types.ts`. Each `result.skipped` path warns via `registeredProjectUpdateSkipped(path)`; a non-empty `result.updated` logs `registeredProjectsUpdated(count)`. A throw is caught and warned -- **no failure here may abort the uninstall**.

`matrixOnly` + `skipExtraSources` keep this load offline and quiet: an uninstall must not hang on a cold cache or fail on an unreachable remote. The types emitted are byte-identical to the wizard's fully tagged load (same parity test as `compile`).

**Exported for testing (`@internal`):** `UninstallTarget` type, `getCliInstalledPluginKeys(config)`, `uninstallPlugins(target, projectDir, onUninstalled?)`.

**Key dependencies:** `listPluginNames()`, `getProjectPluginsDir()`, `buildMarketplacePluginRef()`, `parseMarketplacePluginRef()`, `toClaudePluginScope()` from plugins. `readForkedFromMetadata()` from skills. `loadProjectConfigFromDir()` from configuration. `lazyGateDeps()`, `mutateGlobal()`, `propagateGlobalRemoval()` from the config-gate. `isHomeDirectory()`, `resolveInstallPaths()` from installation. `loadSkillsMatrixFromSource()` from loading. **Operation: `loadAgentDefs()`**. `listAgentMdFiles()` and `splitAgentsByProvenance()` from agents. `claudePluginUninstallBestEffort()`, `isClaudeCLIAvailable()` from exec. `promptConfirm()` from `components/common/prompt-confirm.tsx`, `Confirm` from `components/common/confirm.tsx`. `registeredProjectsUpdated()`, `registeredProjectUpdateSkipped()`, `registeredProjectsUpdateFailed()` from `utils/messages.ts`.

### `update` (src/cli/commands/update.ts)

**Purpose:** Run Claude's own marketplace update for every marketplace this installation uses, and nothing else.

**Args:** none. **Flags:** none — `static flags = {}`. A plain refresh confirms nothing and reads no skills source, so neither `--yes` nor a marketplace flag has anything to mean.

**Flow (`run`):**

1. `loadInstalledConfig(cwd)` — `loadProjectConfig()`, which reads the project's own config and falls back to the home one. `null` (no config anywhere) warns `ERROR_MESSAGES.NO_INSTALLATION` and returns **successfully**; a `ConfigLoadError` is a fault, not an absence, and hard-errors (`EXIT_CODES.ERROR`) naming the file.
2. Filter the config's skills to the active ones (`!excluded`).
3. `reportEjectedSkills()` — logs `INFO_MESSAGES.EJECTED_SKILLS_USER_OWNED` once when any active entry has `origin === EJECT_SOURCE`. Informational, never a warning.
4. `configuredMarketplaces()` — the deduplicated non-`EJECT_SOURCE` `origin` values, in config order. Empty logs `INFO_MESSAGES.NO_PLUGIN_MARKETPLACES` and returns successfully.
5. `requireClaudeCli()` — `isClaudeCLIAvailable()`, else hard-error `ERROR_MESSAGES.CLAUDE_CLI_NOT_FOUND`.
6. `refreshMarketplaces()` — one `claudePluginMarketplaceUpdate(name)` per marketplace, in sequence. Each failure is warned with its cause (`marketplaceRefreshFailed`) and collected; a non-empty collection hard-errors with `marketplacesRefreshFailed(names)`. Otherwise `marketplacesRefreshed(count)`.

**Ejected skills are not this command's business.** Eject means the user owns the copy, so `update` never reads a skills source, compares a content hash, or rewrites a skill directory. The step-3 line is the whole of what it says about them.

**No recompile and no registered-project fan-out.** A compiled sub-agent references a plugin skill by pointer, so refreshed marketplace content lands without any compiled agent changing. There is nothing to recompile at the cwd and nothing to propagate outward, which is why this command touches neither `compileAgents` nor the config-gate.

**The Claude-CLI check is gated on there being work for it.** An eject-only installation returns at step 4 and so never calls `isClaudeCLIAvailable()` — a missing Claude CLI cannot fail a run that had no reason to shell out.

**Key dependencies:** `loadProjectConfig()` from configuration; `claudePluginMarketplaceUpdate()`, `isClaudeCLIAvailable()` from `utils/exec`; `EJECT_SOURCE` from consts. It uses **no operation** — the operations layer covers source loading, comparison and compilation, none of which this command does.

## Build Subcommands

### `build marketplace` (src/cli/commands/build/marketplace.ts)

**Purpose:** Generate marketplace.json from built plugins for plugin distribution.

**Flags:** no `--marketplace` -- it reads from the local plugins directory, not a remote one.

| Flag          | Short | Type    | Description                                              |
| ------------- | ----- | ------- | -------------------------------------------------------- |
| --name        |       | string  | Marketplace name override (must be kebab-case)           |
| --plugins-dir | -p    | string  | Plugins directory (default: `dist/plugins`)              |
| --output      | -o    | string  | Output file (default: `.claude-plugin/marketplace.json`) |
| --verbose     | -v    | boolean | Enable verbose logging                                   |

**Identity comes from `package.json` in the cwd, and three refusals guard the read** — all in
`loadMarketplaceIdentity`, all `EXIT_CODES.ERROR`, all before a plugin is scanned. Each names the
path and repeats that identity is read from `package.json`, because a marketplace author running
this from the wrong directory is the only way to reach any of them.

| Refusal                                                                  | Message shape                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| No readable `package.json` at the cwd                                    | `Missing package.json at <root>. …`                                 |
| `JSON.parse` throws                                                      | `Failed to parse package.json at <path>: <cause>`                   |
| `packageJsonSchema.safeParse` fails (name, version, description, author) | `package.json at <path> is missing required fields: <dotted paths>` |

`parseAuthor(author)` then splits the owner name from an optional email, and `ownerEmail` is omitted
from the identity rather than emitted empty when there is none.

**Two namespace refusals, in this order.** Both live in `src/cli/lib/marketplace-generator.ts` and both exit `EXIT_CODES.ERROR`.

| Guard                                    | When it runs                                         | What it refuses                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `validateMarketplaceName(name, pkgName)` | While loading identity, before any plugin is scanned | A marketplace claiming a RESERVED name — `agents-inc`, `external` or `local`                                                          |
| `validateSkillIdNamespace(marketplace)`  | After the scan, before `marketplace.json` is written | A marketplace shipping a skill id that does not begin `<marketplace-name>-`; the message lists up to 10, each with the id it expected |

**The public catalogue is exempt by PACKAGE IDENTITY, not by the name it claims.** `validateMarketplaceName` compares package.json's own `name` against `PUBLIC_CATALOGUE_PACKAGE` (`@agents-inc/skills` in `src/cli/consts.ts`) and lets only that package hold a reserved name. `validateSkillIdNamespace` then reads its exemption off `marketplace.name === DEFAULT_PUBLIC_SOURCE_NAME` — safe **only because the first guard ran and let nothing but the catalogue's own package hold that name**. The two are a pair, in that order; separating them would exempt exactly the marketplace the second guard exists to catch.

`--name` is validated by `validateKebabCaseName` first (exit `EXIT_CODES.INVALID_ARGS`), then takes the reserved-name check like any other resolved name. The load-side half of the same rule — a custom marketplace whose ids collide with the catalogue's, refused at load rather than at build — is [`reference/features/source-fetch-and-cache.md`](../features/source-fetch-and-cache.md).

**Key dependencies:** `generateMarketplace()`, `writeMarketplace()`, `getMarketplaceStats()`, `validateMarketplaceName()`, `validateSkillIdNamespace()` from marketplace-generator; `validateKebabCaseName()` from `lib/validate-kebab-name.ts`.

### `build plugins` (src/cli/commands/build/plugins.ts)

**Purpose:** Build skills and agents into standalone plugins. Skills directory is read from the `DIRS.skills` constant; not configurable via flag.

**Flags:** no `--marketplace` -- `build plugins` reads from local `DIRS.skills`, not a remote one.

| Flag         | Short | Type    | Description                                |
| ------------ | ----- | ------- | ------------------------------------------ |
| --agents-dir | -a    | string  | Agents source directory (optional)         |
| --output-dir | -o    | string  | Output directory (default: `dist/plugins`) |
| --skill      |       | string  | Path to skill directory                    |
| --verbose    | -v    | boolean | Enable verbose logging                     |

**Stale-plugin pruning:** After a full-scan clean compile, `pruneStaleSkillPlugins()` removes skill-plugin directories under the output dir that no longer correspond to a compiled skill. A candidate is confirmed a skill plugin via `readPluginManifest()`: directories whose manifest declares `agents` are preserved (agent plugins are out of scope for this run) and directories without a manifest are left untouched. Pruning is **skipped** (the private `compileSkills()` helper returns `null`) in two cases: `--skill` targets a single skill (pruning would wipe every other plugin), or any skill fails to compile (a failed skill is indistinguishable from a removed one). Each removed directory logs `Pruned stale plugin: <name>`.

**Key dependencies:** `compileAllSkillPlugins()`, `compileSkillPlugin()`, `printCompilationSummary()` from skills. `compileAllAgentPlugins()`, `printAgentCompilationSummary()` from agents. `readPluginManifest()` from plugins. `listDirectories()`, `remove()` from `utils/fs`.

> **`build stack` was removed.** Only `build marketplace` and `build plugins` exist under `src/cli/commands/build/`; stack-to-plugin compilation goes through the marketplace/plugins build pipeline.

## New Subcommands

`src/cli/commands/new/` holds exactly one file. `new skill` and `new agent` do **not** exist and exit
`127`; `new marketplace` does, and the `new` topic in `--help` is its topic.

### `new marketplace` (src/cli/commands/new/marketplace.ts)

**Purpose:** Scaffold a directory holding everything the CLI needs to read a marketplace — a
`package.json` carrying its identity, the three config files, and one example skill already named in
the marketplace's own namespace. **It scaffolds only**: publishing is `build plugins` then
`build marketplace`.

**Args:**

| Arg  | Required | Description                                                                                                                           |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| name | yes      | Marketplace name (kebab-case). Becomes the directory under the cwd, the `package.json` name, and the prefix every skill id must carry |

**Flags:** none — the class declares no `static flags` at all, so oclif gives it `{}`. There is
deliberately **no `--force`**: a flag that overwrites an author's own files is the destructive half
of a silent fallback, and both ways past the occupied-directory refusal are one step.

**Flow (`run`) — refuse, refuse, write, report.** Both refusals run before `writeMarketplaceScaffold`
is called, so a refused run leaves the target directory exactly as it found it.

1. `refuseUnusableName(name)` — two checks in order:
   - `validateKebabCaseName(name, "Marketplace")` -> `EXIT_CODES.INVALID_ARGS`
   - `validateMarketplaceName(name, name)` -> `EXIT_CODES.ERROR`. The package.json this command is
     about to write names the marketplace after itself, so the marketplace name **is** the package
     name — which is what keeps the public catalogue's reserved-name exemption out of reach here.
     Both are the same rules `build marketplace` enforces, enforced at creation instead.
2. `refuseOccupiedDirectory(dir)` — `isDirectoryEmpty(dir)` passes; anything else is
   `EXIT_CODES.ERROR` with `occupiedDirectoryError(dir)`. An absent directory counts as empty.
3. `writeMarketplaceScaffold(dir, name)` — a throw goes through `this.handleError` (`EXIT_CODES.ERROR`).
4. `reportCreated()` — `Created marketplace '<name>' at <dir>`, then one indented line per written path.
5. `reportNextSteps()` — six numbered steps: `cd <name>`, replace the placeholder `author` in
   `package.json`, replace `<SKILLS_DIR_PATH>/<exampleSkillId(name)>/` with a skill of your own,
   `build plugins`, `build marketplace`, `init --marketplace <dir>`.

**Key dependencies:** `writeMarketplaceScaffold()`, `exampleSkillId()` from
`lib/marketplace-scaffold.ts`; `validateMarketplaceName()` from `lib/marketplace-generator.ts`;
`validateKebabCaseName()` from `lib/validate-kebab-name.ts`; `isDirectoryEmpty()` from `utils/fs`.
It uses **no operation** — nothing is loaded, compiled or installed.

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

Exit codes are defined in `src/cli/lib/exit-codes.ts`. **Their names and values live in exactly one
document — [`reference/utilities.md`](../utilities.md), which owns `lib/exit-codes.ts`.** This page
names which code each command's refusals carry and never restates the table; a second writable copy
of one list is the defect `standards/documentation-bible.md` § "A Count Lives in Exactly One
Document" forbids. `EXIT_CODES` carries no `UNKNOWN_COMMAND` — oclif's `127` for an unparsed command
comes from `@oclif/plugin-not-found`, and `e2e/pages/constants.ts` declares that one for the suite.

## User-Facing Messages

All message constants centralized in `src/cli/utils/messages.ts`:

Seven constant objects and one bare string constant, enumerated exhaustively:

| Object                        | Members                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_MESSAGES`              | `UNKNOWN_ERROR`, `UNKNOWN_ERROR_SHORT`, `NO_INSTALLATION`, `FAILED_RESOLVE_SOURCE`, `FAILED_LOAD_AGENT_PARTIALS`, `FAILED_COMPILE_AGENTS`, `CLAUDE_CLI_NOT_FOUND`, `NO_SKILLS_TO_COMPILE`                                                                                                    |
| `SUCCESS_MESSAGES`            | `UNINSTALL_COMPLETE`, `PLUGIN_COMPILE_COMPLETE`                                                                                                                                                                                                                                              |
| `STATUS_MESSAGES`             | `INSTALLING_PLUGINS`, `LOADING_SKILLS`, `LOADING_MARKETPLACE_SOURCE`, `RECOMPILING_AGENTS`, `COMPILING_AGENTS`, `DISCOVERING_SKILLS`, `RESOLVING_SOURCE`, `RESOLVING_MARKETPLACE_SOURCE`, `LOADING_AGENT_PARTIALS`, `FETCHING_REPOSITORY`, `COPYING_SKILLS`, `MARKETPLACE_HAS_NEWER_CONTENT` |
| `INFO_MESSAGES`               | `NO_CHANGES_MADE`, `RUN_COMPILE`, `NO_AGENTS_TO_RECOMPILE`, `NO_PLUGIN_INSTALLATION`, `NO_LOCAL_INSTALLATION`, `CONFIG_TYPES_REFRESHED`, `EJECTED_SKILLS_USER_OWNED`, `NO_PLUGIN_MARKETPLACES`, `AGENT_PARTIALS_CUSTOMIZABLE`                                                                |
| `UNINSTALL_PLAN`              | `PREVIEW_HEADING`, `PLUGINS_HEADING`, `CLI_MANAGED_FILES_HEADING`, `CONFIG_HEADING` — read by BOTH the `--yes` printer and the confirm UI, so the preview a user approves and the list a `--yes` run prints cannot drift apart                                                               |
| `SHARED_CONFIG_APPLY`         | `PREVIEW_HEADING`, `SKILLS_HEADING`, `AGENTS_HEADING`, `GLOBAL_SKILLS_HEADING`, `GLOBAL_AGENTS_HEADING`, `NOTHING_REMOVED`, `CONFIRM` — the fixed text of `edit --from`'s removal plan; the two `GLOBAL_*` headings are emitted only by the project-scope plan                               |
| `SHARED_CONFIG_ONE_DIRECTION` | A single string, not an object: the refusal when `edit --ui` and `edit --from` are asked for at once                                                                                                                                                                                         |
| `INCOMPLETE_WORK_RECOVERY`    | `RECOMPILE`, `INSPECT_INSTALLATION`, `DELETE_AGENT_FILE` — the ways out a command names when it finishes with work undone; one sentence per KIND of leftover state, not one per failure site                                                                                                 |

The same module exports these **message builder functions** for messages that interpolate a count, path, name or reason. No other function is exported from it:

| Function                                 | Called from                                      | Purpose                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initSucceeded(brandingName)`            | `init`                                           | `init`'s closing line, under the name `branding.name` gives the run and the shipped default where no configuration supplies one. Withheld entirely when the run recorded a failure                                                                                                                                        |
| `notInstalledHere(brandingName)`         | `uninstall`                                      | What `uninstall` reports over a directory holding nothing of this CLI's, under the same resolved name its heading and its sign-off carry                                                                                                                                                                                  |
| `pluginsInstalled(count)`                | `base-command.ts`                                | Summary after a plugin install step                                                                                                                                                                                                                                                                                       |
| `localSkillsCopied(count)`               | `edit`                                           | Summary after copying eject-source skills                                                                                                                                                                                                                                                                                 |
| `skillAssignedToNoAgent(skillId)`        | `base-command.ts`                                | Warns a skill that installed but reached no sub-agent's stack                                                                                                                                                                                                                                                             |
| `scopeBlockedStackAssignment(...)`       | `base-command.ts`, `compile`                     | Warns the `(skill, sub-agent)` pairs the scope filter dropped                                                                                                                                                                                                                                                             |
| `sourceUnreachableUsingCache(source)`    | `lib/loading/source-fetcher.ts`                  | Warns that an unreachable marketplace is being served from cache                                                                                                                                                                                                                                                          |
| `propagatedRecompileSummary(...)`        | `base-command.ts`                                | `Recompiled agents in N registered projects, M unchanged`, with its ` (K failed)` suffix                                                                                                                                                                                                                                  |
| `configUnreadableError(...)`             | `base-command.ts`, `lib/configuration/config.ts` | The unreadable-config refusal, naming the file, the reason and two ways forward. `ensureConfigReadable` prints it for `init` and `edit` at startup; `unreadableSourceConfig` throws it from the settings loader, which is how every command that runs neither that check nor installation detection reports the same file |
| `recompileSummary(...)`                  | `edit`, `compile`                                | Per-run agent recompile summary                                                                                                                                                                                                                                                                                           |
| `agentsNotCompiled(agentNames)`          | `edit`                                           | Names the sub-agents a recompile pass could not write, read off `failed` rather than off the prose beside it                                                                                                                                                                                                              |
| `completedWithFailures(failures)`        | `edit`                                           | The ending a run prints when its work landed and part of it did not — each failure with the command that finishes it                                                                                                                                                                                                      |
| `globalScopedAgentsHint(count)`          | `compile`                                        | Names the global-scoped agent count after a zero-agent project pass                                                                                                                                                                                                                                                       |
| `configTypesRefreshFailed(reason)`       | `compile`                                        | Warns that `config-types.ts` unions may be stale                                                                                                                                                                                                                                                                          |
| `skillMetadataUnusableDetail(entry)`     | `compile`, `edit`                                | One logged `<dir> — <path>` + reason line per unusable `metadata.yaml`                                                                                                                                                                                                                                                    |
| `skillMetadataUnusableError(entries)`    | `compile`                                        | `compile`'s refusal, naming the skills it discovered                                                                                                                                                                                                                                                                      |
| `savedSkillMetadataUnusableError(...)`   | `base-command.ts`                                | `ensureSavedSkillsReadable`'s pre-wizard refusal over a SAVED entry's installed skill                                                                                                                                                                                                                                     |
| `marketplacesRefreshed(count)`           | `update`                                         | Summary after refreshing every configured marketplace                                                                                                                                                                                                                                                                     |
| `marketplaceRefreshFailed(name, reason)` | `update`                                         | Warns one marketplace that would not refresh                                                                                                                                                                                                                                                                              |
| `marketplacesRefreshFailed(names)`       | `update`                                         | The hard error naming every marketplace that failed                                                                                                                                                                                                                                                                       |
| `marketplaceOwnerHasNoName(path)`        | `build marketplace`                              | Refusal when package.json names no author, so `owner.name` would be empty and this CLI's own reader would refuse the manifest                                                                                                                                                                                             |
| `marketplaceHasNoVersion(path)`          | `build marketplace`                              | Refusal when `version` in package.json is empty, so the manifest would carry a version `marketplaceSchema` refuses on read                                                                                                                                                                                                |
| `marketplaceNameNotPublishable(...)`     | `build marketplace`                              | Refusal when the name read from package.json is not kebab-case, naming every offending character and pointing at `--name`                                                                                                                                                                                                 |
| `registeredProjectsUpdated(count)`       | `uninstall`                                      | Summary after pruning registered projects                                                                                                                                                                                                                                                                                 |
| `registeredProjectUpdateSkipped(path)`   | `compile`, `uninstall`                           | Warns one unreachable registered project                                                                                                                                                                                                                                                                                  |
| `registeredProjectsUpdateFailed(reason)` | `uninstall`                                      | Warns that no registered project could be updated                                                                                                                                                                                                                                                                         |
| `sharedConfigExistingInstall(...)`       | `init`                                           | The `--from` refusal on an existing project installation                                                                                                                                                                                                                                                                  |
| `sharedConfigGlobalInstall(...)`         | `init`                                           | The `--from` refusal on a blocking global installation                                                                                                                                                                                                                                                                    |
| `sharedConfigProjectScopeAtHome(...)`    | `init`, `edit`                                   | The `--from` refusal on project-scoped payload content at the home directory, naming every offending skill and sub-agent                                                                                                                                                                                                  |
| `sharedConfigNeedsTerminal(id)`          | `edit`                                           | The `--from` refusal when there is no TTY to confirm the removals at; names `init --from` as the headless alternative                                                                                                                                                                                                     |
| `sharedConfigDestinations(id)`           | `share`, `edit --ui`                             | The two lines an id is actionable through: `init --from <id>`, and the editor URL                                                                                                                                                                                                                                         |
| `skippedUnknownSkills(skillIds)`         | `init`, `edit`                                   | Names the payload skill ids this catalog does not know, rather than counting them                                                                                                                                                                                                                                         |
| `skippedUnknownAgents(agentNames)`       | `init`, `edit`                                   | The sub-agent half, judged against `AGENT_NAMES`                                                                                                                                                                                                                                                                          |
| `carriedSkillsWritten(skillIds)`         | `init`, `edit`                                   | Names the skills a shared configuration carried inline and this run wrote to disk                                                                                                                                                                                                                                         |
| `globallyInstalledRemoved(...)`          | `edit --from`                                    | The removal plan's consequence line for global entries a project run removes, naming the projects it reaches                                                                                                                                                                                                              |
| `authoredHereKept(skillIds)`             | `edit --from`                                    | The removal plan's kept half for skills written here, which no shared configuration ever carried                                                                                                                                                                                                                          |
| `unplaceableKept(skillIds)`              | `edit --from`                                    | The removal plan's kept half for skills this configuration names and this catalogue cannot place                                                                                                                                                                                                                          |
| `unmarkedAgentsKept(agentsDir, count)`   | `uninstall`                                      | Reports the agents left in place because they carry no `agents-inc` marker                                                                                                                                                                                                                                                |
| `localSkillsRemoval(skillsDir)`          | `uninstall`                                      | One plan line naming the skills directory the uninstall will clear                                                                                                                                                                                                                                                        |
| `compiledAgentsRemoval(agentsDir)`       | `uninstall`                                      | One plan line naming the agents directory the uninstall will clear                                                                                                                                                                                                                                                        |

## Operations Layer Usage by Command

| Command     | Operations Used                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | `loadSource`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs` (plugin install via `installPluginSkillsReported`, marketplace via `requireMarketplaceOrExit`)                                                                   |
| `edit`      | `detectProject`, `loadSource`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs`, `removeCompiledAgents` (plugin install via `installPluginSkillsReported`, marketplace via `requireMarketplaceOrExit`) |
| `compile`   | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                                                                       |
| `doctor`    | `detectProject`, `loadSource`                                                                                                                                                                                                                                                                |
| `eject`     | `loadSource`                                                                                                                                                                                                                                                                                 |
| `search`    | `loadSource`                                                                                                                                                                                                                                                                                 |
| `share`     | (none -- `seedPayloadForInstallation` reads and maps; nothing is loaded, compiled or written locally)                                                                                                                                                                                        |
| `update`    | (none -- wraps `claude plugin marketplace update` via `utils/exec`, reading its marketplace list from `loadProjectConfig`)                                                                                                                                                                   |
| `list`      | (none -- uses installation, configuration, plugins directly)                                                                                                                                                                                                                                 |
| `uninstall` | `loadAgentDefs` (global-uninstall propagation prep; everything else via lib functions directly)                                                                                                                                                                                              |
| `build *`   | (none -- uses skill/agent compilers directly)                                                                                                                                                                                                                                                |
| `new *`     | (none -- `writeMarketplaceScaffold` writes the tree directly)                                                                                                                                                                                                                                |
