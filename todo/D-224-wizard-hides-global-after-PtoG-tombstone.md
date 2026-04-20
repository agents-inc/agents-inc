# D-224 — Wizard hides global install state after P→G toggle when a prior tombstone existed

> **Status: DONE (2026-04-20)**. Fix A landed in `src/cli/stores/wizard-store.ts`: `toggleSkillScope` P→G branch unconditionally drops any `{id, excluded:true}` tombstone regardless of `wasInstalledGlobally`; `toggleAgentScope` made symmetric (agent path had same asymmetry, now fixed); `populateFromSkillIds` tombstone filter updated for D-223 so tombstones survive hydration. E2E `e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts` 3/3 green. Fix B (pass live global config into wizard) and Fix C (writer-side invariant in `config-merger.ts`) intentionally deferred — Fix A alone proved sufficient.
>
> **Historical note**: empirical observation from `.ai-docs/agent-findings/2026-04-17-d224-ptog-tombstone-not-cleared.md` showed only the tombstone survived the write pipeline (not the dupe pair the plan hypothesised). The store-layer Fix A short-circuits the problem upstream of the config-generator / merger drop site, making Fix C moot for the observed symptom.
>
> **Follow-up gaps** (not blocking): multi-cycle G→P→G→P→G stability test, combined skill+agent simultaneous PtoG test, PtoG-when-global-uninstalled-mid-cycle edge case, `setSkillSource` / `setSourceSelection` may still lack `!sc.excluded` guards (per D-224-investigations/08-edge-cases.md Case 5).


## Symptom

Two-step scope dance leaves the config with an **orphaned tombstone** that the wizard reads as "skill is not really there":

1. Install a skill globally. Global config: `{id:"react", scope:"global"}`. Project config: empty.
2. Run `cc edit` in project, toggle the skill G→P.
   - Project config becomes: `[{id:"react", scope:"project"}, {id:"react", scope:"global", excluded:true}]`. The tombstone masks the untouched global install for THIS project only. Under D-223 the wizard shows only `P` (D-223 bug).
3. Run `cc edit` again, toggle the same skill P→G.
   - **Expected:** clean global-only state in the project config (tombstone removed: `[{id:"react", scope:"global"}]`, or the project-scope override removed entirely so the project inherits the global install). Wizard shows `G`.
   - **Observed:** wizard shows **nothing** — no scope badge, no `+`/`-` change indicator, as if the skill was never touched. The written project config ends up with TWO global entries for the same id: `[{id:"react", scope:"global"}, {id:"react", scope:"global", excluded:true}]`.

## Why this matters

- Silent data corruption: the written config has two entries for the same id, one of which is a self-cancelling tombstone pointing at the same scope as the active entry.
- The wizard's info panel reads the corrupted shape and reports "no change" — the user has no signal that their toggle actually did anything wrong.
- Downstream consumers (`config-writer.ts::generateProjectConfigWithInlinedGlobal`, `config-generator.ts::activeSkillIds`) all assume tombstones mask a DIFFERENT-scope entry. A `{global, excluded:true}` tombstone alongside a `{global}` active entry is nonsense the data model never anticipated.
- Same cluster as D-223 (tombstone surfacing in wizard UI). Likely same root cause in the wizard/config data-flow contract.

## Investigation seeds

- `src/cli/stores/wizard-store.ts::toggleSkillScope` (~lines 954–1003). The P→G branch that removes the excluded entry (line 998) is gated on `wasInstalledGlobally`. That predicate filters `!sc.excluded` on line 979, so a pure-tombstone installedSkillConfigs entry evaluates to `wasInstalledGlobally = false` and the cleanup branch **never fires**.
- `src/cli/stores/wizard-store.ts::toggleAgentScope` (~lines 1121–1153). The agent analogue does NOT filter `!ac.excluded` on line 1129 — asymmetric with the skill version. The tombstone cleanup branch may fire for agents where it won't for skills. Verify which path is actually desired and make them consistent.
- `src/cli/commands/edit.tsx::runEditWizard` (~line 229). Wizard is hydrated with `installedSkillConfigs: projectConfig?.skills` — the PROJECT config only, which after step 2 contains `[{scope:"project"}, {scope:"global", excluded:true}]`. The wizard has no view of the global config's `{scope:"global"}` non-excluded entry, so `wasInstalledGlobally` in the skill path reads the project config as "no live global entry" and treats P→G as if the global install never existed.
- `src/cli/stores/wizard-store.ts::populateFromSkillIds` (~lines 747–791). Excluded entries are appended to `skillConfigs` via `excludedConfigs` (line 782–783) but are never placed in `domainSelections`. Consequence: a skill that only has a tombstone in the PROJECT config (no non-excluded entry) is invisible to the build step. In the D-224 repro this is not directly the trigger (there is a non-excluded project entry), but the same model weakness affects rendering of the post-toggle state.
- `src/cli/lib/wizard/build-step-logic.ts::buildCategoriesForDomain` (~lines 80–103). `activeConfig`, `excludedConfig`, `secondaryScope`. In the corrupted post-toggle state both entries have `scope: "global"` so `secondaryScope` is falsy (scopes equal) and the tag silently shows a single `G` — but the info panel diff below reads the dupe and reports "no change" because the tombstone's `{id, scope}` matches the new active entry's key.
- `src/cli/components/wizard/skill-agent-summary.tsx` (~lines 45–99). `prevSkillKeySet`, `projectSkills`, `globalSkills`, `excludedGlobalSkills`, `removedSkills`. `removedSkills` filter (line 98–99) tests `!currentSkills.some(c => c.id === s.id)` — ID-only, not (id, scope). So removing the project entry by migrating it to global is not detected as a project removal. And `allGlobalSkills` (line 83–87) ends up containing BOTH the new active global and the orphan tombstone with the same `{id, scope}` key → `prevSkillKeySet.has("react:global")` is true (from the tombstone in installedSkillConfigs), so both render as the "unchanged" bullet. Two React children with the same `key` collide.
- `src/cli/lib/operations/project/write-project-config.ts` and `src/cli/lib/configuration/config-merger.ts::mergeConfigs` (lines 53–63). Merger uses compound key `s.excluded ? ${id}:excluded : id`. Two entries with same `id` and same `scope:"global"` but different `excluded` get distinct keys and both survive the merge → the writer faithfully emits the nonsense shape to disk.
- `src/cli/commands/edit.tsx::detectConfigChanges` and helpers (~lines 665–723). Uses `indexBy(oldConfig?.skills ?? [], (s) => s.id)` AFTER the caller pre-filters excluded entries on line 107–111. This is the correct pre-filter, but it only covers change DETECTION — not the writer and not the live wizard rendering. If `wizardResult.skills` coming out of the store contains the corrupted dupe, `writeConfigAndCompile(result, ...)` on line 140 persists it verbatim.

## Root-cause hypotheses to test

1. **`wasInstalledGlobally` gate misses the post-tombstone case (PRIMARY).** `toggleSkillScope` on line 977–980 filters `!sc.excluded`, so when the project config's only global entry is a tombstone, `wasInstalledGlobally = false` and the tombstone-removal branch (line 998) is skipped. The tombstone survives AND the active project entry gets flipped to `scope:"global"` in place — producing two global rows for the same id.

2. **Wizard has an incomplete view of truth.** `installedSkillConfigs` is sourced from `projectConfig.skills` only. The wizard never sees the global config's live `{scope:"global"}` entry, so it cannot reliably decide "the global install still exists, I should remove the tombstone." The skill-side `wasInstalledGlobally` predicate is trying to answer "is there a live global install?" using a data source that doesn't contain that fact once a tombstone has been written.

3. **Asymmetry vs agents (secondary).** `toggleAgentScope`'s `wasInstalledGlobally` does NOT filter `!ac.excluded`. For agents with only a tombstone in `installedAgentConfigs`, the predicate is true and the cleanup branch fires. That "works" by coincidence but treats a tombstone as evidence of a live install — still semantically wrong. Whichever path is correct for skills must be applied to agents too.

4. **Writer accepts dupes.** Even if the store emits `[{global}, {global, excluded:true}]`, `config-merger.ts` and `config-writer.ts` have no sanity check for a tombstone pointing at the same scope as an active entry for the same id. A final-stage dedup/invariant would have caught this. This is a defense-in-depth issue, not the root cause.

## Confirmed root cause (from code inspection)

Root cause = **hypothesis 1 + 2 in combination**.

- `toggleSkillScope` reads `installedSkillConfigs` to decide whether a global install exists. The store was hydrated with `projectConfig.skills`, which after G→P contains only the tombstone. The `!sc.excluded` filter on line 979 therefore returns false: `wasInstalledGlobally = false`.
- The `if (wasInstalledGlobally)` branch on line 987–1000 is the ONLY path that removes the tombstone. It is skipped.
- The active entry gets its `scope` flipped in place to `"global"` by the map on line 983–985. The tombstone is untouched.
- Wizard finalization (`wizard.tsx::handleComplete` ~lines 171–178) collects `skillConfigs.find(sc => sc.id === id && !sc.excluded)` + all excluded entries. Both survive → `wizardResult.skills` contains both.
- `writeConfigAndCompile → writeProjectConfig → mergeConfigs` treats `id:excluded` and `id` as distinct keys → both persisted to `config.ts`.
- On the next render, `skill-agent-summary.tsx` builds `allGlobalSkills = [{scope:"global"}, {scope:"global", excluded:true}]` and `prevSkillKeySet` contains `"react:global"` (from the pre-existing tombstone in installedSkillConfigs). Both entries are keyed to "react:global", both hit `prevSkillKeySet.has(key)`, both render as unchanged bullets — and React warns on duplicate keys. The diff reads as "nothing happened."

## Fix direction (coordinate with D-223)

D-223 fixes wizard VISIBILITY of tombstoned dual-scope skills. D-224 fixes wizard MUTATION of tombstoned dual-scope skills. Both share a missing piece: **the wizard needs a reliable "does a live global install exist?" predicate that does not depend on whether a tombstone has been written to the project config.**

Two complementary fixes (both probably needed):

- **A. Make the tombstone itself authoritative for P→G cleanup.** Change `toggleSkillScope`'s P→G branch to ALWAYS remove a `{scope:"global", excluded:true}` tombstone for this skill when the post-toggle scope is `"global"` — regardless of `wasInstalledGlobally`. Rationale: the tombstone exists iff a prior session recorded "there is (or was) a live global install we chose to mask." Flipping back to global means "stop masking." This makes the skill and agent paths symmetric and removes the dependency on `installedSkillConfigs` for this decision.

- **B. Feed the wizard the REAL installed-global state.** Load the global config (`~/.claude/config.ts`) separately in `edit.tsx::runEditWizard` and pass its non-excluded entries as a distinct `installedGlobalSkillConfigs` input to the store. Rename/separate the existing `installedSkillConfigs` (which is really "project's saved snapshot") from "what is actually installed globally right now." This also unblocks D-223 (shows dual-scope correctly) and likely D-225 (the info panel diff).

- **C. Writer-side invariant (defense-in-depth).** In `mergeConfigs` or `writeScopedConfigs`, reject / dedupe `{id, scope:X, excluded:true}` when `{id, scope:X, excluded:false}` exists. These combinations have no meaning in the data model.

Fix A is the smallest surgical change that stops the regression. Fix B is the correct long-term decoupling and is the shared root fix for the D-223 / D-224 / D-225 cluster. Fix C is cheap insurance.

## Scope

- `src/cli/stores/wizard-store.ts` — `toggleSkillScope` (tombstone removal gating), `toggleAgentScope` (asymmetric `wasInstalledGlobally` predicate), possibly `populateFromSkillIds` / `HydrateOptions` if fix B is taken.
- `src/cli/commands/edit.tsx` — `loadContext` and `runEditWizard` if the wizard needs a separate `installedGlobalSkillConfigs` input (fix B).
- `src/cli/lib/configuration/config-merger.ts` — optional writer-side invariant for fix C.
- `src/cli/components/wizard/skill-agent-summary.tsx` — verify the diff logic is not ALSO broken once the tombstone is cleaned (likely covered by D-225).
- Tests: `wizard-store.test.ts` (unit on `toggleSkillScope`), `config-merger.test.ts` (invariant), E2E `e2e/lifecycle/scope-toggle-*.e2e.test.ts` for the full G→P→G round-trip.

## Red tests

**Unit — `wizard-store.test.ts`** (store-level, fastest to pin the root cause):

```ts
it("P→G toggle removes the global tombstone left by a prior G→P", () => {
  // Seed: prior G→P already ran, config has active project entry + global tombstone.
  useWizardStore.setState({
    skillConfigs: [
      { id: "web-framework-react", scope: "project", source: "eject" },
      { id: "web-framework-react", scope: "global", source: "eject", excluded: true },
    ],
    installedSkillConfigs: [
      // ← the project config snapshot that edit.tsx actually feeds today
      { id: "web-framework-react", scope: "project", source: "eject" },
      { id: "web-framework-react", scope: "global", source: "eject", excluded: true },
    ],
    domainSelections: { web: { "web-framework": ["web-framework-react"] } },
    selectedDomains: ["web"],
  });

  useWizardStore.getState().toggleSkillScope("web-framework-react");

  const configs = useWizardStore.getState().skillConfigs;
  const reactConfigs = configs.filter((sc) => sc.id === "web-framework-react");
  // Exactly ONE entry, clean global, no tombstone
  expect(reactConfigs).toHaveLength(1);
  expect(reactConfigs[0]).toStrictEqual({
    id: "web-framework-react",
    scope: "global",
    source: "eject",
  });
});

it("P→G toggle is symmetric for agents (no orphan global tombstone)", () => {
  // Same seed shape for agents
  useWizardStore.setState({
    agentConfigs: [
      { name: "web-developer", scope: "project" },
      { name: "web-developer", scope: "global", excluded: true },
    ],
    installedAgentConfigs: [
      { name: "web-developer", scope: "project" },
      { name: "web-developer", scope: "global", excluded: true },
    ],
    selectedAgents: ["web-developer"],
  });

  useWizardStore.getState().toggleAgentScope("web-developer");

  const configs = useWizardStore.getState().agentConfigs;
  const devConfigs = configs.filter((ac) => ac.name === "web-developer");
  expect(devConfigs).toHaveLength(1);
  expect(devConfigs[0]).toStrictEqual({ name: "web-developer", scope: "global" });
});
```

**Integration — `config-merger.test.ts`** (writer-side invariant, fix C):

```ts
it("rejects or dedupes {scope:'global', excluded:true} tombstone when {scope:'global'} active entry exists for same id", () => {
  const corrupted = buildProjectConfig({
    skills: [
      ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
    ],
  });
  const merged = mergeConfigs(corrupted, buildProjectConfig({}));
  const react = merged.skills.filter((s) => s.id === "web-framework-react");
  // Only the active entry survives — the tombstone is meaningless when the scope already matches
  expect(react).toStrictEqual(buildSkillConfigs(["web-framework-react"], { scope: "global" }));
});
```

**E2E — `e2e/lifecycle/scope-toggle-round-trip.e2e.test.ts`** (new; full G→P→G cycle):

1. Fresh project, globally install `web-framework-react`. Verify global config has `{scope:"global"}`, project config has no react entry.
2. Run `cc edit` → toggle react G→P → confirm. Verify project config has `[{scope:"project"}, {scope:"global", excluded:true}]`. Under current D-223 state the wizard shows only `P` (acceptable for D-224, separate bug).
3. Run `cc edit` → toggle react P→G → confirm. Before exiting the wizard, assert the info panel shows a global `+` or an unchanged-global state (no duplicate rows, no "nothing changed"). After exit, assert:
   - Project config `skills` either contains exactly ONE react entry `{scope:"global"}` (if we choose to keep an override) OR contains NO react entry (if we choose to fall back to pure global inheritance) — decide during implementation, document in the fix.
   - No tombstone remains (`.filter(s => s.id === "react" && s.excluded).length === 0`).
   - Global config untouched throughout.
4. Run `cc edit` a third time. Assert the wizard shows react as `G` (single badge), NOT as missing, NOT as dual-scope.

All three tests should currently FAIL.

## Acceptance

- Red tests turn green.
- After P→G on a skill whose project config carries a prior `{scope:"global", excluded:true}` tombstone:
  - The tombstone is removed.
  - There is exactly ONE `{id, scope:"global"}` row per id in the final project config (or zero, if we prefer inheritance — pick one and stick with it).
  - The wizard renders `G` for the skill on the next edit session, with a correct `+`/unchanged indicator in the info panel.
- Agent P→G behaves symmetrically (no orphan tombstones).
- Existing G→P scope-toggle E2Es stay green.
- No regression in `init` or in single-scope (project-only or global-only) flows.
- `tsc --noEmit` and full test suite pass.

## Non-goals

- Do NOT change the tombstone *shape* (`{scope:"global", excluded:true}`) or its meaning. This bug is about lifecycle (when it's removed), not representation.
- Do NOT attempt to fix D-223 (dual-scope rendering) as part of this change — only coordinate so the chosen "real installed state" data source serves both bugs. D-223 should be its own PR built on the same foundation.
- Do NOT attempt to fix D-225 (asymmetric diff in info panel) here — it shares the cluster but the diff-assembly logic in `skill-agent-summary.tsx` is a separate surface.
- Do NOT redesign `SkillConfig` / `AgentScopeConfig` or the global-vs-project config split.
- Do NOT change how `installedSkillConfigs` is consumed for READ-ONLY UX signals (dimmed checkmarks, inherited badge) — only for the MUTATION decision in `toggleSkillScope` / `toggleAgentScope`.

## Related

- **D-223** — Wizard scope indicator missing for tombstoned global skills. Same cluster; the wizard's inability to see the true global install state is the shared weakness. Ideally fixed together with fix B above.
- **D-225** — Info panel shows asymmetric diff on scope toggle. Downstream of the same data-source problem: once the wizard knows what's really installed globally, the diff assembly in `skill-agent-summary.tsx` can report both sides of a P↔G move.
- **D-222** — Propagation value/type drift. Unrelated code path, but the same general pattern of "two writers, one updated" — worth keeping in mind when auditing the scope-toggle write path end-to-end.
