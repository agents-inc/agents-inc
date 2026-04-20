# D-233 — Spacebar on dual-scope skill must toggle only the project-scope presence

## Symptom

1. Install skill X globally (`cc edit` at `~/.claude/`). Global config: `[{X, global}]`. Project config: empty.
2. In a project, `cc edit` → toggle X's scope to project via `s` → save. Project config: `[{X, project}, {X, global, excluded: true}]` (D-223 state).
3. Re-open `cc edit`. X correctly renders `[P][G]` (D-223 fix, `secondaryScope` populated from the tombstone).
4. Press **spacebar** on X. Save.
5. Re-open `cc edit`. **Observed**: X shows `[G]` only; project-scope presence is gone; global install is still on disk.
6. Press spacebar again to re-select X. **Observed**: `[P]` never comes back; the row is unreachable from the wizard.

**Expected**:

- Spacebar on `[P][G]` → drops only the project-scope presence; tombstone dropped too; row collapses to pure inherited-global `[G]` (dimmed / read-only-ish rendering).
- Spacebar again on the inherited-global `[G]` row → re-adds the project-scope entry and tombstone → back to `[P][G]`.
- Scope-toggle (`s`) continues to behave per D-223/D-224 — project-side only.

## Root cause

Spacebar in the build grid dispatches `toggleTechnology` in `src/cli/stores/wizard-store.ts` (NOT `toggleSkill` — that function doesn't exist). Three bugs conspire:

**Bug 1 — `applySkillRemoval` (wizard-store.ts:79-95) has no dual-scope branch.**

With `configs = [{X, project}, {X, global, excluded: true}]` and `removed = {X}`:
- `installedIds` = `{X}` (set of IDs regardless of scope/excluded).
- Filter drops the active project entry (correct intent).
- Filter keeps the tombstone because `scope === "global" && installedIds.has(X)`.
- Map re-stamps `excluded: true` (no-op — it was already excluded).

Saved shape: `[{X, global, excluded: true}]` — a lone orphan tombstone. The tombstone's original purpose was "mask the global install so the project's own override wins." With the override gone, the tombstone is **stale**: it now means "suppress this globally-installed skill at project scope entirely." That is NOT what the user wanted ("drop only the project half, keep global").

**Bug 2 — `populateFromSkillIds` (wizard-store.ts:747-792) pushes every hydrated id into `domainSelections`.**

On reopen at step 5, `projectConfig.skills = [{X, global, excluded: true}]` (orphan tombstone). After bug 1 writes it, re-hydration behavior depends on whether the tombstone survives `edit.tsx::loadEditContext` filtering (L190-197 strips excluded from `currentSkillIds`). If the tombstone is filtered out, X is invisible entirely — user can't select it. If the tombstone survives (e.g., via a code path that surfaces the inherited global), `populateFromSkillIds` pushes X into `domainSelections` with `scope: "global"` via `buildSkillConfigForId`, and the row renders as `selected: true, scope: "global"` — not as a read-only inherited row.

**Bug 3 — `toggleTechnology` guard (wizard-store.ts:836-841) blocks step 6's re-select.**

If the row renders `selected: true, scope: "global"` and the user presses space:
```
if (isInstalledGlobal && !state.isEditingFromGlobalScope && !state.isInitMode) {
  return { toastMessage: "Global skills cannot be changed from project scope" };
}
```
`isInstalledGlobal = installedSkillConfigs.some(sc => sc.id === X && sc.scope === "global" && !sc.excluded)` fires → toast → no state change. `[P]` never comes back.

**Bug 4 (data plumbing prerequisite)** — `edit.tsx::loadEditContext` does NOT load the live `~/.claude/config.ts`. `installedSkillConfigs` is the **project's own saved snapshot**, not the actual global state. Dual-scope rendering at step 3 works only because D-223 preserves the tombstone IN the project snapshot. The moment the tombstone is gone (after buggy step 4 save), the wizard loses all knowledge of the global install. This is D-224's deferred **Fix B** — not yet landed.

## Fix direction

Two coordinated layers.

### Layer 1 — Narrow `selected` to project-scope presence; render inherited-global independently

`CategoryOption.selected` currently means "skill has any active `SkillConfig` for this id." Change it to mean **"skill has an active `SkillConfig` at project scope."** Inherited-global presence becomes an independent render axis.

- `src/cli/lib/wizard/build-step-logic.ts::buildCategoriesForDomain`: compute `selected` from project-scope presence only; render `[G]` badge whenever an inherited global entry exists for the id, regardless of `selected`.
- `src/cli/stores/wizard-store.ts::populateFromSkillIds`: do NOT push globally-inherited-only ids into `domainSelections`. Keep them in `skillConfigs` so the `[G]` badge renders.
- `src/cli/components/wizard/category-grid.tsx::SkillTag`: new dimmed / lock-glyph treatment when `selected === false && scope === "global"` (inherited-global row).

### Layer 2 — `toggleTechnology` / `applySkillRemoval` / `reconcileSkillConfigs` understand dual-scope

- **Remove** the blanket `isInstalledGlobal` guard at `toggleTechnology:836-841` for rows where `selected === false` (pure inherited-global). Space on such a row should ADD a project-scope entry, not toast.
- **Keep** the guard for the exclusive-category replacement case (can't replace an inherited-global Vue with a new React when React is globally installed) — narrow it rather than blanket-block.
- **`applySkillRemoval` — dual-scope branch**: when `removed.has(id)` AND both `{id, project, active}` AND `{id, global, excluded}` exist, drop BOTH. The tombstone is stale once the override is gone; inherited-global rendering takes over via the live global-config read (Layer 3 / Bug 4 prerequisite).
- **`reconcileSkillConfigs` — restore branch**: when adding a skill whose `installedSkillConfigs` records a live global entry AND the project has no entry yet, emit BOTH a fresh `{id, project, active}` entry AND a `{id, global, excluded: true}` tombstone — mirroring `toggleSkillScope`'s G→P behavior so the row renders `[P][G]` again on next hydrate.

### Layer 3 — Live global-config read (D-224 Fix B prerequisite)

For the fix to work correctly in the clean case (global install from a different project, never touched in this one), the wizard must know "X is globally installed" independently of the project snapshot:

- `src/cli/commands/edit.tsx::loadEditContext`: when `projectDir !== os.homedir()`, also load `~/.claude/config.ts` via `loadProjectConfigFromDir(os.homedir())`.
- Add `installedGlobalSkillConfigs?: SkillConfig[]` to `HydrateOptions` and `WizardStore` state.
- `applySkillRemoval` / `reconcileSkillConfigs` / `toggleTechnology` consult `installedGlobalSkillConfigs` (live), not just `installedSkillConfigs` (project snapshot).
- D-226 (sandbox HOME collapse) is a test-infra prerequisite for E2E to exercise this with HOME ≠ projectDir.

### Agent symmetry

`toggleAgent` / `applyAgentToggle` have a different symptom on dual-scope rows: the `isInstalledGlobal` guard (wizard-store.ts:1083) outright blocks spacebar with a toast, so user can't drop the project half even when they want to. Fix in the same PR — same per-scope-axis semantics.

## Consolidation with D-230 and D-232

D-230 (info-panel `-` on global row during G→P) and D-232 (info-panel `+` for globally-installed skill on next edit) are symptoms of the same architectural mismatch: `SkillConfig[]` keys by `(id, scope)` but the store and renderer treat some operations as `id`-only. Once Layer 1 + Layer 2 are in place, the store emits the correct two-entry shape and the info-panel diff naturally produces the right `+`/`-`/`•` without additional renderer changes. **Strongly consider landing D-230, D-232, and D-233 in one PR** (and D-227 for agent parity).

## Scope (files)

- `src/cli/stores/wizard-store.ts` — `applySkillRemoval`, `reconcileSkillConfigs`, `toggleTechnology`, `populateFromSkillIds`, `applyAgentToggle`, `toggleAgent`. Plus new shared predicates `hasProjectActive(id)`, `hasGlobalActive(id)`, `hasGlobalTombstone(id)` to replace the ~6 inlined `.some(sc => sc.scope === "global" && !sc.excluded)` copies.
- `src/cli/lib/wizard/build-step-logic.ts` — `buildCategoriesForDomain` — `selected` derivation, `scope`/`secondaryScope` from two active entries.
- `src/cli/components/wizard/category-grid.tsx` — `SkillTag` inherited-global read-only visual treatment.
- `src/cli/commands/edit.tsx` — `loadEditContext` loads live `~/.claude/config.ts`.
- `src/cli/stores/wizard-store.ts` — `HydrateOptions.installedGlobalSkillConfigs` + state field.
- `src/cli/stores/wizard-store.test.ts` — dual-scope removal + re-select unit tests.
- `src/cli/lib/wizard/build-step-logic.test.ts` — `selected`/`secondaryScope` state matrix.
- `e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts` OR new `e2e/lifecycle/dual-scope-spacebar-toggle.e2e.test.ts` — full round-trip E2E.
- `e2e/matchers/project-matchers.ts` — `toHaveConfig({ skillConfigs: [...] })` variant with scope + excluded awareness (optional; current inline regex+JSON.parse in scenario C also works).

## Non-goals

- No new `SkillConfig` schema fields. Tombstone shape unchanged.
- No change to scope-toggle (`s`) path — D-223/D-224 own that.
- No `SkillConfig.source` taxonomy split (no `"local"` literal) — user rejected.
- Do NOT fix D-230 / D-232 at the renderer layer if Layers 1+2 make them fall out automatically. Only touch `skill-agent-summary.tsx` if after Layers 1+2 the info-panel diff is still wrong.

## Test plan

### Unit — `src/cli/stores/wizard-store.test.ts`

1. `toggleTechnology` on dual-scope skill drops project entry AND stale tombstone.
2. `toggleTechnology` on inherited-global-only skill (`selected:false`, scope:"global" surfaced from live global config) adds project entry AND creates global tombstone.
3. `toggleTechnology` on pure inherited-global with no live global (invalid state — should not occur) → no-op.
4. `toggleAgent` symmetry — same two scenarios on agents.
5. `populateFromSkillIds` does NOT push inherited-global-only ids into `domainSelections`.

### Unit — `src/cli/lib/wizard/build-step-logic.test.ts`

6. `buildCategoriesForDomain` state matrix per A2 table: project-only, dual-scope, inherited-global, absent.

### E2E — `e2e/lifecycle/dual-scope-spacebar-toggle.e2e.test.ts` (new)

Full D-233 repro with byte-assertions:
1. Seed global install of X via `cc edit` at HOME.
2. In project, `cc edit` → `s` G→P on X → save. Assert `projectConfig.skills` has `[{X, project}, {X, global, excluded: true}]`. Assert global config byte-identical.
3. Re-open → assert `[P][G]` badges (D-223 regression check).
4. **Spacebar** on X → save. Assert `projectConfig.skills` has NO X entry (project entry + tombstone both dropped). Assert global config byte-identical.
5. Re-open → assert X renders as `[G]` read-only (inherited-global).
6. **Spacebar** on X → save. Assert `projectConfig.skills` has `[{X, project}, {X, global, excluded: true}]` restored.
7. Re-open → assert `[P][G]` badges back.

Uses `getScopeBadgesForSkill` + `toggleFocusedSkill` (both already exist in `e2e/pages/steps/build-step.ts`). Requires D-226 test-infra fix so HOME ≠ projectDir to exercise the live-global-read path.

## Related

- **D-223** (DONE) — dual-scope hydration; prerequisite for step 3's `[P][G]` rendering.
- **D-224** (DONE) — P→G tombstone cleanup; sibling on the scope-toggle path. Fix A template; **Fix B** (live global read) is the deferred prerequisite this plan resurrects.
- **D-225** (DONE) — info-panel asymmetric diff; renderer sibling.
- **D-227** (Ready for Dev) — agent-path tombstone loss; same architectural family, fix together.
- **D-230** (Ready for Dev) — info-panel `-` on global row during G→P; likely falls out automatically once Layers 1+2 ship.
- **D-232** (Ready for Dev) — info-panel `+` mis-tag; same root cause; likely falls out automatically.
- **D-226** (Ready for Dev) — E2E sandbox HOME collapse; test-infra prerequisite for the new E2E to exercise `HOME !== projectDir`.
- Finding `.ai-docs/agent-findings/2026-04-06-excluded-tombstones-block-scope-toggle.md` — same family of store-layer tombstone-semantics gaps.
