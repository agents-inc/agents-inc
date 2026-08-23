---
scope: reference
area: commands
keywords:
  [
    edit,
    edit-ui,
    edit-from,
    ConfigChanges,
    detectConfigChanges,
    migratePluginSkillScopes,
    change-summary,
    scope-migration,
    seedPayloadForInstallation,
    skillsAuthoredHere,
    reconcileSharedConfig,
    registerExternalSkills,
    writeExternalSkills,
    EditRoot,
    resolveEditRoot,
    RemovalPlanConfirm,
    SHARED_CONFIG_APPLY,
    SHARED_CONFIG_ONE_DIRECTION,
    sharedConfigNeedsTerminal,
    globallyInstalledRemoved,
    unplaceableKept,
    authoredHereKept,
    carriedSkillsWritten,
  ]
related:
  - reference/commands/index.md
  - reference/features/seed-contract.md
  - reference/types/operations-types.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/config/config-writer.md
  - reference/config/config-merger.md
last_validated: 2026-08-17
---

# Edit Command (Detailed)

> **Extracted from:** `reference/commands/index.md` (edit section) and `reference/type-system.md` (edit command types). See [commands/index.md](./index.md) for the full commands reference.

## File: `src/cli/commands/edit.tsx`

**Purpose:** Modify what is installed here, from one of two producers — the wizard, or a configuration shared from agentsinc.sh — and apply the difference. Outputs a styled change summary (chalk-colored `+`/`-`/`~` lines for added/removed/changed skills, agents, origins, scopes) and a simplified completion message (`"Done"`). Change summary uses skill display names (from matrix) and scope labels (`[G]`/`[P]`). Global-to-project scope changes render as green `+` additions.

`edit` is also the one command that stands on **both** ends of the editor round trip: `--ui` mints an id for this installation and opens it in the browser, `--from <id>` applies a configuration back. The wire contract behind both is [`features/seed-contract.md`](../features/seed-contract.md).

## Flags

`static flags` declares three flags — two public, one hidden.

| Flag            | Type    | Hidden | Description                                                                                                                                                                                      |
| --------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| --ui            | boolean | no     | `default: false`. Edit this installation in the browser at agentsinc.sh instead of the wizard. Replaces the wizard rather than preceding it.                                                     |
| --from          | string  | no     | `helpValue: "<id>"`. Apply a configuration shared from agentsinc.sh by its id, **removing whatever it leaves out**. Interactive and destructive — see below.                                     |
| --project-setup | boolean | yes    | Internal: this run continues an `init` project setup (materialise + register even on no-change). Key = `EDIT_PROJECT_SETUP_FLAG` (`"project-setup"`); set only by `init`'s dashboard delegation. |

**`--ui` and `--from` are mutually exclusive.** Passing both is refused with `SHARED_CONFIG_ONE_DIRECTION` (`src/cli/utils/messages.ts`) at `EXIT_CODES.ERROR`, before the fetch and before the mint — they are the two directions of one round trip and there is no order in which doing both in a single run means anything.

There is no `--agent-source` flag, and **no `--source`**: naming a source is `init`'s decision, so `edit`
opens the wizard on the catalogue its config.ts names — project config → global config → default.
`CC_SOURCE` does not point it anywhere either; the environment names a source at install time only.
Passing either spelling of the flag is refused by the parser (`Nonexistent flag: --source`, exit 2).
`--marketplace` / `-m` is likewise `init`-only.

## Two Producers, One Apply Sequence

`EditSelection` is the discriminated union that carries which producer spoke:

```typescript
type EditSelection =
  | { producer: "wizard"; result: WizardResultV2 }
  | {
      producer: "shared";
      result: WizardResultV2;
      /** Statements naming what this run may not remove — rendered in the confirm. */
      kept: string[];
      /** Skills the configuration carries rather than names, written once it is approved. */
      carried: ExternalSkillInstall[];
    };
```

Both produce the same `WizardResultV2` and are applied by the same sequence, so `edit` grows no second copy of its own pipeline. They differ only in what happens between the diff and the first mutation: a wizard result was authored keystroke by keystroke and needs no permission, while a shared configuration arrived whole and destroys whatever it left out, so its removals are shown and confirmed there.

## Flow

The `run()` method in `edit.tsx` orchestrates in this order:

0. `this.ensureConfigReadable(cwd)` (`BaseCommand`) -- hard-errors with `configUnreadableError(...)` when a config file exists but throws `ConfigLoadError`, checking the project's own config and, from a project, the global one every project write inlines. It runs before the spinner renders, so the refusal never sits under a mounted Ink tree, and before any wizard work, so a `ConfigLoadError` cannot surface after skills have been copied and plugins installed. A MISSING config passes through and still reaches `ERROR_MESSAGES.NO_INSTALLATION` below. Full contract: [commands/index.md](./index.md) -> "Unreadable configs are recreated, not edited".
1. Both-flags refusal: `flags.ui && flags.from !== undefined` -> `this.error(SHARED_CONFIG_ONE_DIRECTION, { exit: EXIT_CODES.ERROR })`.
2. `if (flags.ui) return this.openInEditor(cwd)` -- the whole of the outbound half, and it returns. Above the source load, which exists to fill screens this run will never paint.
3. `fetchSharedConfigOrFail(flags.from)` when `--from` is set, else `null`. Refuses a non-TTY run with `sharedConfigNeedsTerminal(id)` **before** the fetch, logs `Fetching configuration ${id}...`, then `fetchSeedConfig(id)`; a `{ ok: false }` result is `this.error(fetched.error, { exit: EXIT_CODES.ERROR })`.
4. `loadContextUnderSpinner()` -- renders a `<Spinner>` and calls `loadContext()` inside a `try/finally` that clears and unmounts it whichever way the await ends (never a `catch`: the throw reaches oclif untouched). `loadContext()` is **Operation: `detectProject()`** + **Operation: `loadSource()`** + `discoverAllPluginSkills()`, merging plugin-discovered skill ids with project config skills (excluded entries filtered out) into `EditContext`.
   4a. `resolveEditRoot(context.installation, cwd, flags[EDIT_PROJECT_SETUP_FLAG])` -- **the one scope decision this command makes.** Returns `EditRoot` (`{ dir, isGlobal, isProjectSetup }`), and every layer below reads it rather than deciding for itself. `dir` is `installation.projectDir` -- the root of the installation `detectProject` found, which is the only root that has a config to edit and therefore the only root this run may write to -- except under `--project-setup`, where it is `cwd`, because `cc init` run in a directory declares that directory the installation being set up. `isGlobal` is `isHomeDirectory(dir)`, the only call to that helper left in the file. `isProjectSetup` is the flag AND `!isGlobal`: at the home root there is nothing to materialise.
5. `this.ensureSavedSkillsReadable(context.projectConfig?.skills ?? [], context.sourceResult.matrix, context.projectDir)` (`BaseCommand`) -- still before anything renders: refuses over a saved entry whose skill IS installed and whose `metadata.yaml` describes no skill, rather than dropping it from `config.ts` on the way out.
6. Producer: `selectionFromSharedConfig(payload, context, editRoot)` when a payload was fetched, else `selectionFromWizard(context, editRoot)`. The wizard producer hydrates `isEditingFromGlobalScope: editRoot.isGlobal`. A `null` selection -> `this.error("Cancelled", { exit: EXIT_CODES.CANCELLED })`. The `--from` producer calls `this.refuseProjectScopedContentAtHome(result, editRoot.dir)` (`BaseCommand`) immediately after `decodeSeedOrFail` and above every skip warning -- the same refusal `init --from` carries, from the one implementation both reach.
7. `this.reportValidationErrors(result.validation)` (`BaseCommand`) -- warns each `SelectionValidation.errors` entry. Advisory; no exit code turns on them.
8. Excluded-entry filter (in `run()`): builds `activeNewSkills`, `activeNewAgents`, `activeOldSkills`, `activeOldAgents`, constructs `filteredResult: WizardResultV2` and `filteredOldConfig: ProjectConfig | null`. All downstream methods see only non-excluded entries; the raw `result` / `projectConfig` are retained for tombstone persistence.
9. `detectConfigChanges(filteredOldConfig, filteredResult, fullEntries)` -- returns `ConfigChanges`. The `fullEntries` third argument carries the unfiltered (tombstone-inclusive) lists used only to classify dual-scope transitions.
10. **Shared-configuration gate** (`selection.producer === "shared"` only), at the one point where the removals are known and none has been made — after the diff, above every mutation, and above the no-change return:
    - `confirmSharedConfigOrCancel(changes, selection.kept)` -- renders `RemovalPlanConfirm` through `promptConfirm()`. Anything but `"confirmed"` logs `"\nEdit cancelled"` and exits `EXIT_CODES.CANCELLED`.
    - `writeCarriedSkills(selection.carried)` -- `writeExternalSkills()` then `carriedSkillsWritten(ids)`. Above the no-change return because a configuration that carries its own skills still has bytes to land when the roster is unchanged.
11. **No-change branch** (`!hasAnyChanges(changes)`): emits `"No changes made."`. If `editRoot.isProjectSetup` is false, returns immediately -- no migration/scope/plugin/config/compile work, no config.ts or config-types.ts written. If `editRoot.isProjectSetup` is true (an `init`-originated dashboard Edit in a project directory), it still runs `writeConfigAndCompile()` + `logCompletionSummary()` so the project is materialised and registered even with an empty roster delta. See Invariants.
12. `unresolvedSkillRemovalReasons(result.unresolvableSkillIds, activeOldSkills, context.projectDir, loadedSourceLabel(context.sourceResult))` -- a `ReadonlyMap<SkillId, string>` of class-specific removal reasons. `loadedSourceLabel` is `sourceResult.marketplace ?? sourceResult.sourceConfig.source`.
13. `logChangeSummary(changes, filteredResult.skills, filteredOldConfig?.skills ?? [], removalReasons)` -- styled diff using display names from matrix; `[G]`/`[P]` scope labels; global-to-project scope changes render with green `+` prefix (not `~`); dual-scope `[P]` add/remove lines via `formatDualScopeTransition()`; a removal row carrying a reason appends it in neutral parentheses.
14. `applyMigrations(changes, filteredResult, activeOldSkills, context, editRoot)` -- `detectMigrations()` + `executeMigration()` for eject-to-plugin and plugin-to-eject mode switches. Plugin-side migrations require the marketplace (`requireMarketplaceOrExit()`) and announce through `announcePluginInstall()`; the outcome goes through `reportPluginInstalls()`, which hard-errors on any failure. Returns `Set<SkillId>` of migrated ids.
15. `recordGlobalSourceMigrations(migratedSkillIds, filteredResult.skills, editRoot, context)` -- in a project-context run, rewrites `origin` on the active-global entries this run migrated, via `config-gate::mutateGlobal({ kind: "migrate-skill-sources", sources })`, so the global config matches the filesystem/plugin registry. No-op at the home root (a global-context edit writes the whole global config from the wizard result anyway). **The gate propagates and recompiles from here** (see below); the result is rendered by `reportPropagatedRecompile(report)`. Wrapped in try/catch — a failure warns `Could not record global origin change: <reason>` and the edit continues, because the migration it failed to RECORD has already happened on disk. It is reported through `reportIncompleteWork`, so the run ends on `EXIT_CODES.COMPLETED_WITH_FAILURES` rather than claiming success over a global config that contradicts the filesystem.
16. `applyScopeChanges(changes, filteredResult, context, editRoot)` -- `migrateLocalSkillScope()` for `origin === "eject"` skills in `scopeChanges`; `requireMarketplaceOrExit()` then `migratePluginSkillScopes()` only when at least one non-eject skill has a scope change. Each entry of that call's `failed` goes through `reportIncompleteWork`: the migration INSTALLS at the new scope, so a failure leaves the skill registered at neither while the config is about to record the new one.
17. `applySourceChanges(changes, activeOldSkills, editRoot, migratedSkillIds)` -- for non-migration `sourceChanges` entries where `from === "eject"`, calls `deleteLocalSkill()` on the old scope's directory resolved via `installBaseDir(editRoot.dir, oldSkill?.scope)`. Skips ids in `migratedSkillIds`.
18. `applyPluginChanges(changes, filteredResult, activeOldSkills, context, editRoot)` -- **Operation: `installPluginSkills()`** (through `installPluginSkillsReported(skills, marketplace, projectDir, matrix)`) for added non-eject skills and **Operation: `uninstallPluginSkills()`** for removed non-eject skills (marketplace resolved via `requireMarketplaceOrExit()`). Two hard-error interrupts live inside the shared reporter, both BEFORE `copyNewLocalSkills` and `writeConfigAndCompile`: `unbackedPluginInstallError` when a selected skill no marketplace could serve is asked for as a plugin, and `pluginInstallFailureError` on any entry in the install result's `failed` list. See Invariants.
19. `copyNewLocalSkills(changes, filteredResult, context, editRoot)` -- **Operation: `copyLocalSkills()`** for added `origin === "eject"` skills.
20. `removeDeletedLocalSkills(changes, activeOldSkills, editRoot)` -- for fully-deselected eject-mode skills, `deleteLocalSkill()` on the scope the skill was installed at (`installBaseDir(editRoot.dir, oldSkill.scope)`). No-op when the directory is absent.
21. `writeConfigAndCompile(result, context, editRoot, authority)` -- **Operation: `loadAgentDefs()`** + **Operation: `writeProjectConfig()`** (`projectDir: editRoot.dir`, `authoritativeScope: authority` from `applyAuthority(selection.producer, editRoot)`) + `reportUnassignedSkills(configResult.config)` + **Operation: `discoverInstalledSkills()`** + **Operation: `compileAgentsAllScopes()`** (single home-root pass, or split global+project passes in a project context). A compile failure does not abort the command — the config write above it has already landed and the recompile is the last step, so there is nothing left to continue to. It is reported instead: each failed sub-agent is warned with the compiler's own reason, and `recordIncompleteWork(agentsNotCompiled(failed), INCOMPLETE_WORK_RECOVERY.RECOMPILE)` files the roster for the ending. A pass that THREW takes the same route through `reportIncompleteWork`. Either way the run exits `EXIT_CODES.COMPLETED_WITH_FAILURES`. The `writeProjectConfig` result is captured as `configResult: ConfigWriteResult | undefined` -- `undefined` when the write threw (warned as `Could not update config: <reason>`).
22. `reportPropagatedRecompile(configResult.propagation)` -- called at the tail of `writeConfigAndCompile`, and only when `configResult` is defined. It renders; the recompile it describes already ran. See Propagated-Project Recompile below.
23. `cleanupStaleAgentFiles(changes, activeOldAgents, editRoot)` -- `planStaleAgentRemovals()` builds one `RemoveCompiledAgentsOptions` per scope directory that holds a stale file, then **Operation: `removeCompiledAgents()`** clears each. Covers the project copy a P→G move superseded, plus every deselected agent at the scope it was installed at (`UNRECORDED_AGENT_SCOPE` is `"project"` for one absent from the old roster). G→P is treated as an override so the global copy is preserved. A file that would not delete goes through `reportIncompleteWork` — a compiled sub-agent this project no longer configures is one Claude Code still loads, so the roster did not actually change.
24. `logCompletionSummary(changes)` -- prints `"✓ Done"` in success color, and prints nothing when `incompleteWork` is non-empty: a tick over a partial apply is the claim being withdrawn, not a line beside it.
25. `exitIfWorkIncomplete()` -- called from `run()`, one statement after `applyEdit()` returns, so it covers every one of that method's endings. Non-empty `incompleteWork` prints `completedWithFailures()` (each failure and the one command that finishes it) and raises `this.exit(EXIT_CODES.COMPLETED_WITH_FAILURES)`. oclif's `ExitError` prints nothing of its own, so the account is the whole of the output.

### Exit codes

| Code                                 | Reached by                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXIT_CODES.CANCELLED`               | The wizard producer returning `null`, and a declined `--from` confirm                                                                                                                                                                                  |
| `EXIT_CODES.ERROR`                   | Both flags at once, an unreadable config, an unusable saved skill, no installation, a fetch failure, a decode refusal, a carried-skill plugin refusal, project-scoped payload content at `$HOME`, `--ui` mint/publish failure, a failed plugin install |
| `EXIT_CODES.INVALID_ARGS`            | oclif's own, for an unknown flag                                                                                                                                                                                                                       |
| `EXIT_CODES.COMPLETED_WITH_FAILURES` | The run finished and part of it did not happen: a failed global-origin record, a failed plugin scope migration, a sub-agent that would not compile or a recompile that threw, or a stale compiled agent file that would not delete                     |

## `--ui`: The Outbound Half

`openInEditor(projectDir)` is the whole of it, and it touches nothing on disk — a configuration is read, not rewritten.

1. `seedPayloadForInstallation(projectDir)` (`src/cli/lib/seed/installation-payload.ts`) — the **same** mint `share` performs: same reader, same mapping, same refusals, same ownership judgement. `{ ok: false }` -> `this.error(prepared.error, { exit: EXIT_CODES.ERROR })`.
2. `Opening ${prepared.skills} skill(s) across ${prepared.agents} sub-agent(s)...`
3. `publishSeedConfig(prepared.payload)` — `{ ok: false }` -> `this.error(published.error, { exit: EXIT_CODES.ERROR })`.
4. `handToBrowser(id)` — `Shared as <id>`, then both lines of `sharedConfigDestinations(id)`, then `openUrl(editorConfigUrl(id))` **only when `process.stdin.isTTY`**. A failure to open warns beside a link that still works.

**The link is printed first and opened second** because printing is the part that works everywhere — over a pipe, in CI, and on a machine with no desktop session. Opening one is the convenience on top. `share` and `edit --ui` differ only in the ending: two spellings of "the installation in this directory" would mint two different ids for one project.

## `--from`: The Inbound Half

`selectionFromSharedConfig(payload, context, editRoot)` produces the `EditSelection`. The apply that follows is **destructive**: the project is made to MATCH the payload, so a skill the previous configuration installed and this one omits is removed.

| Step | What runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `registerExternalSkillsOrFail(payload, context.sourceResult.matrix, editRoot.dir)` -> `registerExternalSkills()`. **Before the decode**, because a carried skill answers to no catalogue: unseated, its id is skipped like any other unknown one. A throw (a carried skill asked for as a plugin) goes through `this.handleError`.                                                                                                                                                |
| 2    | `decodeSeedOrFail(payload, sourceMatrix)` -> `seedToWizardResult()`. A throw (an unwritable `(skill, sub-agent)` pair) goes through `this.handleError`.                                                                                                                                                                                                                                                                                                                           |
| 3    | `this.refuseProjectScopedContentAtHome(result, editRoot.dir)` (`BaseCommand`) — the location refusal, `EXIT_CODES.ERROR`. **The first moment it can be asked and above everything this run would say or do**: only the decode says what scope each surviving entry rests at, and a run about to be refused must not first narrate its skips. `init --from` asks it at the same point of the same value; see [commands/index.md](./index.md) -> the `BaseCommand` narration table. |
| 4    | `skippedUnknownSkills(ids)` / `skippedUnknownAgents(names)` warnings — the same wording `init --from` uses, from `utils/messages.ts`.                                                                                                                                                                                                                                                                                                                                             |
| 5    | `readAuthoredHere(context.projectConfig, editRoot.dir)` -> `skillsAuthoredHere()`. Best-effort: a directory that cannot be read warns `Could not tell which skills were written here: <reason>` and returns an empty set, because the question is only ever asked to PROTECT a skill.                                                                                                                                                                                             |
| 6    | `reconcileSharedConfig({ decoded, installed, authoredHere, unplaceable })` (`src/cli/lib/seed/seed-apply.ts`). **It takes no authority word** — scope does not protect an entry from this apply. `unplaceable` is the skip set step 4 just reported, stated by the caller rather than recomputed, so a second derivation cannot disagree with the skips this run printed.                                                                                                         |
| 7    | Returns `{ producer: "shared", result: reconciled.result, kept: keptStatements(reconciled.kept), carried }`.                                                                                                                                                                                                                                                                                                                                                                      |

### The confirm

`confirmSharedConfigOrCancel` builds the plan from the **same `ConfigChanges` the apply acts on**, so what is approved and what is removed are one value read twice.

**There are two plans, chosen by WHICH installation is being edited, and they are two branches rather than one branch worded twice.** `editRoot.isGlobal` picks between them:

- `globalScopePlan` — inside the global installation, the ordinary plan and deliberately nothing more. The location IS the global scope and the person chose it, so a second acknowledgement restates what the directory already states.
- `projectScopePlan` — inside a project, where a removal can reach past the directory it was asked for in. Global-scoped removals get their own sections and their own statement.

The props are `RemovalPlanConfirm`'s (`src/cli/components/common/removal-plan-confirm.tsx`), shared with `uninstall`:

| Prop         | Source                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heading`    | `planHeading(sections)` — `SHARED_CONFIG_APPLY.PREVIEW_HEADING`, or `SHARED_CONFIG_APPLY.NOTHING_REMOVED` when nothing is removed                                                                                                                                                      |
| `sections`   | `removalSections(skills, agents)` — `SKILLS_HEADING`, `AGENTS_HEADING`; in a project, plus `globalRemovalSections(...)` — `GLOBAL_SKILLS_HEADING`, `GLOBAL_AGENTS_HEADING` — over the half `splitRemovalsByScope` found active at global scope. A section with no items is not emitted |
| `statements` | Prose under the removals, in order: `globalReachStatement` (project runs with a global removal only) → `keptStatements(kept)`                                                                                                                                                          |
| `message`    | `SHARED_CONFIG_APPLY.CONFIRM`                                                                                                                                                                                                                                                          |

`skillLabel(id)` is `displayName === id ? id : "<displayName> (<id>)"`.

**A configuration that only adds is still confirmed.** The heading changes; the prompt does not. It is still applied whole.

### A global entry is REMOVED from a project, under a statement naming who else that reaches

Scope does not protect an entry from `edit --from`. A globally installed skill or sub-agent the payload omits is removed by a project-scope run as well as by one at the home root — the removal is shown under its own heading, and `globallyInstalledRemoved(otherProjects)` (`src/cli/utils/messages.ts`) counts AND names the other registered projects the yes changes, because "2 other projects" cannot be weighed against anything and a path can. With no other project registered it says so, and says that a project set up later inherits whatever the global install holds then. Nothing is refused over the reach; the ruling is that the user may do it, and a yes given without knowing the reach is a yes to a change nobody described.

The statement is printed **only from a project**. `otherRegisteredProjects(editRoot.dir)` supplies the list, and `globalReachStatement` returns nothing when the run removes nothing at global scope.

### What the run may not remove

`reconcileSharedConfig` returns `KeptFromRoundTrip`, **two** lists split by the reason — because the two reasons have different remedies and only the user knows which they meant:

| Field                 | Meaning                                                                                            | Remedy the statement names |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| `authoredSkillIds`    | Written here rather than installed — no `forkedFrom`, so no shared configuration ever carried them | `edit`                     |
| `unplaceableSkillIds` | NAMED by this configuration and unplaceable by this catalogue, so the instruction never applied    | `update`, then apply again |

Both are skills only; authorship and placeability are properties of a skill. Where both are true, authorship wins the split (`reasonKept`): a skill nobody installed cannot be removed by any shared configuration from anywhere, while an unplaceable id is inert only for as long as this installation reads this catalogue — so the more permanent claim is the one worth naming.

Both are additionally required to be non-excluded and absent from the payload. A tombstone qualifies as neither — it is a statement about something NOT installed here, so there are no files to protect and nothing to tell the user is staying.

**Scope is not one of the two, and `seed-apply.ts` therefore takes no authority word.** What this module protects is only what a removal may never be INFERRED from. An entry's scope infers nothing — it decides who ELSE a removal touches, which is the confirm's subject rather than this one's, and the section above is where that is said.

**The entries are put back into the RESULT, not excused at the writer** — see the invariant below for why that distinction is the whole of the module. What comes back with an entry matters as much as the entry: `withKeptStackRows` carries the installed stack rows a kept skill needs — under a SURVIVING sub-agent only, and only the assignments naming a kept skill; a row under a sub-agent this configuration removes is dropped with it — and `withKeptDomains` puts a kept skill's domain back on `selectedDomains`, because a kept skill hidden from the next wizard would be deselected by not being shown and deleted by the run after this one.

### Ownership: `forkedFrom` decides

`forkedFrom` (`ForkedFromMetadata` in `src/cli/lib/skills/skill-metadata.ts`) is the package's single answer to "did the CLI put this directory here?". `judgeSkill` in `installation-payload.ts` is the one definition both halves of the round trip ask:

| Entry                                                         | Judgement                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `origin !== "eject"`                                          | Owned. A marketplace skill has no local directory to hold provenance and needs none                    |
| Excluded (tombstone)                                          | Owned. Nothing is installed, so there are no bytes either way                                          |
| Ejected, but no directory on disk                             | Owned. A config recording an install that is not there is evidence of nothing, and travels as recorded |
| Ejected, directory exists, `readForkedFromMetadata` -> `null` | **Not owned.** Somebody's own work                                                                     |
| Ejected, directory exists, provenance present                 | Owned, and its bytes may travel (`OwnedSkillDir`)                                                      |

**Exclusion fires only on positive evidence.** A hand-authored skill in `.claude/skills/` is outside the round trip in both directions: not carried in a payload, and not deleted by `edit --from`. An external skill that arrived in a payload **is** owned, because `registerSkillOnDisk` stamps `forkedFrom` (with `source` and `path`) when it writes it.

## Propagated-Project Recompile

`writeProjectConfig` returns `ConfigWriteResult`, whose `propagation: GateReport` describes what the config-gate did: `propagated.updated` lists the **other** registered project directories whose `config.ts` this run's global change was fanned out into, and `recompile` is the summary of the recompile the gate **already performed** in them. Rewriting a project's config leaves its compiled agents stale, so the gate recompiles them inside the write rather than returning a to-do list a caller can drop.

```typescript
protected reportPropagatedRecompile(report: GateReport): void;
```

- Returns immediately (nothing logged) when `report.propagated.updated` is empty.
- Otherwise re-emits each `report.recompile.warnings` entry via `this.warn()`. Those warnings originate in **Operation: `recompilePropagatedProjectAgents(projectDirs)`** (`src/cli/lib/operations/project/recompile-project-agents.ts`), which the gate calls through `config-gate/recompile.ts` and which runs `recompileRegisteredProjectAgents` per directory with **per-project failure isolation**.
- The summary line is `propagatedRecompileSummary(rewrittenCount, unchangedCount, failedCount)` from `src/cli/utils/messages.ts` — `Recompiled agents in N registered projects, M unchanged`, with a ` (K failed)` suffix when `failedCount > 0`.
- `edit` calls it from **two** places: the tail of `writeConfigAndCompile` (step 23) and `recordGlobalSourceMigrations` (step 16), which fires a T1 change of its own.

**One sentence, four commands.** `reportPropagatedRecompile` is `protected` on `BaseCommand` (`src/cli/base-command.ts`) and `init`, `edit`, `compile` and `uninstall` all call that one method — there is no per-command wording to preserve. E2E anchors on the command-agnostic `STEP_TEXT.PROPAGATED_RECOMPILE` prefix for assertions that must hold across commands.

## Writer Selection Inside `writeProjectConfig`

`writeProjectConfig` (in `src/cli/lib/operations/project/write-project-config.ts`) delegates config persistence to `writeScopedFromWizard` (in `src/cli/lib/config-gate/index.ts`), which branches on whether `projectDir` resolves to the home directory:

- **Home context** (`realpath(projectDir) === realpath(os.homedir())`): classifies the change against the config already on disk, then writes both halves of `~/.claude-src/` from one config via `writeGlobalPair` (each half skipped when its bytes did not move). Propagates to all registered projects when `finalConfig.projects` is non-empty, and recompiles those projects' agents.
- **Project context**: splits `finalConfig` by scope. Global side writes the pair against the merged `effectiveGlobalConfig`. Project side calls `writeProjectConfigPair`, which emits `config.ts` and then `regenerateConfigTypes(projectDir, backgroundData, buildProjectTypesExtras(inlinedProjectView(reconciledSplit, effectiveGlobal), matrix))` so the project's `config-types.ts` imports `GlobalSkillId` / `GlobalAgentName` / `GlobalCategory` / `GlobalDomain` from the global types module and extends them with every active entry the sibling `config.ts` names — the inlined global-scoped rows included. `regenerateConfigTypes` falls back to the standalone form when no global install is present.

`writeScopedFromWizard` returns a `GateReport`, which `writeProjectConfig` surfaces as `ConfigWriteResult.propagation` for step 23.

**The fan-out trigger is classification, not a merge flag.** `classifyGlobalChange` diffs the config on disk against the one being written and assigns a tier: T1 (skills / agents / stack / selectedDomains, including a per-skill `origin` change) propagates the pair and recompiles; T2 (an inlined scalar only) propagates the config half without regenerating types or recompiling; T3 (`projects[]` only) does neither; T4 writes nothing.

**Cross-scope reconciliation before the project write.** In the project branch, `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` runs **immediately before** `writeProjectConfigPair` -- the raw split handed straight to the inlining writer would let a project-owned skill and a colliding live global install both land as active entries in the same project config. The same step also runs inside `propagateGlobalChangesToProjects`; both write sites can produce the malformed shape, so both must run it. Masking is project-local (a tombstone is never written into `~/.claude-src/config.ts`), covers identity collisions for skills and agents plus exclusive-category collisions for skills only, and self-heals derived masks whose collision has cleared before re-deriving. The project's own skill wins locally.

See `reference/config/config-writer.md` for the full writer-selection matrix and `reference/concepts/tombstone-pattern.md` for mask provenance and lifetime.

## Invariants

- **No orphan config entries on plugin failure.** `applyPluginChanges` hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` when the plugin install reports any failures. This fires before `copyNewLocalSkills` and `writeConfigAndCompile`, so `config.ts` is never written claiming a skill was installed that did not install. Error message instructs: verify skill id matches marketplace, run `update` to refresh the marketplace, or switch affected skills to eject mode.
- **Plugin install intent is inviolable.** There is no silent fallback from plugin to eject. Marketplace resolution failure in `requireMarketplaceOrExit()` (BaseCommand, wrapping the `requireMarketplace` operation) also hard-errors.
- **No-change flows skip all writes -- except an init-originated project setup.** When `hasAnyChanges(changes)` is false, `run()` logs `"No changes made."` and returns without config write, recompile, or agent cleanup -- UNLESS `editRoot.isProjectSetup` (`flags[EDIT_PROJECT_SETUP_FLAG] && !editRoot.isGlobal`) is true, in which case it still runs `writeConfigAndCompile()` to materialise `<project>/.claude-src/config.ts` + `config-types.ts` and register the project in the global `projects[]`. This intent is passed explicitly by `init`'s dashboard delegation (`dashboardCommandArgv()` appends `--project-setup` only for an `init`-originated Edit); it is NOT re-derived from config state. A bare `cc edit` (and a bare-`cc` `"standalone"` dashboard Edit) carries no flag, so a no-change pass stays a read-only inspection. See `.ai-docs/standards/clean-code-standards.md` § 18.3 for the general rule and `.ai-docs/agent-findings/2026-07-20-edit-hasanychanges-gate-blocks-project-materialisation.md` for this instance.
- **One directory, decided once.** `resolveEditRoot` answers which installation this run is editing, and every layer below takes the answer as a parameter (`EditRoot`) rather than re-deriving it. Six layers used to decide separately and three read `process.cwd()`, so a run started in a directory holding no installation disagreed with itself: the wizard offered the project/global scope toggle over a project that did not exist, while `writeProjectConfig` saw a project context and wrote a `.claude-src/` pair into an unrelated checkout. The class is held by `src/cli/lib/__tests__/edit-decides-scope-once.test.ts`, which pins `isHomeDirectory(`, `process.cwd()` and `os.homedir()` at one site each in `edit.tsx`; the behaviour is held by `e2e/lifecycle/edit-outside-an-install-edits-the-global-one.e2e.test.ts`, whose control half drives the same edit from a directory that DOES hold an installation.
- **Excluded entries are filtered once.** The `activeNewSkills` / `activeOldSkills` split happens once in `run()`; every downstream private method receives only non-excluded entries. Excluded skills remain in the raw `result` / `projectConfig` for persistence by `writeProjectConfig` so tombstones survive.
- **A carried skill's bytes land only after the confirm.** `writeCarriedSkills` runs immediately after `confirmSharedConfigOrCancel` and nowhere else, so a declined plan writes nothing at all.
- **Config write failure does not abort.** A throw from `writeProjectConfig` is caught and warned (`Could not update config: ...`), leaving `configResult` undefined; compilation still runs and the propagated-project recompile is skipped. This is deliberately weaker than the plugin-install contract above, which hard-errors.

### Globally installed items are immutable from project scope, and TWO layers enforce it

They protect different things, and confusing them is how a project run deletes a global install.

| Layer                | Where                                                                                                       | What it protects                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The **writer**       | `authoritativeScope: "owned"` -> `isWithinSessionAuthority` in `src/cli/lib/configuration/config-merger.ts` | The config ROW. An inherited global-active entry absent from the new config is preserved rather than dropped |
| The **removal diff** | `ConfigChanges.removedSkills` / `removedAgents`, built by `detectConfigChanges`                             | Nothing. It is what DRIVES `uninstallPluginSkills`, `deleteLocalSkill` and `removeCompiledAgents`            |

The merger's authority does not reach the disk. **An entry left in the removal set is deleted from the filesystem and the plugin registry whatever the merger later does with its row.**

Every wizard-driven caller reaches the writer through the wizard store, which refuses to deselect a live global entry at all (`toggleTechnology` / `toggleAgent` toast; `toggleSkillScope` / `toggleAgentScope` no-op unless `isEditingFromGlobalScope`). So a wizard-produced `removedSkills` never carries a global entry, and on that path the store is the whole of the protection.

**`edit --from` bypasses the store.** A payload states a roster directly, so `reconcileSharedConfig` puts back what the run may not remove **into the result, before the diff is taken** — which is the only place the removal diff can see it. Two separately-remedied reasons, and **scope is not one of them**: authored-here (ownership) and named-but-unplaceable-by-this-catalogue. `ReconcileOptions` carries no authority word — a globally-installed entry this configuration leaves out is REMOVED, under headings that say so and beneath `globallyInstalledRemoved`. See "What the run may not remove" above.

Domain deselection remains a **view filter** -- it hides a domain's skills and drops only what the project owns, leaving global entries neither dropped nor masked. `isEditingFromGlobalScope` is the only bypass at the store; init mode is not one. See `reference/concepts/scope-system.md` and `reference/concepts/guard-pattern.md`.

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

`sourceChanges` is keyed on `SkillConfig.origin` — the field is named `origin` on the config type and `sourceChanges` on the diff.

### detectConfigChanges (in `edit.tsx`)

```typescript
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
  fullEntries?: FullScopeEntries,
): ConfigChanges;
```

`oldConfig` / `wizardResult` carry the ACTIVE (tombstone-filtered) entries used for add/remove/origin/scope diffing. `fullEntries` (`{ newSkills, oldSkills, newAgents, oldAgents }`), when provided, carries the unfiltered lists (including excluded tombstones) used ONLY to tell a genuine scope migration apart from a dual-scope add/remove (`detectDualScopeTransitions()`). When omitted, every scope change is treated as a migration (pre-dual-scope behaviour). Uses `remeda.difference()` for added/removed and `remeda.indexBy()` for property change detection (origin, scope, agent scope).

### applyMigratedGlobalSources (re-exported from `edit.tsx`)

```typescript
function applyMigratedGlobalSources(
  globalSkills: SkillConfig[],
  migratedSources: ReadonlyMap<SkillId, string>,
): { skills: SkillConfig[]; changed: boolean };
```

Rewrites `origin` on exactly the active-global entries listed in `migratedSources`, returning every other entry identical by reference. `changed` is false when nothing needed rewriting, so the gate's `migrate-skill-sources` mutation reports a no-op and skips the global write entirely. The transform lives in `config-gate/index.ts`; `edit.tsx` re-exports it (`export { applyMigratedGlobalSources }`) for tests.

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
  skills: Pick<SkillConfig, "id" | "origin">[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult>;
```

Handles plugin-mode skill scope migrations. Skips `origin === "eject"` skills (handled separately by `migrateLocalSkillScope`). For project-to-global: uninstalls project-scope, installs global-scope. For global-to-project: adds project-scope registration (keeps global for other projects).

## Key Dependencies

- `src/cli/lib/operations/index.ts` -- `detectProject`, `loadSource`, `installPluginSkills`, `pluginInstallFailureError`, `uninstallPluginSkills`, `copyLocalSkills`, `writeProjectConfig`, `ConfigWriteResult`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `loadAgentDefs`, `removeCompiledAgents`, `RemoveCompiledAgentsOptions`
- `src/cli/lib/config-gate/index.ts` -- `applyMigratedGlobalSources`, `mutateGlobal`, `GateReport`
- `src/cli/base-command.ts` -- `ensureConfigReadable`, `ensureSavedSkillsReadable`, `refuseProjectScopedContentAtHome`, `reportValidationErrors`, `requireMarketplaceOrExit`, `installPluginSkillsReported`, `announcePluginInstall`, `reportPluginInstalls`, `reportUnassignedSkills`, `reportPropagatedRecompile`
- `src/cli/lib/installation/index.ts` -- `detectMigrations`, `executeMigration`, `isHomeDirectory` (called once, in `resolveEditRoot`), `installBaseDir`, `resolveInstallPaths`, `INSTALL_MODE_DESCRIPTIONS`, `Installation`
- `src/cli/lib/plugins/index.ts` -- `discoverAllPluginSkills`, `buildMarketplacePluginRef`, `toClaudePluginScope`
- `src/cli/lib/skills/index.ts` -- `deleteLocalSkill`, `migrateLocalSkillScope`, `unresolvedSkillRemovalReasons`
- `src/cli/lib/seed/installation-payload.ts` -- `seedPayloadForInstallation`, `skillsAuthoredHere`
- `src/cli/lib/seed/fetch-seed.ts` -- `fetchSeedConfig`; `src/cli/lib/seed/publish-seed.ts` -- `publishSeedConfig`
- `src/cli/lib/seed/external-skills.ts` -- `registerExternalSkills`, `writeExternalSkills`, `ExternalSkillInstall`
- `src/cli/lib/seed/seed-to-wizard.ts` -- `seedToWizardResult`, `SeedMapping`; `src/cli/lib/seed/seed-apply.ts` -- `reconcileSharedConfig`, `KeptFromRoundTrip`
- `src/cli/components/wizard/run-wizard-session.tsx` -- `runWizardSession`
- `src/cli/components/common/removal-plan-confirm.tsx` -- `RemovalPlanConfirm`, `RemovalPlanSection`; `src/cli/components/common/prompt-confirm.tsx` -- `promptConfirm`; `src/cli/components/common/spinner.tsx` -- `Spinner`
- `src/cli/utils/open-url.ts` -- `openUrl`; `src/cli/consts.ts` -- `editorConfigUrl`, `EDIT_PROJECT_SETUP_FLAG`, `EJECT_SOURCE`
- `src/cli/utils/messages.ts` -- `SHARED_CONFIG_APPLY`, `SHARED_CONFIG_ONE_DIRECTION`, `sharedConfigNeedsTerminal`, `sharedConfigDestinations`, `globallyInstalledRemoved`, `authoredHereKept`, `unplaceableKept`, `carriedSkillsWritten`, `skippedUnknownSkills`, `skippedUnknownAgents`, `localSkillsCopied`, `recompileSummary`

## Test Surface

Owned by [`features/seed-contract.md`](../features/seed-contract.md) for everything under `src/cli/lib/seed/` and the round-trip command specs (`edit-from.test.ts`, `edit-ui.test.ts`, `e2e/commands/edit-from.e2e.test.ts`, `e2e/commands/edit-ui.e2e.test.ts`, `e2e/interactive/edit-from.e2e.test.ts`). The wizard-producer specs are `src/cli/lib/__tests__/commands/edit.test.ts` and the `e2e/interactive/edit-*` family; `e2e/commands/edit-corrupt-config.e2e.test.ts` pins the unreadable-config refusal.
