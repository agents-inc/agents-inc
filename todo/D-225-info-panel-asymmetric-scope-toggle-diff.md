# D-225 — Info panel asymmetric diff on scope toggle (P→G shows `+` only, missing `-`)

> **Status: DONE (2026-04-20)**. Fix landed in `src/cli/components/wizard/skill-agent-summary.tsx`: symmetric `(id, scope)` filter on `removedSkills` / `removedAgents`, tombstone pre-filter on `skillDiffBaseline` / `agentDiffBaseline`, suppression sets (`removedGlobalSkillIds`, `removedGlobalAgentNames`) preventing double-render of tombstone bullets alongside the new `-` rows, and `inheritedGlobalSkills`/`inheritedGlobalAgents` now exclude tombstoned entries so G→P falls through to `removedSkills`. E2E `e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts` 4/4 green. Plan line numbers below have drifted; logic is implemented as described.
>
> **Related findings to cross-link** (per angle-9 investigation): `2026-04-06-init-vs-edit-mode-removal-semantics`, `2026-04-07-re-scoped-skill-duplicate-rows`, `2026-04-06-excluded-tombstones-block-scope-toggle`, `2026-04-17-merger-authoritative-for-names-semantic`, `2026-04-06-agent-merge-key-mismatch-with-skills`, `2026-04-17-d224-ptog-tombstone-not-cleared`.
>
> **Known nice-to-have gaps** (not blocking): (1) unit tests for symmetric diff in co-located `skill-agent-summary.test.tsx`, (2) source-change + scope-toggle combined scenario (`~` indicator may be swallowed when both happen), (3) dual skill+agent toggle in one session, (4) `removedSkills` contradiction between investigations 08 and 09 re: tombstone pre-filter semantics — current code sides with 09.


## Symptom

User opens the wizard (`cc edit`) with a skill already installed at `scope: "project"`. User toggles that skill to `global`. The info panel (right-hand change summary) renders:

```
Skills
 Project
   (nothing — skill silently disappears from this column)
 Global
   + react
```

Expected rendering (either option A or B):

```
# Option A: +/- pair — symmetric diff
Skills
 Project
   - react
 Global
   + react

# Option B: dedicated "moved" indicator
Skills
 Project
   ~ react (→ G)
 Global
   (no separate entry for react, or ~ react (← P))
```

The current output suggests the skill "came from nowhere" and entered global scope, with no acknowledgement that the project-scope install was displaced. Confirm-before-install is supposed to show all intent; this omits half the change.

## Why this matters

- The confirm step is the user's last chance to catch an unintended scope move before the CLI mutates the filesystem and writes `config.ts`. A silent removal undermines trust in the summary.
- Scope toggles are reversible in intent but destructive on disk (archive/restore, tombstone creation per D-223). The user must see BOTH sides to confirm.
- Asymmetry is a smell: the `+` detection knows the skill is new at global scope, but the corresponding `-` at project scope is suppressed by a different code path with a different key shape. The two diff sides are not using the same model.
- D-223 (tombstone scope indicator) and D-224 (tombstone scope regression on P→G) both touch the same `installedSkillConfigs` snapshot that feeds this panel. Fixing D-225 in isolation of D-223/D-224 risks the `-` row appearing even for legitimate dual-scope tombstone cases.

## Investigation seeds

- **`src/cli/components/wizard/skill-agent-summary.tsx`** — this is the diff renderer. Critical lines:
  - `prevSkillKeySet` (around line 52): built from `installedSkillConfigs.map((s) => \`${s.id}:${s.scope}\`)` — per-(id, scope) keys.
  - `isNew` (around lines 141, 182): `!prevSkillKeySet.has(\`${skill.id}:${skill.scope}\`)` — per-(id, scope) → a scope toggle correctly flags the new-scope entry as `+`.
  - `removedSkills` (line 98-100): `installedSkillConfigs.filter((s) => !currentSkills.some((c) => c.id === s.id))` — **filters by skill id only, ignoring scope**. A scope toggle leaves the id in `currentSkills` (at a different scope), so the old-scope entry is NOT detected as removed.
  - `removedGlobalSkills` / `removedProjectSkills` (lines 105-106) then split this by old scope; since the filter collapsed the change away, nothing reaches either list.
  - Same shape for agents (`removedAgents` at line 101-103, same id-only filter via `c.name === a.name`).
- **`src/cli/stores/wizard-store.ts`** — `installedSkillConfigs` / `installedAgentConfigs` are the diff baseline, populated from the persisted config when the wizard loads (see `initializeFromConfig`/`launchWizard` around line 1470-1473). The baseline is the source of truth for "what was installed before this session."
- **`src/cli/components/wizard/category-grid.tsx`** — `SkillTag` already renders `option.scope` + optional `option.secondaryScope` badges inline (e.g., `[P] [G]`). The scope-toggle state IS visible on the skill row, but the info panel change summary is a separate view.
- **Inherited globals logic** — `skill-agent-summary.tsx` lines 63-78 build `inheritedGlobalSkills` for the D-223 dual-scope display case: skill installed globally BUT also overridden at project scope. This path is complementary to the P→G toggle we're fixing; confirm the fix doesn't double-count when a skill is both "moved from project" AND "still in globalPreselections as inherited."
- **Tombstone interaction** — `excludedGlobalSkills` / `uniqueExcludedGlobalSkills` (lines 49, 80-82): when a G→P toggle leaves a `{scope:"global", excluded:true}` tombstone, the tombstone appears in `currentSkills` as the global-side entry. A subsequent P→G toggle removes the tombstone — that removal is NOT the kind of change the user cares to see as a `-` row.

## Root-cause hypotheses to test

1. **Diff-key asymmetry (most likely).** `isNew` is computed with `(id, scope)` keys. `removedSkills` is computed with `id` only. The two sides of the diff aren't symmetric. On P→G toggle: the new `{id, scope:"global"}` is correctly `+`-flagged; the old `{id, scope:"project"}` is NOT `-`-flagged because `currentSkills.some((c) => c.id === s.id)` still matches (the id now exists at global scope). Fix: build `removedSkills` from `(id, scope)` keys — `!currentSkills.some((c) => c.id === s.id && c.scope === s.scope)` — and symmetry is restored.
2. **Tombstone masking.** On P→G toggle a prior `{scope:"global", excluded:true}` tombstone may be removed from `currentSkills`. The current per-id removedSkills filter might flag this as "removed" (since the excluded global is gone), producing a spurious `-` at the global row. Under fix-1 (per-scope keys), the old project-scope entry becomes the `-` and the tombstone removal stays invisible — correct outcome. Verify this on D-224-style input.
3. **Intentional suppression (unlikely).** Someone decided scope-toggle removals are noisy and suppressed them. If so, the `+` side is the drift and both would need to be suppressed consistently OR both shown. The user's TODO ask ("both sides should appear") rules this out as the desired behavior — but check git blame on line 98-100 for context before ripping it out.
4. **`installedSkillConfigs` deduplicated by id on load (unlikely).** If the baseline snapshot collapses duplicates by id before the diff runs, the old scope is lost at the source. Grep `initializeFromConfig` in wizard-store for any `uniqueBy((s) => s.id)` — if present, that's the real bug and the fix is upstream.

**Most likely**: hypothesis 1. The fix is a one-word change in the removedSkills filter (add `&& c.scope === s.scope`), plus the same for agents.

## Confirmed root cause

`skill-agent-summary.tsx` line 99:

```ts
const removedSkills = installedSkillConfigs
  ? installedSkillConfigs.filter((s) => !currentSkills.some((c) => c.id === s.id))
  : [];
```

Filters by `id` only. The `isNew` detection on the same component uses `` `${id}:${scope}` `` keys (`prevSkillKeySet`, lines 52-54). The two diff sides use different key shapes → asymmetric diff. A P→G toggle is "new at global" but not "removed from project" because the id still exists in `currentSkills`.

Same asymmetry on line 102 for agents: `c.name === a.name` without scope.

## Fix direction

**Recommendation: Option A — emit symmetric `+` and `-` pair.** Implementation: change `removedSkills` / `removedAgents` to per-(key, scope) filter so the same key shape governs both sides of the diff.

```ts
// Proposed:
const removedSkills = installedSkillConfigs
  ? installedSkillConfigs.filter(
      (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
    )
  : [];
const removedAgents = installedAgentConfigs
  ? installedAgentConfigs.filter(
      (a) => !currentAgents.some((c) => c.name === a.name && c.scope === a.scope),
    )
  : [];
```

Why this over a dedicated "moved" indicator (Option B):

- **Minimal and local.** Option A is a one-line fix per entity (skills, agents). Option B requires a new diff model ("move" as a third category alongside add/remove/source-change), a new UI state on the row (`P → G`), and decisions about when a move is a move vs. coincidental P-remove + G-add on unrelated skills.
- **Consistent with existing UI vocabulary.** The panel already has `+` (new), `-` (removed), `~` (source-changed). The reader learns one mapping: prefix ↔ per-(entity, scope) diff outcome. A move is expressible as `-` in the old column AND `+` in the new column; no new symbol required.
- **Symmetric by construction.** Using the same key shape on both diff sides means the invariant "for every `+` there is a corresponding `-` if a prior entry existed at another scope" holds automatically. No special-casing.
- **Interacts cleanly with D-223 / D-224 tombstones.** A G→P toggle that creates a `{global, excluded:true}` tombstone: the tombstone is in `currentSkills` as a global entry, so the old global is NOT `-`-flagged (matches D-223's dual-scope intent). A P→G toggle that removes the tombstone: the tombstone leaves `currentSkills`, so a `-` would fire on the global row — UNLESS the corresponding "new global" is tracked (it is, because P→G creates a real `{scope:"global"}` entry with the same id+scope as the tombstone). Need to verify: does per-(id, scope) collapse tombstone-removal + tombstone-replacement-by-active into a no-op? If not, filter tombstones out of `installedSkillConfigs` for diff purposes (they represent a suppression of a pre-existing install, not a user-level "installed" state).
- **Option B can be layered later.** If UX later wants a single `~ react (P → G)` line instead of `- react` in one column + `+ react` in the other, that's a render-only concern on top of the symmetric diff model, not a rethink.

**Interaction with D-223/D-224 to call out explicitly:**

- D-223: dual-scope skills (global installed + project override) — the `inheritedGlobalSkills` path keeps those in the global column as non-new. Per-scope removed-filter doesn't change this: the global entry is in `installedSkillConfigs` AND typically in `currentSkills` via the inherited path, so no `-` fires.
- D-224: tombstone removal on second P→G toggle — validate against the `uniqueExcludedGlobalSkills` path. Tombstone entries in `installedSkillConfigs` should be excluded from removed-diff computation, otherwise removing a tombstone fires a spurious `-` at global. Add a pre-filter: `const diffBaseline = installedSkillConfigs.filter((s) => !s.excluded)` and use that for both `prevSkillKeySet` and `removedSkills`.

## Scope

- `src/cli/components/wizard/skill-agent-summary.tsx` only (info panel diff renderer).
- No store changes. No config schema changes. No matrix changes.
- Verify the fix against the three tombstone-adjacent scenarios (D-223 dual-scope, D-224 tombstone removal, this P→G toggle) before landing.

## Red tests

**Component test** (`src/cli/components/wizard/__tests__/skill-agent-summary.test.tsx` — create if absent):

```ts
it("shows both '- skill' in Project and '+ skill' in Global when a skill toggles P→G", () => {
  const installed: SkillConfig[] = [
    { id: "react", scope: "project", source: "public" },
  ];
  const current: SkillConfig[] = [
    { id: "react", scope: "global", source: "public" },
  ];
  const { lastFrame } = render(
    <SkillAgentSummary skillConfigs={current} />, // with installedSkillConfigs set via store
  );
  const frame = lastFrame();
  expect(frame).toMatch(/Project[\s\S]*- React/);
  expect(frame).toMatch(/Global[\s\S]*\+ React/);
});

it("does NOT show a spurious '-' when a tombstone is removed on P→G", () => {
  // Baseline (from D-224): project active + global tombstone
  const installed: SkillConfig[] = [
    { id: "react", scope: "project", source: "public" },
    { id: "react", scope: "global", source: "public", excluded: true },
  ];
  // After P→G: clean global, no tombstone
  const current: SkillConfig[] = [
    { id: "react", scope: "global", source: "public" },
  ];
  const frame = render(<SkillAgentSummary skillConfigs={current} />).lastFrame();
  // Expected: '- react' in Project (project-scope install was displaced),
  //           '+ react' in Global (now globally active)
  // NOT expected: a second '- react' in Global from tombstone removal
  expect(frame).toMatch(/Project[\s\S]*- React/);
  expect(frame).toMatch(/Global[\s\S]*\+ React/);
  const globalDashCount = (frame?.match(/Global[\s\S]*- React/g) ?? []).length;
  expect(globalDashCount).toBe(0);
});

it("shows symmetric diff for agents on P→G toggle", () => {
  const installed: AgentScopeConfig[] = [{ name: "web-developer", scope: "project" }];
  const current: AgentScopeConfig[] = [{ name: "web-developer", scope: "global" }];
  const frame = render(<SkillAgentSummary agentConfigs={current} />).lastFrame();
  expect(frame).toMatch(/Project[\s\S]*- web-developer/);
  expect(frame).toMatch(/Global[\s\S]*\+ web-developer/);
});
```

**E2E** (`e2e/wizard/info-panel-scope-toggle-diff.e2e.test.ts`):

1. Fixture: project with `react` installed at `scope: "project"`, `installedSkillConfigs` populated.
2. Launch `cc edit`, navigate to scope-toggle action on `react`, toggle P→G.
3. Reach the confirm step (info panel visible with change summary).
4. Assert: info panel contains `Project\n  - react` AND `Global\n  + react` (both sides of the move are summarized).
5. Don't complete the install — snapshot the panel and exit. Filesystem and config should be unchanged (pre-install confirm step).

## Acceptance

- Red tests pass.
- After P→G toggle in the wizard, the info panel shows a `-` row in the Project section AND a `+` row in the Global section for the toggled skill.
- After G→P toggle, symmetric: `-` in Global, `+` in Project.
- D-223 dual-scope display unaffected (no spurious `-` for inherited-global skills).
- D-224 tombstone-removal case does not produce a spurious `-` row for the tombstone disappearing.
- Same symmetry for agents.
- No regression in the source-changed (`~`) path.

## Non-goals

- Don't introduce a new "moved" UI token (`P → G`) — defer Option B to a follow-up UX pass.
- Don't change `installedSkillConfigs` shape or the store initialization path.
- Don't fix D-223 or D-224 here — those are tombstone bugs in different code paths. Land D-225 after D-223/D-224 are resolved or verify interaction by running all three fixtures against the proposed patch.
- Don't touch `category-grid.tsx` `SkillTag` rendering — the inline `[P] [G]` badges are orthogonal to the info-panel diff summary.

## Related

- D-223 — wizard scope indicator missing for tombstoned global skills.
- D-224 — wizard hides global install state after P→G toggle when prior tombstone existed.
- All three touch `installedSkillConfigs` and the scope-toggle lifecycle. Fix order should be D-223 → D-224 → D-225, because D-225's test for tombstone non-interference depends on D-224's tombstone-removal behavior being correct.
