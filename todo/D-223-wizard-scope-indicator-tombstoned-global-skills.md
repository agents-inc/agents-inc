# D-223 — Wizard scope indicator missing for tombstoned global skills (dual-scope badge dropped by hydration filter)

> **Status: DONE (2026-04-20)**. Fix landed in `src/cli/stores/wizard-store.ts::populateFromSkillIds` — removed the `!resolvedSet.has(sc.id)` clause so excluded tombstones survive hydration when a same-id active entry exists. Test inverted in `wizard-store.test.ts` ("should not create duplicate entries…" replaced with "preserves excluded tombstone when active entry exists for same skill at different scope"). E2E `e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts` 3/3 green.
>
> **Agent-side latent gap discovered** (out of original D-223 scope, worth separate ticket): `preselectAgentsFromDomains` (`wizard-store.ts:1184-1186`) still has the symmetric `!sorted.includes(ac.name)` defensive filter that drops agent tombstones when the agent name is in the active preselect list; `stack-selection.tsx:224` clears `excluded` unconditionally on stack merge. Agent-path dual-scope scenarios (e.g. agent globally installed, toggled G→P in project, then stack re-entered) will still lose the `[G]` secondary badge.
>
> **Follow-up test gaps** (not blocking): tombstone-only rows (no active entry), agent-side dual-scope E2E, in-session navigate-away-and-return badge persistence, multi-skill / cross-domain dual-scope, stack-selection path.
>
> **Verified against current code on 2026-04-17.** Root cause is confirmed and localized: the render layer ALREADY supports dual-scope badges via `CategoryOption.secondaryScope`, and `buildCategoriesForDomain` already computes `secondaryScope` when an active entry and an excluded tombstone coexist. The bug is upstream in wizard-store hydration: `populateFromSkillIds` drops the excluded tombstone when its skill ID also has an active entry. Fix is surgical (remove one defensive filter + flip one test expectation), not a redesign.

## Symptom

Repro steps:

1. Install skill `web-framework-react` at global scope (e.g. via `cc init` / `cc edit` at `~/.claude/`).
2. In a project, run `cc edit`. `react` appears with a single `G` scope indicator (correct at this point).
3. Toggle `react` from G → P (the scope-toggle keybinding). The wizard's in-memory `skillConfigs` correctly gains a second entry: `{id: "web-framework-react", scope: "global", excluded: true}` alongside the now-project-scoped active entry.
4. Complete the wizard. `config.ts::skills` is written with BOTH entries — confirmed correct.
5. Re-open `cc edit` on the same project.

**Expected:** `react` shows TWO scope badges side-by-side — `[P]` (active project override) and `[G]` (untouched global install, the tombstone that records the global skill still exists for other projects).

**Observed:** `react` shows only ONE badge — `[P]`. The global install state is invisible in the wizard UI. The user cannot tell from the wizard that the skill is still globally installed.

## Why this matters

- G→P toggle is **additive/override semantics**, not destructive. The global install is untouched; the project scope adds an override on top. The user must be able to see this dual state or the mental model breaks.
- D-224 (same user, next toggle) and D-225 (info-panel asymmetric diff) are downstream symptoms of the same missing dual-scope representation. Fixing D-223 in the hydration layer is a prerequisite for both.
- Without the `G` badge visible, the user cannot reason about what will happen when they toggle again (P→G). They assume the skill is "project only" and are surprised when the wizard hides it entirely on the next edit (D-224).

## Investigation seeds (files + functions)

- **`src/cli/stores/wizard-store.ts::populateFromSkillIds`** (~line 747–791). This is the hydration entry point called from `hydrateWizardStore` (line 1444) and from `stack-selection.tsx`. Specifically the `excludedConfigs` filter at line 782–783.
- **`src/cli/stores/wizard-store.ts::buildSkillConfigForId`** (line 150–163). Picks the active entry and discards excluded ones — correct for its job, the bug is in the caller.
- **`src/cli/lib/wizard/build-step-logic.ts::buildCategoriesForDomain`** (~line 80–103). Already computes `secondaryScope` correctly: `excludedConfig && activeConfig && excludedConfig.scope !== activeConfig.scope ? excludedConfig.scope : undefined`. This code is correct; it just never sees the excluded entry because the store doesn't carry it.
- **`src/cli/components/wizard/category-grid.tsx::SkillTag`** (line 98–169). Render already supports the dual-badge layout at line 138–150 (both `option.scope` and `option.secondaryScope`). This code is correct.
- **`src/cli/commands/edit.tsx::loadEditContext`** (line 180–205). Computes `currentSkillIds` by filtering out `excluded` entries. Passes full `projectConfig?.skills` (including excluded) as `installedSkillConfigs` to `hydrateWizardStore`. This layer is fine — the active-only `currentSkillIds` is the right input to `populateFromSkillIds`; the excluded entries are supposed to be merged back in via `savedConfigs`.
- **`src/cli/stores/wizard-store.test.ts`** lines 1064–1088 and 1090–1111. Two existing tests directly document the current behavior: the second (`"should not create duplicate entries when excluded skill ID is also in skillIds"`) EXPLICITLY asserts that the excluded entry is DROPPED when the same ID is in the active set. That test encodes the bug.

## Confirmed root cause

In `populateFromSkillIds`, line 782–783:

```ts
const excludedConfigs =
  savedConfigs?.filter((sc) => sc.excluded && !resolvedSet.has(sc.id)) ?? [];
```

The `&& !resolvedSet.has(sc.id)` clause filters out excluded tombstones whose skill ID also appears in the active resolved set. Walk through for D-223's repro:

- Saved config: `[{react, scope:"project"}, {react, scope:"global", excluded:true}]`
- `edit.tsx` filters active-only → `currentSkillIds = ["web-framework-react"]`
- `populateFromSkillIds(["web-framework-react"], [activeReact, excludedReact])` runs
- `resolvedSkillIds = ["web-framework-react"]` → `resolvedSet = {"web-framework-react"}`
- `buildSkillConfigForId("web-framework-react", …)` → returns the active project entry
- `excludedConfigs` filter: `sc.excluded` is true AND `!resolvedSet.has("web-framework-react")` is FALSE → entry DROPPED
- Final `skillConfigs`: `[{react, scope:"project"}]` only. The tombstone is gone.
- `buildCategoriesForDomain` receives `skillConfigs` with only the active entry. Its `secondaryScope` logic requires BOTH `activeConfig` and `excludedConfig` to find — it finds only the active one, returns `secondaryScope = undefined`.
- Render: single `[P]` badge, no `[G]`.

The dedup guard exists for a legitimate reason — D-198 (see test at line 1113–1131 "should prefer project-scoped entry when savedConfigs has duplicate skill with both scopes"). That scenario is DIFFERENT: it's a saved config with two ACTIVE entries for the same skill at different scopes (neither excluded). The correct fix preserves THAT dedup behavior for non-excluded duplicates but allows an excluded tombstone to coexist with an active entry of the same skill at a different scope.

## Fix direction

Remove the `!resolvedSet.has(sc.id)` clause from the `excludedConfigs` filter in `populateFromSkillIds`, leaving only `sc.excluded`. The resulting `skillConfigs` will contain both the active entry (from `buildSkillConfigForId` iteration) and the excluded tombstone (from the now-unfiltered merge).

```ts
// Before (line 782–783):
const excludedConfigs =
  savedConfigs?.filter((sc) => sc.excluded && !resolvedSet.has(sc.id)) ?? [];

// After:
const excludedConfigs = savedConfigs?.filter((sc) => sc.excluded) ?? [];
```

Safety of this change:

- `buildSkillConfigForId` explicitly skips excluded entries (line 154 `!sc.excluded`), so there is no double-counting of the active entry.
- D-198 dedup (two ACTIVE entries for same skill at different scopes) is handled inside `buildSkillConfigForId` (line 153–155: project preferred over global), which is untouched.
- The `excludedConfig.scope !== activeConfig.scope` check in `buildCategoriesForDomain` guards against the edge case where saved config somehow has both an active entry AND an excluded entry at the SAME scope (already covered by test "should leave secondaryScope undefined when active and excluded entries have the same scope").
- Downstream consumers (`buildSourceRows` line 1297, `skill-agent-summary.tsx` line 49) already filter on `sc.excluded` + `sc.scope === "global"` and handle both active and tombstoned entries explicitly. They will see the extra tombstone and render it correctly.

One downstream consumer to verify: the wizard result writer (see `buildWizardResult` / `skill-agent-summary.tsx` upstream). The extra tombstone must flow through unchanged to `config.ts::skills` on re-save. Based on the existing logic (`applySkillRemoval`, `reconcileSkillConfigs`, `toggleSkillScope`) which all handle tombstones explicitly, this is expected to Just Work — but the E2E test below asserts it.

## Scope (files to change)

- `src/cli/stores/wizard-store.ts` — `populateFromSkillIds`: remove `!resolvedSet.has(sc.id)` clause (single expression change).
- `src/cli/stores/wizard-store.test.ts` — the test "should not create duplicate entries when excluded skill ID is also in skillIds" (line 1090–1111) must be **replaced** with the opposite assertion: dual-scope entries ARE preserved. See red tests below.
- Potentially `src/cli/lib/__tests__/user-journeys/user-journeys.integration.test.ts` — the journey that covers dual-scope edit round-trips (if any pre-existing test encoded the buggy behavior).
- **No changes** to `build-step-logic.ts`, `category-grid.tsx`, `edit.tsx`, `skill-agent-summary.tsx`, or config writers. The bug is a single filter clause in one store method.

## Red tests (integration + E2E)

### Integration — `src/cli/stores/wizard-store.test.ts` (replace existing test at ~line 1090)

```ts
it("preserves excluded tombstone when active entry exists for same skill at different scope", () => {
  const store = useWizardStore.getState();
  initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

  // Real D-223 scenario: project-scope active + global-scope excluded tombstone
  const savedConfigs: SkillConfig[] = [
    ...buildSkillConfigs(["web-framework-react"]), // active project
    ...buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      excluded: true,
      source: "agents-inc",
    }),
  ];

  // currentSkillIds is active-only, as computed in edit.tsx
  store.populateFromSkillIds(["web-framework-react", "api-framework-hono"], savedConfigs);

  const { skillConfigs } = useWizardStore.getState();
  const reactConfigs = skillConfigs.filter((sc) => sc.id === "web-framework-react");
  expect(reactConfigs).toHaveLength(2);

  const active = reactConfigs.find((sc) => !sc.excluded);
  const tombstone = reactConfigs.find((sc) => sc.excluded);
  expect(active?.scope).toBe("project");
  expect(tombstone?.scope).toBe("global");
  expect(tombstone?.excluded).toBe(true);
});
```

### Integration — `src/cli/lib/wizard/build-step-logic.test.ts` (add to `dual-scope badges` block)

```ts
it("should set secondaryScope after populateFromSkillIds preserves dual-scope entries", () => {
  // Regression guard: ensures the store → build-step-logic pipeline renders both badges
  // after D-223 fix. Complements the direct buildCategoriesForDomain test above.
  initializeMatrix(BUILD_STEP_WEB_MATRIX);
  const store = useWizardStore.getState();

  const savedConfigs: SkillConfig[] = [
    ...buildSkillConfigs(["web-framework-react"]),
    ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
  ];
  store.populateFromSkillIds(["web-framework-react"], savedConfigs);

  const { skillConfigs } = useWizardStore.getState();
  const result = buildCategoriesForDomain("web", [], {}, [], skillConfigs);
  const frameworkRow = result.find((r) => r.id === "web-framework");
  const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");

  expect(reactOption?.scope).toBe("project");
  expect(reactOption?.secondaryScope).toBe("global");
});
```

### E2E — `e2e/lifecycle/wizard-dual-scope-badge.e2e.test.ts` (new)

1. Seed a global install of `web-framework-react` at `~/.claude/` (via fixture or prior `init`).
2. In a test project, launch `cc edit` → confirm `react` shows single `[G]` badge in the build step.
3. Toggle `react` G → P (scope-toggle key). Complete wizard.
4. Read project `config.ts`, assert `skills` contains BOTH `{id: "web-framework-react", scope: "project"}` and `{id: "web-framework-react", scope: "global", excluded: true}` (pre-existing correct behavior — snapshot it).
5. **Re-launch** `cc edit` on the same project.
6. At the build step, assert the `react` skill-tag renders BOTH `[P]` and `[G]` badges. Use the render-side check from `CategoryOption.scope` + `CategoryOption.secondaryScope` via test hooks, or assert on the rendered frame (ink-testing-library) containing both badge strings.
7. Exit the wizard without changes. Assert `config.ts::skills` is byte-identical to step 4 (no accidental tombstone loss on read-then-write round trip).

## Acceptance criteria

- Red tests above turn green.
- The store test "should not create duplicate entries when excluded skill ID is also in skillIds" is **replaced** (its assertion inverted); old-behavior test is deleted, not commented out.
- Existing D-198 test "should prefer project-scoped entry when savedConfigs has duplicate skill with both scopes" stays green (no regression on the two-active-entries dedup path).
- Existing `buildCategoriesForDomain` `dual-scope badges` tests stay green.
- `skill-agent-summary.tsx` info-panel rendering is unchanged for non-dual-scope cases (existing tests green). Dual-scope rendering in the info panel is tracked in D-225.
- Round-trip: open wizard with dual-scope config → exit without changes → `config.ts` is identical. No tombstone loss, no tombstone duplication.
- All existing wizard-flow integration tests stay green.
- No regression in `init` first-run behavior (no `savedConfigs` in init mode, so the filter change is a no-op there).

## Non-goals

- Don't change `buildSkillConfigForId` (it correctly picks one active entry for the store's primary per-skill config row).
- Don't change the render layer (`category-grid.tsx` already handles `secondaryScope`).
- Don't redesign tombstone semantics or introduce a separate `globallyInstalled` flag on wizard state — the `skillConfigs` array with mixed active+excluded entries is already the correct shape; it just needs to be hydrated correctly.
- Don't fix D-225 (info-panel asymmetric diff) in this change. That's a separate render-side concern in `skill-agent-summary.tsx` and will land after D-223 establishes the data shape it can rely on.
- Don't touch the config-writer / config-generator path — they already round-trip tombstones correctly (proven by step 4 of the E2E passing before the fix).

## Related

- **D-224** (Wizard hides global install state after P→G toggle when a prior tombstone existed): Same root cause family. Once D-223 is fixed and the wizard carries the tombstone through hydration, the P→G toggle in `toggleSkillScope` (line 997–999) correctly removes the tombstone, and `buildCategoriesForDomain` will show only `[G]` as expected. D-224 is expected to be fixed by D-223, but requires its own red E2E test to confirm (track separately).
- **D-225** (Info panel asymmetric diff on scope toggle): Render-side sibling. The info-panel diff logic in `skill-agent-summary.tsx` (line 45–80) computes `projectSkills` vs `globalSkills` vs `excludedGlobalSkills` from `skillConfigs`. With D-223 fixed, the dual-scope case gives the diff logic correct data. D-225 likely needs additional render logic to emit BOTH a `-` row and a `+` row (or a dedicated "moved" indicator) on scope toggle — separate fix, but unblocked by D-223.
- **D-216** (Global → project config propagation): Adjacent feature area but independent. D-216 concerns propagation of global changes to other projects; D-223 is about rendering the existing local config correctly.
- **D-198** (prior fix: prefer project-scoped entry when savedConfigs has duplicate skill with both scopes): The dedup logic in `buildSkillConfigForId` is preserved — D-223's fix is strictly additive (bring back tombstones), not a revert of D-198.
