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
    toggleFilterIncompatible,
    eject-guard,
    silent-no-op,
    focusedSkillId,
    scenario-b-race,
    installed-at-both-scopes,
    persisted-dual-scope-pair,
    _sessionRebuiltScopePair,
    D-233,
  ]
related:
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/wizard/state-transitions.md
  - reference/wizard/flow.md
last_validated: 2026-07-23
---

# Guard Pattern

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

> **Cross-cutting concept.** Consolidates guard documentation from: `wizard-flow.md` (Global-Item Guards, Scope Toggle Eject Guard), `state-transitions.md` (guard tables in selection actions), and the hotkey dispatcher in `wizard.tsx`.

## Overview

The wizard implements guards at two layers: the **hotkey dispatcher** in `wizard.tsx` (via `useInput`) and the **store actions** in `wizard-store.ts`. Guards produce one of three outcomes:

- **Toast** — user-visible `toastMessage` is set; state otherwise unchanged.
- **Silent no-op** — action returns the current state unchanged, no feedback.
- **Warn-and-return** — `warn()` is logged (stderr / dev-only), state unchanged.

No guard currently throws. Throws in the wizard (`handleComplete` stack lookup) are data-integrity assertions, not guards.

## Guard Preconditions

The three global-item guards in `toggleTechnology` / `toggleAgent` share these bypass preconditions:

| Field                      | Bypass When | Purpose                                                  |
| -------------------------- | ----------- | -------------------------------------------------------- |
| `isEditingFromGlobalScope` | `true`      | Editing from `~/.claude/` — guard is not meaningful      |
| `isInitMode`               | `true`      | Init wizard (first-time setup) has no installed baseline |

When either is `true`, the global-installed guard does not trigger.

The scope-toggle guards (`toggleSkillScope`, `toggleAgentScope`) gate only on `isEditingFromGlobalScope` — they run in init mode too.

## Guard Registry

### 1. Global Skill Toggle Guard (`toggleTechnology`)

**File:** `wizard-store.ts` — `toggleTechnology` action.

**Trigger:** Toggling a skill in the build step (SPACE on a skill tag).

**Guard condition (`isActiveGlobal`, two arms):**

- **Snapshot arm:** `hasGlobalActive(installedSkillConfigs, id)` — a genuinely global-only install in the hydration snapshot blocks both directions (long-standing read-only behaviour).
- **Live tombstone arm (2026-07-18 hydration-snapshot fix):** `isSelected && hasGlobalTombstone(installedSkillConfigs, id) && hasGlobalActive(skillConfigs, id)` — blocks the DESELECT of the stale-snapshot state a persisted `[P][G]` pair reaches after an in-session spacebar collapse (the snapshot still shows the tombstone; the live config now holds a plain active global). Gated on `isSelected` so the sanctioned re-select restore path still runs, and it never fires while the live config still holds the full `[P][G]` pair (so the FIRST collapse spacebar is allowed) or on a skill freshly added this session (absent from the snapshot).

Both arms additionally require `!isEditingFromGlobalScope && !isInitMode`.

**Outcome:** Toast — `"Global skills cannot be changed from project scope"`.

**Exclusive-mode replacement variant:** In an exclusive (radio) category, selecting a new skill when the current selection is a globally-installed one also trips the same guard (same two-arm condition) with the same toast. This prevents implicit deselect-by-replacement of a protected global.

### 2. Only-Skill Deselect Guard (`toggleTechnology`)

**File:** `wizard-store.ts` — `toggleTechnology` action.

**Trigger:** Deselecting a skill in a category that is both `exclusive` and `required`, when that category has only one defined skill.

**Guard condition:** `isSelected && categoryDef.exclusive && categoryDef.required && categorySkillCount <= 1`.

**Outcome:** Toast — `"Cannot deselect the only skill in this category"`.

> **Not previously documented** — added in 2026-04-21 sweep.

### 3. Global Agent Toggle Guard (`toggleAgent`)

**File:** `wizard-store.ts` — `toggleAgent` action.

**Trigger:** Toggling an agent in the agents step.

**Guard condition (`isActiveGlobal`):** mirrors the skill-path two-arm shape — `agentHasGlobalActive(installedAgentConfigs, agent)` OR (`agentHasGlobalTombstone(installedAgentConfigs, agent) && agentHasGlobalActive(agentConfigs, agent)`), AND neither `isEditingFromGlobalScope` nor `isInitMode` is true.

**Two D-233 branches run BEFORE this guard** (so they are never blocked by it): a dual-scope deselect (`isDualScopeAgentPair(agentConfigs, agent)`) collapses the pair via `collapseDualScopeAgent`, and an inherited-global re-select (`agentHasGlobalActive(agentConfigs) && !agentHasProjectActive(agentConfigs) && !selectedAgents.includes(agent) && agentHasGlobalTombstone(installed)`) rebuilds it via `restoreDualScopeAgent`. See [tombstone-pattern.md](./tombstone-pattern.md).

**Outcome:** Toast — `"Global agents cannot be changed from project scope"`.

### 4. Scope Toggle Global-Context Guard (hotkey layer)

**File:** `wizard.tsx` — `HOTKEY_SCOPE` handler (both `step === "build"` and `step === "agents"` branches).

**Trigger:** Pressing `S` when `isEditingFromGlobalScope === true`.

**Outcome:** Toast — `"Scope toggle unavailable in global context"`. Fires before the store action is called.

> **Not previously documented** — this toast is emitted in the hotkey dispatcher, not the store. The store's `toggleSkillScope` / `toggleAgentScope` have a matching silent guard that catches direct action calls (e.g. tests, programmatic callers).

### 5. Persisted Dual-Scope Pair Guard (`toggleSkillScope`, `toggleAgentScope`)

**File:** `wizard-store.ts` — `toggleSkillScope` / `toggleAgentScope` actions (added by the 2026-07-18 hydration-snapshot fix).

**Trigger:** Pressing `S` on a reopened, untouched-this-session `[P][G]` dual-scope skill/agent.

**Guard condition:** `!_sessionRebuiltScopePair{Skills,Agents}.has(id) && hasGlobalTombstone(installed*Configs, id) && isDualScopePair(*Configs, id)`. The hydration snapshot carries the excluded global tombstone (so the pair is pristine-from-disk, not reconstructed this session) and the live config still holds the full pair.

**Outcome:** Toast — `"Installed at both scopes — use space to change project scope"`. `s` has no well-defined single scope target on a persisted pair; SPACE (`toggleTechnology` / `toggleAgent`) is the sanctioned way to change the project half.

**Session-authored exception:** a pair collapsed then rebuilt WITHIN the session is recorded in `_sessionRebuiltScopePairSkills` / `_sessionRebuiltScopePairAgents` (populated by the G→P tombstone-creation branch and the spacebar/agent restore path). For ids in that set the guard suppresses itself, so `s` round-trips the pair freely even though its shape now matches a pristine snapshot. Within-session G↔P round-trips — where the snapshot still holds an ACTIVE global entry, not a tombstone — are unaffected either way. This guard runs BEFORE the eject-collision guard (#6).

### 6. Skill Scope Eject-Collision Guard (`toggleSkillScope`)

**File:** `wizard-store.ts` — `toggleSkillScope` action.

**Trigger:** Pressing `S` on a focused project-scoped `eject` skill.

**Guard condition:** `config.scope === "project" && config.source === EJECT_SOURCE` AND a non-excluded global eject entry exists in `installedSkillConfigs` AND no excluded tombstone for the same skill id is present in `skillConfigs`.

**Outcome:** Toast — `"Already exists as ejected skill at global scope"`.

**Undo path:** When an excluded tombstone for the same skill id is present, the guard allows the toggle. The tombstone proves this is an undo of a prior G→P, not a fresh collision. See [tombstone-pattern.md](./tombstone-pattern.md) "`toggleSkillScope` / `toggleAgentScope` — Persisted vs Within-Session". Note the persisted-dual-scope-pair guard (#5) fires first, so an untouched reopened `[P][G]` never reaches this eject-collision check.

**Tombstone side effects** (on successful toggle, not part of the guard):

- G→P: adds excluded global tombstone iff `wasInstalledGlobally` (which now counts a global tombstone as "installed globally").
- P→G: unconditionally drops any same-id global tombstone (D-224 invariant).

### 7. Skill/Agent Scope Silent Guards (`toggleSkillScope`, `toggleAgentScope`)

**File:** `wizard-store.ts`.

**Guard conditions (silent returns):**

- `isEditingFromGlobalScope === true` — return current state, no state change.
- No non-excluded config found for the target id/name — return current state.

**Outcome:** Silent no-op. These catch direct action calls that bypass the hotkey layer's toast.

### 8. Filter Incompatible Guard (`toggleFilterIncompatible`)

**File:** `wizard-store.ts` — `toggleFilterIncompatible` action.

**Trigger:** Pressing `F` in the build step to enable framework-first filtering.

**Guard (tombstone protection):** `findIncompatibleWebSkills` ignores skills whose `skillConfigs` entry has `excluded === true`. This preserves tombstones — enabling the filter cannot inadvertently clear a shadowed global.

**Guard (locked-global refusal, toast):** if any incompatible target is a locked global (`hasGlobalActive(installed, id)` OR the tombstone-arm `hasGlobalTombstone(installed, id) && hasGlobalActive(skillConfigs, id)`) and `!isEditingFromGlobalScope && !isInitMode`, the WHOLE toggle is refused with `"Global skills cannot be changed from project scope"` — the filter is not applied and no subset is silently removed.

**Outcome:** Silent removal of incompatible non-tombstoned web skills via `applySkillRemoval` (tombstones stay); OR toast refusal when a locked global would be uninstalled.

### 9. Tombstone-Aware Skill Removal (`applySkillRemoval`)

**File:** `wizard-store.ts` — helper used by `toggleTechnology`, `toggleDomain`, `toggleFilterIncompatible` (and, indirectly, `reconcileSkillConfigs`).

**Behavior (predicate, not toast):** When removing a skill id, if `scope === "global"` AND the id is in `installedSkillConfigs`, the entry survives with `excluded: true` stamped on. Project-scoped entries and non-installed globals are dropped. When the caller passes `null` for `installedSkillConfigs` (editing FROM global scope), globals are dropped outright — no tombstone (D-233 Scenario C).

**Dual-scope branch (D-233, resolved):** `applySkillRemoval` now recognises a dual-scope pair (`isDualScopePair`: active project entry + global tombstone). On removal it drops BOTH halves and re-surfaces a single inherited-global entry, so the `[G]` badge keeps rendering. The mirror restore (re-select rebuilds `[P][G]`) lives in `reconcileSkillConfigs`. Agents get the equivalent via `collapseDualScopeAgent` / `restoreDualScopeAgent` invoked from the `toggleAgent` action.

> Listed here as a guard-class predicate — it shapes the state without user feedback. See [tombstone-pattern.md](./tombstone-pattern.md) "D-233 — Dual-Scope Spacebar + Scope-Aware Removal (Resolved)".

### 10. Stack-Build Ownership Guard (`shouldIncludeTriple`)

**File:** `src/cli/lib/configuration/config-generator.ts` — used by `buildAgentStack`.

**Trigger:** Writing the config `stack` property during compilation — decides whether to include a `(agent, category, skillId)` triple.

**Guard class:** Predicate (not toast). Included here because it is the same "reject invalid triples" discipline:

- When `inputs.newlyAddedSkillIds === undefined` (legacy/no-opt-in caller): include unconditionally.
- When the agent is new this session (`agent ∉ existingStack`): include (full ownership-derived stack).
- Otherwise (existing agent): keep a skill already present in that agent's prior category assignment; additionally admit a skill in `newlyAddedSkillIds` OR a `(agent, skillId)` pair whose scope-compatibility was gained this session (`scopeEligibilityGained`, keyed by `scopeEligibilityKey(agent, skillId)`); omit everything else (respecting the user's prior per-agent curation).

**Outcome:** Silent — the triple is dropped from the output. See [config-generator reference docs](../config/configuration.md) for the D-220 delta-pipeline context.

## Silent Guards and Race Surfaces

**The Scenario B race class** (from finding `2026-04-21-e2e-build-step-keypress-missing-stable-render.md` and `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md`): when a keypress handler dispatches an action that bails silently because store state hasn't finished committing, the user sees nothing — the keystroke is swallowed.

**Fix A landed for the skill path** (`2026-07-19-async-post-mount-seed-read-by-sync-input-handler.md`, resolved): `focusedSkillId` is now seeded **synchronously** in the store by `seedFocusedSkillForActiveDomain` (called at hydrate, `setStep("build")`, and every domain transition), and CategoryGrid's fire-once post-mount seed `useEffect` was deleted. The build-step surface below is therefore no longer a live race. The **agents step** (`focusedAgentId`, still seeded by a post-mount `useEffect` in `step-agents.tsx`) is the remaining surface.

The exposed silent surfaces:

| Silent guard                                                                                  | Layer  | Race risk                                                                                                                                                                                                                                                                                                                           | Mitigation                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOTKEY_SCOPE` — `!focusedSkillId`                                                            | hotkey | **Resolved (Fix A landed).** `focusedSkillId` is now seeded synchronously by `seedFocusedSkillForActiveDomain` (store action) at hydrate, `setStep("build")`, and every domain transition; CategoryGrid's post-mount seed `useEffect` was deleted. The `!focusedSkillId` silent no-op survives but has no null-window to race.      | Synchronous store seeding — the E2E blind delay (`FOCUS_EFFECT_FLUSH_MS`) was removed.                                                                            |
| `HOTKEY_SCOPE` — `!focusedAgentId`                                                            | hotkey | **Yes — the remaining surface.** `focusedAgentId` is still synced to the store by a post-mount `useEffect` in `step-agents.tsx`; a fast `S` in the agents step before the effect flushes reads `null` and drops silently. (The component-local `focusedId` defaults synchronously, but the store field it mirrors lags one effect.) | `waitForWizardFooter()` in E2E before any keypress (wizard screens only — see note below); an agent-side synchronous seed would close it as Fix A did for skills. |
| `toggleSkillScope` — `isEditingFromGlobalScope`                                               | store  | Low (dispatcher toast catches the hotkey path first).                                                                                                                                                                                                                                                                               | Intentional — not every caller should pay for a toast.                                                                                                            |
| `toggleSkillScope` / `toggleAgentScope` — `!config`                                           | store  | Low — implies caller passed a stale id, not a race.                                                                                                                                                                                                                                                                                 | Intentional — silence is correct for programmatic misuse.                                                                                                         |
| `toggleAgentScope` — `isEditingFromGlobalScope`                                               | store  | Low (same reasoning as `toggleSkillScope`).                                                                                                                                                                                                                                                                                         | Intentional.                                                                                                                                                      |
| `goBack` — empty `history`                                                                    | store  | None — UI prevents pressing back at the stack step.                                                                                                                                                                                                                                                                                 | Intentional — no-op is the desired behavior.                                                                                                                      |
| `setCurrentDomainIndex` — out-of-range `index`                                                | store  | None — caller computes the index from `selectedDomains.length`.                                                                                                                                                                                                                                                                     | Intentional — fail closed.                                                                                                                                        |
| `toggleFilterIncompatible` — skips excluded skills                                            | store  | None — protection, not race.                                                                                                                                                                                                                                                                                                        | Intentional — silence preserves tombstones.                                                                                                                       |
| `applySkillRemoval` — keeps global installed as tombstone, collapses dual-scope pairs (D-233) | store  | None — shaping, not race.                                                                                                                                                                                                                                                                                                           | Intentional.                                                                                                                                                      |
| `shouldIncludeTriple` — rejected triple                                                       | config | None — build-time, no user timing.                                                                                                                                                                                                                                                                                                  | Intentional — filtered before write.                                                                                                                              |

**Design rule:** silence is acceptable when (a) the guard reflects a programmatic contract violation (stale id, out-of-range index) or (b) the guard is defensive shaping that the user never directly triggers. Silence is **not** acceptable when (a) a keypress disappears with no visible response or (b) a toast-eligible precondition is skipped. The `focusedSkillId === null` surface was closed by Fix A (synchronous store seeding via `seedFocusedSkillForActiveDomain`); the `focusedAgentId === null` silent path in the agents step is now the only surface where a user-visible action can still vanish — tracked via `waitForWizardFooter` E2E discipline until an agent-side synchronous seed lands.

**Precondition on the E2E mitigation:** `waitForWizardFooter()` is a one-string match on the wizard footer text `"select"`, which only `WizardLayout` paints. It gates keypresses on `BaseStep` subclasses only — on a footer-less screen (e.g. the dashboard) the sentinel never appears and the call hangs for the full timeout instead of settling. Non-wizard page objects need their own screen-specific sentinel.

## Warn-and-Return Guards (Programmatic Misuse)

These log to `warn()` and return the current state. They exist to catch bad callers, not bad user input:

| Action                 | Condition                                                      | Log                                                                                                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `setSourceSelection`   | empty `skillId`                                                | "Ignoring setSourceSelection call with empty skillId"                                                        |
| `setSourceSelection`   | empty `sourceId`                                               | "Ignoring setSourceSelection call with empty sourceId for skill '...'"                                       |
| `setEnabledSources`    | any empty-trim key                                             | "Ignoring setEnabledSources call with empty source name(s)" (empty keys are filtered from the written state) |
| `bindSkill`            | duplicate `(id, sourceUrl)`                                    | "Skill '...' from '...' is already bound — skipping duplicate"                                               |
| `populateFromSkillIds` | unresolvable skill id (missing from matrix / unknown category) | "... installed skill(s) could not be resolved and were skipped"                                              |

## Known Gap — Ungated Source Setters

The source setters `setSkillSource`, `setAllSourcesEject`, and `setAllSourcesPlugin` (`wizard-store.ts`) do **not** carry the `isEditingFromGlobalScope` / `isInitMode` gate that `toggleTechnology` / `toggleSkillScope` use. From a project-context edit they rewrite `source` on inherited global-active rows too, so the Sources step can show a source change the store will not legitimately own. The `edit.tsx` command boundary compensates: `recordGlobalSourceMigrations()` runs before `writeConfigAndCompile` and records `source` in the global config for exactly the skill ids `executeMigration` acted on that are active at global scope (nothing else). Bringing the same predicate into the wizard setters is the open remainder — see `.ai-docs/agent-findings/2026-07-20-project-context-edit-lacked-scope-authority-gate.md` and `2026-07-20-scope-authority-must-follow-work-performed.md`.

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

| Guard                              | Action / Layer                                                                    | Outcome        | Text / Note                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Global skill toggle                | `toggleTechnology` / store                                                        | Toast          | "Global skills cannot be changed from project scope"                                                                   |
| Global skill exclusive replacement | `toggleTechnology` / store                                                        | Toast          | Same as above (radio-replace path)                                                                                     |
| Only-skill deselect                | `toggleTechnology` / store                                                        | Toast          | "Cannot deselect the only skill in this category"                                                                      |
| Global agent toggle                | `toggleAgent` / store                                                             | Toast          | "Global agents cannot be changed from project scope"                                                                   |
| Scope toggle global-context        | `HOTKEY_SCOPE` / wizard.tsx                                                       | Toast          | "Scope toggle unavailable in global context"                                                                           |
| Persisted dual-scope pair          | `toggleSkillScope` / `toggleAgentScope` / store                                   | Toast          | "Installed at both scopes — use space to change project scope" (untouched reopened `[P][G]`)                           |
| Skill scope eject collision        | `toggleSkillScope` / store                                                        | Toast          | "Already exists as ejected skill at global scope"                                                                      |
| Scope silent (editing-from-global) | `toggleSkillScope` / `toggleAgentScope`                                           | Silent         | Covers direct action callers that bypass the hotkey toast                                                              |
| Scope silent (missing config)      | `toggleSkillScope` / `toggleAgentScope`                                           | Silent         | Stale-id callers                                                                                                       |
| Scope silent (no focused id)       | `HOTKEY_SCOPE` / wizard.tsx                                                       | Silent         | Scenario B race surface — see Silent Guards section                                                                    |
| Filter incompatible                | `toggleFilterIncompatible` / store                                                | Silent / Toast | Skips excluded entries, protects tombstones; refuses whole toggle with a toast if a locked global would be uninstalled |
| Tombstone-aware removal            | `applySkillRemoval` / store                                                       | Silent         | Shapes removal output; collapses dual-scope pairs (D-233 resolved)                                                     |
| Stack-build ownership              | `shouldIncludeTriple` / config-generator                                          | Silent         | D-220 delta pipeline predicate                                                                                         |
| Warn-and-return                    | `setSourceSelection` / `setEnabledSources` / `bindSkill` / `populateFromSkillIds` | Warn           | Programmatic-misuse logs                                                                                               |

## Anchors

- `toggleTechnology`, `toggleAgent`, `toggleSkillScope`, `toggleAgentScope`, `toggleFilterIncompatible`, `applySkillRemoval`, `reconcileSkillConfigs`, `collapseDualScopeAgent`, `restoreDualScopeAgent`, `isDualScopePair`, `isDualScopeAgentPair`, `_sessionRebuiltScopePairSkills`, `_sessionRebuiltScopePairAgents`, `setSkillSource`, `setAllSourcesEject`, `setAllSourcesPlugin`, `setSourceSelection`, `setEnabledSources`, `bindSkill`, `populateFromSkillIds`, `goBack`, `setCurrentDomainIndex` — `src/cli/stores/wizard-store.ts`.
- `HOTKEY_SCOPE` handler, `TOAST_DURATION_MS` effect — `src/cli/components/wizard/wizard.tsx`.
- `shouldIncludeTriple`, `buildAgentStack` — `src/cli/lib/configuration/config-generator.ts`.
- `recordGlobalSourceMigrations`, `logChangeSummary` — `src/cli/commands/edit.tsx`.

> **See also:** [tombstone-pattern.md](./tombstone-pattern.md) for tombstone lifecycle interacting with scope guards; [scope-system.md](./scope-system.md) for the project/global distinction the guards enforce.
