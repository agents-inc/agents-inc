---
scope: reference
area: concepts
keywords:
  [
    guard,
    toast,
    isInstalledGlobal,
    toggleTechnology,
    toggleAgent,
    toggleSkillScope,
    toggleAgentScope,
    eject-guard,
    silent-no-op,
    focusedSkillId,
    scenario-b-race,
    dual-scope-inert-spacebar,
    guard-asymmetry,
    conflict-mask,
  ]
related:
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/wizard/state-transitions.md
  - reference/features/wizard-flow.md
last_validated: 2026-07-30
---

# Guard Pattern

> **Cross-cutting concept.** Consolidates guard documentation from: `wizard-flow.md` (Global-Item Guards, Scope Toggle Eject Guard), `state-transitions.md` (guard tables in selection actions), and the hotkey dispatcher in `wizard.tsx`.

## Overview

The wizard implements guards at two layers: the **hotkey dispatcher** in `wizard.tsx` (via `useInput`) and the **store actions** in `wizard-store.ts`. Guards produce one of three outcomes:

- **Toast** — user-visible `toastMessage` is set; state otherwise unchanged.
- **Silent no-op** — action returns the current state unchanged, no feedback.
- **Warn-and-return** — `warn()` is logged (stderr / dev-only), state unchanged.
- **Refuse the run** — a command-layer guard hard-errors before the wizard mounts. One member, below.

No guard inside the wizard throws. Throws in the wizard (`handleComplete` stack lookup) are data-integrity assertions, not guards.

## Guard Preconditions

The three global-item guards in `toggleTechnology` / `toggleAgent` share a single bypass precondition:

| Field                      | Bypass When | Purpose                                             |
| -------------------------- | ----------- | --------------------------------------------------- |
| `isEditingFromGlobalScope` | `true`      | Editing from `~/.claude/` — guard is not meaningful |

**`isInitMode` is no longer a bypass.** Every global-item guard, and the scope-toggle guards (`toggleSkillScope`, `toggleAgentScope`), now gate on `isEditingFromGlobalScope` alone: a globally-installed skill or agent is immutable from project scope in every flow. Removing the init arm was a production no-op — a real `cc init` can never see a global preselection (`Init.run` routes to the dashboard → `edit` whenever `detectInstallation` / `detectGlobalInstallation` finds one, so `isInitMode === true` implies `installedSkillConfigs === null`) — but it closes the bypass at store level so no future caller can reach through it.

## Guard Registry

### 1. Global Skill Toggle Guard (`toggleTechnology`)

**File:** `wizard-store.ts` — `toggleTechnology` action.

**Trigger:** Toggling a skill in the build step (SPACE on a skill tag).

**Guard condition (`isGloballyLockedSkill`, two arms) — the lock covers GLOBAL-OWNED halves only:**

- **Snapshot arm:** `hasGlobalActive(installedSkillConfigs, id)` — a genuinely global-only install in the hydration snapshot blocks both directions (long-standing read-only behaviour).
- **Live tombstone arm:** `isSelected && hasGlobalTombstone(installedSkillConfigs, id) && hasGlobalActive(skillConfigs, id)` — blocks the DESELECT of the stale-snapshot state a `[P][G]` pair reaches after an in-session `s` collapse (the snapshot still shows the tombstone; the live config now holds a plain active global). Gated on `isSelected` so the sanctioned re-select restore path still runs, and it never fires on a skill freshly added this session (absent from the snapshot).

Both arms additionally require `!isEditingFromGlobalScope`.

**What the guard does NOT cover: the project half of a live `[P][G]` pair.** SPACE on such a row drops the half the project owns — `applySkillRemoval` collapses the pair to the inherited global entry it was masking, so the global install underneath is neither uninstalled nor tombstoned and the row keeps rendering `[G]`. A skill freshly added this session is likewise nobody's install yet and stays freely deselectable.

**Outcome:** Toast — `"Global skills cannot be changed from project scope"`.

**Exclusive-mode replacement variant (`blocksExclusiveSwap`):** In an exclusive (radio) category, selecting another skill when the current selection is globally locked by either arm above — OR is a live `[P][G]` pair — trips the same toast. The pair is included HERE and not in the deselect guard for one reason: dropping its project half unmasks the global install as an active entry, so a swap that did it implicitly would seat the new pick beside a still-active sibling in a category that permits one. Removing the pair stays the project's to do, on its own row, where nothing takes the freed slot.

### 2. Only-Skill Deselect Guard (`toggleTechnology`)

**File:** `wizard-store.ts` — `toggleTechnology` action.

**Trigger:** Deselecting a skill in a category that is both `exclusive` and `required`, when that category has only one defined skill.

**Guard condition:** `isSelected && categoryDef.exclusive && categoryDef.required && categorySkillCount <= 1`.

**Outcome:** Toast — `"Cannot deselect the only skill in this category"`.

### 3. Global Agent Toggle Guard (`toggleAgent`)

**File:** `wizard-store.ts` — `toggleAgent` action.

**Trigger:** Toggling an agent in the agents step.

**Guard condition (`isActiveGlobal`):** mirrors the skill-path two-arm shape — `agentHasGlobalActive(installedAgentConfigs, agent)` OR (`agentHasGlobalTombstone(installedAgentConfigs, agent) && agentHasGlobalActive(agentConfigs, agent)`), AND `!isEditingFromGlobalScope`.

**Two dual-scope branches run BEFORE this guard:** (a) a live `[P][G]` pair (`isDualScopeAgentPair(agentConfigs, agent)`, gated on `!isEditingFromGlobalScope`) makes SPACE **inert** — it returns the `GLOBAL_AGENTS_LOCKED` toast and leaves the pair intact, so only `s` (`toggleAgentScope`) can change a dual-scope agent row; (b) an inherited-global re-select (`agentHasGlobalActive(agentConfigs) && !agentHasProjectActive(agentConfigs) && !selectedAgents.includes(agent) && agentHasGlobalTombstone(installed)`) rebuilds the pair via `restoreDualScopeAgent`. See [tombstone-pattern.md](./tombstone-pattern.md).

**Outcome:** Toast — `"Global agents cannot be changed from project scope"`.

### 4. Scope Toggle Global-Context Guard (hotkey layer)

**File:** `wizard.tsx` — `HOTKEY_SCOPE` handler (both `step === "build"` and `step === "agents"` branches).

**Trigger:** Pressing `S` when `isEditingFromGlobalScope === true`.

**Outcome:** Toast — `"Scope toggle unavailable in global context"`. Fires before the store action is called.

> **Not previously documented** — this toast is emitted in the hotkey dispatcher, not the store. The store's `toggleSkillScope` / `toggleAgentScope` have a matching silent guard that catches direct action calls (e.g. tests, programmatic callers).

### 5. Dual-Scope `s`/SPACE Contract (`toggleSkillScope`, `toggleAgentScope`, `toggleTechnology`, `toggleAgent`)

**File:** `wizard-store.ts` — the four toggle actions.

**Trigger:** Pressing `s` or SPACE on a live `[P][G]` dual-scope skill/agent.

**`s` is the sole dual-scope toggle.** `toggleSkillScope` / `toggleAgentScope` round-trip a pair both ways with **no blocking guard** — `[P][G]` → `[G]` (P→G drops the tombstone) → `[P][G]` (G→P re-adds the tombstone, because `wasInstalledGlobally` counts a snapshot global entry/tombstone as installed). The persisted-pair guard and its session-rebuilt-pair state tracking were removed — a reopened-from-disk pair and a session-built pair behave identically.

**SPACE means different things on the two paths.** On a SKILL row it drops the half the project owns: the pair collapses to the inherited global entry and the row keeps rendering `[G]` (see guard #1 — the lock covers global-owned halves only, and an exclusive-category radio swap still refuses via `blocksExclusiveSwap`). On an AGENT row it stays inert: `toggleAgent`'s `isDualScopeAgentPair(agentConfigs, agent)` arm (guard #3) returns the global-locked agent toast and leaves the pair intact, so `s` remains the only key that changes a dual-scope agent.

**No dual-scope toast fires on `s`** — the toast constant was removed together with the persisted-pair guard, so `s` over a dual-scope pair changes scope silently rather than emitting a toast.

### 6. Skill Scope Eject-Collision Guard (`toggleSkillScope`)

**File:** `wizard-store.ts` — `toggleSkillScope` action.

**Trigger:** Pressing `S` on a focused project-scoped `eject` skill.

**Guard condition:** `config.scope === "project" && config.origin === EJECT_SOURCE` AND a non-excluded global eject entry exists in `installedSkillConfigs` (its `origin` likewise compared against `EJECT_SOURCE`) AND no excluded tombstone for the same skill id is present in `skillConfigs`.

**The field on `SkillConfig` is `origin`, not `source`.** `SkillReference.source` — the compiler-side twin threaded onto each reference by `buildCompileAgents` — is a different declaration carrying the same value, so a grep for one name misses every site that spells it the other.

**Outcome:** Toast — `"Already exists as ejected skill at global scope"`.

**Undo path:** When an excluded tombstone for the same skill id is present, the guard allows the toggle. The tombstone proves this is an undo of a prior G→P, not a fresh collision. See [tombstone-pattern.md](./tombstone-pattern.md) "`toggleSkillScope` / `toggleAgentScope` — `s` Is the Sole Dual-Scope Toggle". Because a live `[P][G]` pair always carries the excluded global tombstone, a reopened dual-scope eject pair reaches this check but is allowed via the undo path — `s` collapses it to `[G]`. No guard short-circuits ahead of this check.

**Tombstone side effects** (on successful toggle, not part of the guard):

- G→P: adds excluded global tombstone iff `wasInstalledGlobally` (which now counts a global tombstone as "installed globally").
- P→G: unconditionally drops any same-id global tombstone (invariant).

### 7. Skill/Agent Scope Silent Guards (`toggleSkillScope`, `toggleAgentScope`)

**File:** `wizard-store.ts`.

**Guard conditions (silent returns):**

- `isEditingFromGlobalScope === true` — return current state, no state change. This is the first line of both actions.
- No non-excluded config found for the target id/name — return current state.

**Outcome:** Silent no-op. These catch direct action calls that bypass the hotkey layer's toast.

**The first condition is also what keeps the home root global-only**, together with
`createDefaultSkillConfig`, which mints `scope: "global"` — so an untouched pick at `$HOME` is
already correct and the toggle that could spoil it declines to run. See
[`scope-system.md`](./scope-system.md) § The Global Root Holds Only Global-Scoped Content for the
other four producers of the same rule.

### 9. Ownership-Aware Skill Removal (`applySkillRemoval`)

**File:** `wizard-store.ts` — helper used by `toggleTechnology`, `toggleDomain` (and, indirectly, `reconcileSkillConfigs`).

**Behavior (predicate, not toast):** removal is scoped to what the project **owns**. An entry is dropped when `isProjectOwned(entry)` (project-scoped, or the project's own global tombstone), or when the id is absent from `installedSkillConfigs` (added this session, so nobody's install yet — an accidental add stays undoable). An entry that is neither — an **inherited** global-active entry present in the snapshot — survives **byte-identical**. It is never stamped `excluded`: `applySkillRemoval` is no longer a tombstone producer. When the caller passes `null` for `installedSkillConfigs` (editing FROM global scope) nothing is inherited, so every removed id is dropped outright (Scenario C).

**Dual-scope branch(resolved):** `applySkillRemoval` recognises a dual-scope pair (`isDualScopePair`: active project entry + global tombstone). On removal it drops BOTH halves and re-surfaces a single inherited-global entry, so the `[G]` badge keeps rendering. Every removal path reaches it — spacebar on the pair's own row included, since the deselect lock covers global-owned halves only (guard #1). The mirror restore (re-select rebuilds `[P][G]`) lives in `reconcileSkillConfigs`. On the agent path the collapse is `toggleAgentScope`'s `s` toggle (dropping the tombstone); the restore is `restoreDualScopeAgent`, invoked from the `toggleAgent` action.

**`toggleDomain` is a view filter, not a tombstone path.** Deselecting a domain hides it and drops the project-scoped entries the project owns in it; inherited global entries are untouched. It carries no toast because it refuses nothing — it simply has no authority over the global install. This is a store invariant with no reachable UI surface — the DOMAINS step is init-only, and `cc edit` hydrates at `build` with `history: []`, so the build step's ESC handler cannot walk backwards into it. A domain deselect therefore never meets a globally-installed entry in production, which is why the behaviour is pinned at unit level in `wizard-store.test.ts` rather than by an E2E spec.

> Listed here as a guard-class predicate — it shapes the state without user feedback. See [tombstone-pattern.md](./tombstone-pattern.md) "Dual-Scope Spacebar + Scope-Aware Removal".

### 10. Stack-Build Ownership Guard (`shouldIncludeTriple`)

**File:** `src/cli/lib/configuration/config-generator.ts` — used by `buildAgentStack`.

**Trigger:** Writing the config `stack` property during compilation — decides whether to include a `(agent, category, skillId)` triple.

**Guard class:** Predicate (not toast). Included here because it is the same "reject invalid triples" discipline:

- When `inputs.newlyAddedSkillIds === undefined` (legacy/no-opt-in caller): include unconditionally.
- When the agent is new this session (`agent ∉ existingStack`): include (full ownership-derived stack).
- Otherwise (existing agent): keep a skill already present in that agent's prior category assignment; additionally admit a skill in `newlyAddedSkillIds` OR a `(agent, skillId)` pair whose scope-compatibility was gained this session (`scopeEligibilityGained`, keyed by `scopeEligibilityKey(agent, skillId)`); omit everything else (respecting the user's prior per-agent curation).

**Outcome:** Silent — the triple is dropped from the output. See [config-generator reference docs](../config/configuration.md) for the D-220 delta-pipeline context.

### 11. Pre-Wizard Saved-Skill Metadata Refusal (`ensureSavedSkillsReadable`)

**File:** `src/cli/base-command.ts` — `protected async ensureSavedSkillsReadable(savedSkills, matrix, projectDir)`. Its classifier is `findUnusableSavedSkillMetadata` in `src/cli/lib/skills/unresolved-skill-entries.ts`.

**Caller:** `src/cli/commands/edit.tsx` — `run()`, after `loadContext()` and **before** `runEditWizard()`. It sits one layer below `ensureConfigReadable`, which runs first: the config parses, and a file it points at does not.

**Trigger:** a saved, non-excluded `config.skills` entry the loaded catalogue does not carry, whose local skill IS installed at `<skillsDir>/<id>` and whose `metadata.yaml` `readSkillMetadata` refuses.

**Guard condition:** the entry classifies as `unusable-metadata` — the directory exists, a `metadata.yaml` exists, and `readSkillMetadata(metadataPath)` returns `{ usable: false }`. Only ids missing from the catalogue are examined, so a healthy installation pays no filesystem read.

**Outcome:** **Refuse the run.** One `skillMetadataUnusableDetail(entry)` line is **logged** per file (path plus reason — oclif hard-wraps error text and a split path cannot be copied), then `this.error(savedSkillMetadataUnusableError(unusable), { exit: EXIT_CODES.ERROR })`. The same split `compile` makes over the same verdict about the same file.

**Why it is a guard and not a removal.** Every other unresolvable class is removed and named (see [config/config-merger.md](../config/config-merger.md), "The reason is class-specific"). This one is repairable — the skill is installed and only its `metadata.yaml` stopped describing it — so dropping the entry would spend a config record on a YAML typo and blame the marketplace for it. Running before the wizard mounts is the point: past that, a refusal costs the user the session they had already spent.

**Not refused:** an entry whose files are simply gone (`files-gone`). There is no file to repair, so it is removed with a reason that says so.

## Guard Asymmetry — Refusal vs. Masking

Two rules in this codebase resolve the _same shape_ of conflict — one exclusive category, one project-owned skill, one globally-installed skill — in **opposite directions**. This is deliberate. Do not "harmonise" them.

| Situation                                                                                                                   | Layer                                                                            | Outcome                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| User presses SPACE to select a different skill in an exclusive category whose current selection is a globally-installed one | Store guard — `toggleTechnology` exclusive-swap arm (guard #1)                   | **Refused.** Toast `"Global skills cannot be changed from project scope"`; global survives.                               |
| A write finds the project already owning a different active skill in the same exclusive category as a live global install   | Write-time predicate — `maskCollidingGlobalSkills` in `config-gate/propagate.ts` | **Project's own skill wins.** The global entry is masked with `{ ...globalEntry, excluded: true }` in the project config. |

**Why they differ — the direction the conflict arrived from:**

- In the guard case the **user is the aggressor**: the keypress is an attempt to displace a shared install that every project reads. Refusing upholds the rule that a globally installed item is immutable from project scope, in every flow including `init`.
- In the masking case the conflict is **pushed in**: a global install has landed on top of pre-existing project state, without the project asking. Letting global win there would silently uninstall the user's own skill — a strictly worse failure than hiding a global entry the user never chose to receive.

**The mask is not an exception to immutability.** Masking never removes the global entry and never writes into `~/.claude-src/config.ts`; it only records, in the project's own config, that this project cannot show that global install. The global install stays intact for every other project, and the mask is dropped automatically once the collision clears (`dropOrphanedDerivedMasks`). Backlog item **D-276** — allowing a user to _deliberately_ select a skill that conflicts with a global one in an exclusive category — is filed with the same constraint: the global entry is masked, never removed.

> See [tombstone-pattern.md](./tombstone-pattern.md) "Mask vs. Tombstone" for the persisted shape and the provenance argument, and "Creation outside the wizard — derived conflict masks" for the full predicate table.

## Silent Guards and Race Surfaces

**The Scenario B race class:** when a keypress handler dispatches an action that bails silently because store state hasn't finished committing, the user sees nothing — the keystroke is swallowed. The E2E countermeasure is the page-object key-press rule: every step page-object method awaits `waitForWizardFooter()` before sending a key, so React effects have settled and the `useInput` handler is genuinely mounted when the keystroke arrives.

**Fix A landed for the skill path** (`2026-07-19-async-post-mount-seed-read-by-sync-input-handler.md`, resolved): `focusedSkillId` is now seeded **synchronously** in the store by `seedFocusedSkillForActiveDomain` (called at hydrate, `setStep("build")`, and every domain transition), and CategoryGrid's fire-once post-mount seed `useEffect` was deleted. The build-step surface below is therefore no longer a live race. The **agents step** (`focusedAgentId`, still seeded by a post-mount `useEffect` in `step-agents.tsx`) is the remaining surface.

The exposed silent surfaces:

| Silent guard                                                                          | Layer  | Race risk                                                                                                                                                                                                                                                                                                                           | Mitigation                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOTKEY_SCOPE` — `!focusedSkillId`                                                    | hotkey | **Resolved (Fix A landed).** `focusedSkillId` is now seeded synchronously by `seedFocusedSkillForActiveDomain` (store action) at hydrate, `setStep("build")`, and every domain transition; CategoryGrid's post-mount seed `useEffect` was deleted. The `!focusedSkillId` silent no-op survives but has no null-window to race.      | Synchronous store seeding — the E2E blind delay (`FOCUS_EFFECT_FLUSH_MS`) was removed.                                                                            |
| `HOTKEY_SCOPE` — `!focusedAgentId`                                                    | hotkey | **Yes — the remaining surface.** `focusedAgentId` is still synced to the store by a post-mount `useEffect` in `step-agents.tsx`; a fast `S` in the agents step before the effect flushes reads `null` and drops silently. (The component-local `focusedId` defaults synchronously, but the store field it mirrors lags one effect.) | `waitForWizardFooter()` in E2E before any keypress (wizard screens only — see note below); an agent-side synchronous seed would close it as Fix A did for skills. |
| `toggleSkillScope` — `isEditingFromGlobalScope`                                       | store  | Low (dispatcher toast catches the hotkey path first).                                                                                                                                                                                                                                                                               | Intentional — not every caller should pay for a toast.                                                                                                            |
| `toggleSkillScope` / `toggleAgentScope` — `!config`                                   | store  | Low — implies caller passed a stale id, not a race.                                                                                                                                                                                                                                                                                 | Intentional — silence is correct for programmatic misuse.                                                                                                         |
| `toggleAgentScope` — `isEditingFromGlobalScope`                                       | store  | Low (same reasoning as `toggleSkillScope`).                                                                                                                                                                                                                                                                                         | Intentional.                                                                                                                                                      |
| `goBack` — empty `history`                                                            | store  | None — UI prevents pressing back at the stack step.                                                                                                                                                                                                                                                                                 | Intentional — no-op is the desired behavior.                                                                                                                      |
| `setCurrentDomainIndex` — out-of-range `index`                                        | store  | None — caller computes the index from `selectedDomains.length`.                                                                                                                                                                                                                                                                     | Intentional — fail closed.                                                                                                                                        |
| `applySkillRemoval` — keeps global installed as tombstone, collapses dual-scope pairs | store  | None — shaping, not race.                                                                                                                                                                                                                                                                                                           | Intentional.                                                                                                                                                      |
| `shouldIncludeTriple` — rejected triple                                               | config | None — build-time, no user timing.                                                                                                                                                                                                                                                                                                  | Intentional — filtered before write.                                                                                                                              |

**Design rule:** silence is acceptable when (a) the guard reflects a programmatic contract violation (stale id, out-of-range index) or (b) the guard is defensive shaping that the user never directly triggers. Silence is **not** acceptable when (a) a keypress disappears with no visible response or (b) a toast-eligible precondition is skipped. The `focusedSkillId === null` surface was closed by Fix A (synchronous store seeding via `seedFocusedSkillForActiveDomain`); the `focusedAgentId === null` silent path in the agents step is now the only surface where a user-visible action can still vanish — tracked via `waitForWizardFooter` E2E discipline until an agent-side synchronous seed lands.

**Precondition on the E2E mitigation:** `waitForWizardFooter()` is a one-string match on the wizard footer text `"select"`, which only `WizardLayout` paints. It gates keypresses on `BaseStep` subclasses only — on a footer-less screen (e.g. the dashboard) the sentinel never appears and the call hangs for the full timeout instead of settling. Non-wizard page objects need their own screen-specific sentinel.

## Warn-and-Return Guards (Programmatic Misuse)

These log to `warn()` and return the current state. They exist to catch bad callers, not bad user input:

| Action                 | Condition                                                      | Log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setInstallMode`       | empty `skillId`                                                | "Ignoring setInstallMode call with empty skillId"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `populateFromSkillIds` | unresolvable skill id (missing from matrix / unknown category) | Two messages, one line per skill, both from `resolveSkillForPopulation`. **Absent from the catalogue** (`absentFromSourceWarning`): "Installed skill '...' is not present in the loaded source — it may have been removed or renamed. It is left out of this session's selection. Run 'npx agents-inc update' to refresh the marketplace if you expect it to still be carried there." **Carried but unplaceable** (`unplaceableCategoryWarning`, no domain claims the skill's category): "Installed skill '...' has unknown category '...' — skipping. No domain in this source claims that category, so the wizard has no screen to place the skill on. Declare it with a 'domain' in the source's 'config/skill-categories.ts', or run 'npx agents-inc update' to refresh the marketplace." The removal these ids produce is named in `edit`'s `Changes:` block, which is the surface a user reads after the wizard has cleared the screen. |

**Do not shorten the first message's opening clause when quoting it.** `STEP_TEXT.REMOVED_REASON_NOT_IN_SOURCE` in `e2e/pages/constants.ts` is `"not present in"` — a substring of it — and several specs and documents quote the clause verbatim, so an edit to those bytes moves an E2E sentinel as well as this row. The remedy sentence sits after it for exactly that reason. Both messages interpolate `CLI_INVOKE_COMMAND` and `SKILL_CATEGORIES_PATH` from `consts.ts`; the values are spelled out above because the row states what a user reads.

## Install-Mode Scope Authority

**There were three install-mode setters. Two are gone and the third is gated; the gap this section used to record is closed.**

`setAllSourcesEject` and `setAllSourcesPlugin` set `origin` on every active skill config, and their only callers were the Sources step's `l` / `p` hotkeys. Neither the setters nor the keys carried scope authority, so from a project-context edit they rewrote inherited global-active rows — rows the same step renders locked and non-focusable, and which `SourceGrid`'s per-row `SPACE` refuses (`isRowInert`). A bulk key could therefore do what the per-row control provably cannot, and the run acted on it: `executeMigration` resolves paths from each skill's OWN scope, so the press produced real plugin installs at Claude user scope, deleted or created working copies under `$HOME`, and had `recordGlobalSourceMigrations` rewrite the GLOBAL `config.ts`. Both keys, both footer hints and both store actions are deleted outright — the resolution is withdrawal, not a scope gate, because a bulk set-all whose reach depends on the editing context is a key that means different things in different directories.

`setInstallMode` survives, and now carries the predicate:

| Field                      | Refuses when                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `isEditingFromGlobalScope` | `false` — a global-scope edit owns the global install and may change its mode      |
| target slot                | `isInheritedGlobalSlot(installedSkillConfigs, skillId, scope)` — see the two rules |

**Outcome:** silent no-op. It is a programmatic-contract guard, not user feedback: the grid never offers the row, so a refused call means a caller reached past the UI.

Two properties of the predicate are load-bearing:

- **It keys on the `(id, scope)` SLOT, never on the id.** An id legitimately occupies slots at both scopes at once. A global install adopted at project scope renders a locked global row AND an editable project row, and `step-sources.tsx` threads that project row's scope into the call; an id-keyed gate would freeze the half the project owns.
- **It reads the hydration SNAPSHOT, never the live entry's scope.** `installedSkillConfigs` is `null` during a first `init`, and a global-scope skill added this session is nobody's install yet. A gate testing `scope === "global"` alone would freeze the Sources step for every fresh install.

**What still reaches `recordGlobalSourceMigrations`, and why it stays.** One residual path: commit an install-mode change on the PROJECT half of a `[P][G]` pair, then collapse the pair P→G with `s` in the same session. The entry is the project's own when configured and global when written, so the migration is real and the global config must record it. Its docstring's former claim that "driving a global-scope migration from a project directory is a supported flow" is void — a project-context edit may not record a global-scope migration it did not perform; authority follows the work actually performed, and only the ids a run migrated are restored, carrying `origin` and nothing else.

**The trap this replaced, because the over-correction is the more expensive mistake.** The config rule ("never modify global config from project-level operations", enforced by `authoritativeScope: "owned"` in `config-merger.ts`) and the filesystem behaviour disagree about the same operation by design: `executeMigration` resolves each skill's install paths from THAT skill's own scope, so a project-context edit that switches a global-scoped skill between plugin and eject has already copied it under `$HOME` and moved its user-scope registration before any config is written. Reading the config rule as an invariant over ALL global state rather than over UNRELATED global state is what once deleted this shipped, lifecycle-tested feature outright — refusing the config write protected nothing and left disk, global config and plugin registry each saying something different. `authoritativeScope: "owned"` is the roster's rule and is deliberately untouched by this — an inherited global-active entry stays read-only and `mergeGlobalConfigs` preserves it verbatim. Widening it to `"all"` is not the route to recording a migration: `"all"` is the shared-configuration producer's authority (`edit.tsx` selects it for `producer === "shared"`), which answers a different question.

## Guard vs Toast Flow

```
User action (e.g., SPACE on a skill)
  |
  v
Hotkey dispatcher in wizard.tsx  (for S-key scope toggles only)
  |
  +-- isEditingFromGlobalScope? -- YES -> setToastMessage, return
  |                                NO  -> continue
  +-- focused id null? -- YES -> silent return (skill path now sync-seeded; agents-step focusedAgentId is the live Scenario B race surface)
  |                           NO  -> dispatch store action
  v
Store action (e.g., toggleTechnology)
  |
  v
Store-level guard:
  - Global-install + project scope + not init? -> toast, return early
  - Only skill in required exclusive category?  -> toast, return early
  - Other precondition fail?                    -> silent return
  |
  v
Normal action logic (compute newSelections, reconcileSkillConfigs, ...)
```

## Toast Message Display

`toastMessage: string | null` is rendered by `toast.tsx`. It is auto-cleared after `TOAST_DURATION_MS` (2000ms) by the effect in `wizard.tsx` that watches `toastMessage` changes.

## Summary Table

| Guard                              | Action / Layer                                                                    | Outcome | Text / Note                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global skill toggle                | `toggleTechnology` / store                                                        | Toast   | "Global skills cannot be changed from project scope"                                                                                                            |
| Global skill exclusive replacement | `toggleTechnology` / store                                                        | Toast   | Same as above (radio-replace path)                                                                                                                              |
| Only-skill deselect                | `toggleTechnology` / store                                                        | Toast   | "Cannot deselect the only skill in this category"                                                                                                               |
| Global agent toggle                | `toggleAgent` / store                                                             | Toast   | "Global agents cannot be changed from project scope"                                                                                                            |
| Scope toggle global-context        | `HOTKEY_SCOPE` / wizard.tsx                                                       | Toast   | "Scope toggle unavailable in global context"                                                                                                                    |
| Dual-scope inert spacebar (agents) | `toggleAgent` / store                                                             | Toast   | Global-locked agent toast on SPACE over a live `[P][G]` agent; `s` is the sole dual-scope agent toggle. The SKILL path allows it — SPACE drops the project half |
| Skill scope eject collision        | `toggleSkillScope` / store                                                        | Toast   | "Already exists as ejected skill at global scope"                                                                                                               |
| Scope silent (editing-from-global) | `toggleSkillScope` / `toggleAgentScope`                                           | Silent  | Covers direct action callers that bypass the hotkey toast                                                                                                       |
| Scope silent (missing config)      | `toggleSkillScope` / `toggleAgentScope`                                           | Silent  | Stale-id callers                                                                                                                                                |
| Scope silent (no focused id)       | `HOTKEY_SCOPE` / wizard.tsx                                                       | Silent  | Scenario B race surface — see Silent Guards section                                                                                                             |
| Install-mode scope authority       | `setInstallMode` / store                                                          | Silent  | Project-context call against an inherited global slot (`isInheritedGlobalSlot`) — see Install-Mode Scope Authority                                              |
| Tombstone-aware removal            | `applySkillRemoval` / store                                                       | Silent  | Shapes removal output; collapses dual-scope pairs (resolved)                                                                                                    |
| Stack-build ownership              | `shouldIncludeTriple` / config-generator                                          | Silent  | D-220 delta pipeline predicate                                                                                                                                  |
| Cross-scope conflict mask          | `maskCollidingGlobalSkills` / `maskCollidingGlobalAgents` / config-gate propagate | Silent  | Write-time, not a keypress guard. Project's own skill wins locally — deliberately asymmetric with the exclusive-swap refusal above                              |
| Warn-and-return                    | `setInstallMode` / `populateFromSkillIds`                                         | Warn    | Programmatic-misuse logs, plus the per-skill unresolvable report                                                                                                |

## Anchors

- `toggleTechnology`, `toggleAgent`, `toggleSkillScope`, `toggleAgentScope`, `applySkillRemoval`, `reconcileSkillConfigs`, `restoreDualScopeAgent`, `isDualScopePair`, `isDualScopeAgentPair`, `setInstallMode`, `isInheritedGlobalSlot`, `populateFromSkillIds`, `goBack`, `setCurrentDomainIndex` — `src/cli/stores/wizard-store.ts`.
- `HOTKEY_SCOPE` handler, `TOAST_DURATION_MS` effect — `src/cli/components/wizard/wizard.tsx`.
- `shouldIncludeTriple`, `buildAgentStack` — `src/cli/lib/configuration/config-generator.ts`.
- `recordGlobalSourceMigrations`, `logChangeSummary` — `src/cli/commands/edit.tsx`.
- `reconcileProjectSplitAgainstGlobal`, `maskCollidingGlobalSkills`, `maskCollidingGlobalAgents`, `dropOrphanedDerivedMasks`, `dropOrphanedDerivedAgentMasks`, `buildProjectCollisionTest`, `isExclusiveCategory`, `categoryOfSkill` — `src/cli/lib/config-gate/propagate.ts`. Only the first is exported, and only so `config-gate/index.ts` can call it; the other seven are module-private. (`isExclusiveCategory` is also declared, differently, in `configuration/config-writer.ts` and `matrix/matrix-health-check.ts` — the masking rule uses this one, which reads `exclusive` off the merged matrix.)

> **See also:** [tombstone-pattern.md](./tombstone-pattern.md) for tombstone lifecycle interacting with scope guards; [scope-system.md](./scope-system.md) for the project/global distinction the guards enforce.
