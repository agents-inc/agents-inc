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
    D-233,
  ]
related:
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/wizard/state-transitions.md
  - reference/wizard/flow.md
last_validated: 2026-04-21
---

# Guard Pattern

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

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

**Guard condition:** Skill is present in `installedSkillConfigs` with `scope === "global"` and `!excluded`, AND neither `isEditingFromGlobalScope` nor `isInitMode` is true.

**Outcome:** Toast — `"Global skills cannot be changed from project scope"`.

**Exclusive-mode replacement variant:** In an exclusive (radio) category, selecting a new skill when the current selection is a globally-installed one also trips the same guard with the same toast. This prevents implicit deselect-by-replacement of a protected global.

### 2. Only-Skill Deselect Guard (`toggleTechnology`)

**File:** `wizard-store.ts` — `toggleTechnology` action.

**Trigger:** Deselecting a skill in a category that is both `exclusive` and `required`, when that category has only one defined skill.

**Guard condition:** `isSelected && categoryDef.exclusive && categoryDef.required && categorySkillCount <= 1`.

**Outcome:** Toast — `"Cannot deselect the only skill in this category"`.

> **Not previously documented** — added in 2026-04-21 sweep.

### 3. Global Agent Toggle Guard (`toggleAgent`)

**File:** `wizard-store.ts` — `toggleAgent` action.

**Trigger:** Toggling an agent in the agents step.

**Guard condition:** Agent is present in `installedAgentConfigs` with `scope === "global"` and `!excluded`, AND neither `isEditingFromGlobalScope` nor `isInitMode` is true.

**Outcome:** Toast — `"Global agents cannot be changed from project scope"`.

### 4. Scope Toggle Global-Context Guard (hotkey layer)

**File:** `wizard.tsx` — `HOTKEY_SCOPE` handler (both `step === "build"` and `step === "agents"` branches).

**Trigger:** Pressing `S` when `isEditingFromGlobalScope === true`.

**Outcome:** Toast — `"Scope toggle unavailable in global context"`. Fires before the store action is called.

> **Not previously documented** — this toast is emitted in the hotkey dispatcher, not the store. The store's `toggleSkillScope` / `toggleAgentScope` have a matching silent guard that catches direct action calls (e.g. tests, programmatic callers).

### 5. Skill Scope Eject-Collision Guard (`toggleSkillScope`)

**File:** `wizard-store.ts` — `toggleSkillScope` action.

**Trigger:** Pressing `S` on a focused project-scoped `eject` skill.

**Guard condition:** `config.scope === "project" && config.source === "eject"` AND a non-excluded global eject entry exists in `installedSkillConfigs` AND no excluded tombstone for the same skill id is present in `skillConfigs`.

**Outcome:** Toast — `"Already exists as ejected skill at global scope"`.

**Undo path:** When an excluded tombstone for the same skill id is present, the guard allows the toggle. The tombstone proves this is an undo of a prior G→P, not a fresh collision. See [tombstone-pattern.md](./tombstone-pattern.md) "`toggleSkillScope` Undo Path".

**Tombstone side effects** (on successful toggle, not part of the guard):

- G→P: adds excluded global tombstone iff `wasInstalledGlobally`.
- P→G: unconditionally drops any same-id global tombstone (D-224 invariant).

### 6. Skill/Agent Scope Silent Guards (`toggleSkillScope`, `toggleAgentScope`)

**File:** `wizard-store.ts`.

**Guard conditions (silent returns):**

- `isEditingFromGlobalScope === true` — return current state, no state change.
- No non-excluded config found for the target id/name — return current state.

**Outcome:** Silent no-op. These catch direct action calls that bypass the hotkey layer's toast.

### 7. Filter Incompatible Guard (`toggleFilterIncompatible`)

**File:** `wizard-store.ts` — `toggleFilterIncompatible` action.

**Trigger:** Pressing `F` in the build step to enable framework-first filtering.

**Guard:** `findIncompatibleWebSkills` ignores skills whose `skillConfigs` entry has `excluded === true`. This preserves tombstones — enabling the filter cannot inadvertently clear a shadowed global.

**Outcome:** Silent — no toast. Incompatible non-tombstoned web skills are removed via `applySkillRemoval`; tombstones stay in place.

### 8. Tombstone-Aware Skill Removal (`applySkillRemoval`)

**File:** `wizard-store.ts` — helper used by `toggleTechnology`, `toggleDomain`, `toggleFilterIncompatible`.

**Behavior (predicate, not toast):** When removing a skill id, if `scope === "global"` AND the id is in `installedSkillConfigs`, the entry survives with `excluded: true` stamped on. Project-scoped entries and non-installed globals are dropped.

> Listed here as a guard-class predicate. It shapes the state without user feedback. Known D-233 gap — does not yet handle dual-scope pairs correctly. See [tombstone-pattern.md](./tombstone-pattern.md) "Known Gap — D-233".

### 9. Stack-Build Ownership Guard (`shouldIncludeTriple`)

**File:** `src/cli/lib/configuration/config-generator.ts` — used by `buildAgentStack`.

**Trigger:** Writing the config `stack` property during compilation — decides whether to include a `(agent, category, skillId)` triple.

**Guard class:** Predicate (not toast). Included here because it is the same "reject invalid triples" discipline:

- When `inputs.newlyAddedSkillIds === undefined` (legacy/no-opt-in caller): include unconditionally.
- When the agent is new this session: include (full ownership-derived stack).
- Otherwise: preserve the prior category assignments, only admit skills from `newlyAddedSkillIds`.

**Outcome:** Silent — the triple is dropped from the output. See [config-generator reference docs](../config/configuration.md) for the D-220 delta-pipeline context.

## Silent Guards and Race Surfaces

**The Scenario B race class** (from finding `2026-04-21-e2e-build-step-keypress-missing-stable-render.md` and `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md`): when a keypress handler dispatches an action that bails silently because store state hasn't finished committing, the user sees nothing — the keystroke is swallowed.

The exposed silent surfaces:

| Silent guard                                              | Layer  | Race risk                                                                                                                 | Mitigation                                                                                                                                                                |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOTKEY_SCOPE` — `!focusedSkillId`                        | hotkey | **Yes.** Post-mount `useEffect` seeds `focusedSkillId`; a fast `S` keypress before flush finds `null` and drops silently. | `waitForWizardFooter()` in E2E before any keypress (wizard screens only — see note below); Fix A (synchronous seeding in `hydrateWizardStore`) would eliminate the class. |
| `HOTKEY_SCOPE` — `!focusedAgentId`                        | hotkey | Same pattern in agents step; currently less observed because the seeding is less racy but the shape is identical.         | Same as above.                                                                                                                                                            |
| `toggleSkillScope` — `isEditingFromGlobalScope`           | store  | Low (dispatcher toast catches the hotkey path first).                                                                     | Intentional — not every caller should pay for a toast.                                                                                                                    |
| `toggleSkillScope` / `toggleAgentScope` — `!config`       | store  | Low — implies caller passed a stale id, not a race.                                                                       | Intentional — silence is correct for programmatic misuse.                                                                                                                 |
| `toggleAgentScope` — `isEditingFromGlobalScope`           | store  | Low (same reasoning as `toggleSkillScope`).                                                                               | Intentional.                                                                                                                                                              |
| `goBack` — empty `history`                                | store  | None — UI prevents pressing back at the stack step.                                                                       | Intentional — no-op is the desired behavior.                                                                                                                              |
| `setCurrentDomainIndex` — out-of-range `index`            | store  | None — caller computes the index from `selectedDomains.length`.                                                           | Intentional — fail closed.                                                                                                                                                |
| `toggleFilterIncompatible` — skips excluded skills        | store  | None — protection, not race.                                                                                              | Intentional — silence preserves tombstones.                                                                                                                               |
| `applySkillRemoval` — keeps global installed as tombstone | store  | None — shaping, not race.                                                                                                 | Intentional.                                                                                                                                                              |
| `shouldIncludeTriple` — rejected triple                   | config | None — build-time, no user timing.                                                                                        | Intentional — filtered before write.                                                                                                                                      |

**Design rule:** silence is acceptable when (a) the guard reflects a programmatic contract violation (stale id, out-of-range index) or (b) the guard is defensive shaping that the user never directly triggers. Silence is **not** acceptable when (a) a keypress disappears with no visible response or (b) a toast-eligible precondition is skipped. The `focusedSkillId === null` silent path is the only current surface where a user-visible action can vanish — tracked via `waitForWizardFooter` E2E discipline and the longer-term synchronous-seeding fix.

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

## Guard vs Toast Flow

```
User action (e.g., SPACE on a skill)
  |
  v
Hotkey dispatcher in wizard.tsx  (for S-key scope toggles only)
  |
  +-- isEditingFromGlobalScope? -- YES -> setToastMessage, return
  |                                NO  -> continue
  +-- focusedSkillId null? -- YES -> silent return (Scenario B race surface)
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

| Guard                              | Action / Layer                                                                    | Outcome | Text / Note                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| Global skill toggle                | `toggleTechnology` / store                                                        | Toast   | "Global skills cannot be changed from project scope"      |
| Global skill exclusive replacement | `toggleTechnology` / store                                                        | Toast   | Same as above (radio-replace path)                        |
| Only-skill deselect                | `toggleTechnology` / store                                                        | Toast   | "Cannot deselect the only skill in this category"         |
| Global agent toggle                | `toggleAgent` / store                                                             | Toast   | "Global agents cannot be changed from project scope"      |
| Scope toggle global-context        | `HOTKEY_SCOPE` / wizard.tsx                                                       | Toast   | "Scope toggle unavailable in global context"              |
| Skill scope eject collision        | `toggleSkillScope` / store                                                        | Toast   | "Already exists as ejected skill at global scope"         |
| Scope silent (editing-from-global) | `toggleSkillScope` / `toggleAgentScope`                                           | Silent  | Covers direct action callers that bypass the hotkey toast |
| Scope silent (missing config)      | `toggleSkillScope` / `toggleAgentScope`                                           | Silent  | Stale-id callers                                          |
| Scope silent (no focused id)       | `HOTKEY_SCOPE` / wizard.tsx                                                       | Silent  | Scenario B race surface — see Silent Guards section       |
| Filter incompatible                | `toggleFilterIncompatible` / store                                                | Silent  | Skips excluded entries, protects tombstones               |
| Tombstone-aware removal            | `applySkillRemoval` / store                                                       | Silent  | Shapes removal output; D-233 dual-scope gap               |
| Stack-build ownership              | `shouldIncludeTriple` / config-generator                                          | Silent  | D-220 delta pipeline predicate                            |
| Warn-and-return                    | `setSourceSelection` / `setEnabledSources` / `bindSkill` / `populateFromSkillIds` | Warn    | Programmatic-misuse logs                                  |

## Anchors

- `toggleTechnology`, `toggleAgent`, `toggleSkillScope`, `toggleAgentScope`, `toggleFilterIncompatible`, `applySkillRemoval`, `setSourceSelection`, `setEnabledSources`, `bindSkill`, `populateFromSkillIds`, `goBack`, `setCurrentDomainIndex` — `src/cli/stores/wizard-store.ts`.
- `HOTKEY_SCOPE` handler, `TOAST_DURATION_MS` effect — `src/cli/components/wizard/wizard.tsx`.
- `shouldIncludeTriple`, `buildAgentStack` — `src/cli/lib/configuration/config-generator.ts`.

> **See also:** [tombstone-pattern.md](./tombstone-pattern.md) for tombstone lifecycle interacting with scope guards; [scope-system.md](./scope-system.md) for the project/global distinction the guards enforce.
