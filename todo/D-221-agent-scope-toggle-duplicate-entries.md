# D-221 — Agent scope toggle (project → global) corrupts `agents` array with duplicate project-scope rows

> **Status: DONE (2026-04-20).** `src/cli/lib/configuration/config-merger.ts::mergeConfigs` now uses compound keys `${name}:${scope}${excluded?':excluded':''}` (parallel `skillKey`), `flatMap` with authoritative-from-newConfig drop semantic, and final `uniqueBy` dedup. Unit 45/45, E2E `agent-scope-toggle-agents-array.e2e.test.ts` 3/3 pass. Finding: `.ai-docs/agent-findings/2026-04-17-merger-authoritative-for-names-semantic.md`.
>
> **Nice-to-have gaps**: secondary `splitConfigByScope` dedup in `config-generator.ts` NOT applied (merger dedup alone sufficient); `uniqueBy` keeps-first-collision (plan said last but real-world impact low); no dedicated 5× idempotency repro test; no combined skill+agent toggle E2E.


## Symptom

A project starts with some agents at `scope: "project"` (or the user adds an agent initially at project scope). The user opens `cc edit` and toggles one of those agents (e.g. `web-researcher`) to global scope. The edit completes; the filesystem reflects the change correctly (agent file is now under `~/.claude/agents/` instead of `<project>/.claude/agents/`, settings.json updated, etc.), BUT the `agents: AgentScopeConfig[]` array in `config.ts` is mangled:

```ts
const agents: AgentScopeConfig[] = [
  // global
  {"name":"web-developer","scope":"global"},
  {"name":"web-reviewer","scope":"global"},
  {"name":"web-researcher","scope":"global"},   // ← correct new global entry
  {"name":"web-tester","scope":"global"},
  {"name":"web-pm","scope":"global"},
  // project
  {"name":"web-researcher","scope":"project"},  // ← wrong: should be removed
  {"name":"web-researcher","scope":"project"},  // ← duplicate
  {"name":"web-researcher","scope":"project"},  // ← duplicate
  {"name":"web-researcher","scope":"project"},  // ← duplicate
  {"name":"web-researcher","scope":"project"},  // ← duplicate
];
```

Two problems in one:
1. **Stale project-scope row not removed** on migration to global. The migrated agent should NOT appear at project scope anymore.
2. **Massive duplication** — the same `{name, scope: "project"}` row is appended 5× in this observation.

## Why this matters

- `config.ts` is a committed artifact; a corrupted agents array leaks into code review, CI, and downstream tooling.
- Any consumer that iterates `agents` by index, counts, or joins on `(name, scope)` will produce wrong results (compile fan-out, permission resolution, dashboard display).
- The TypeScript shape still satisfies `AgentScopeConfig[]`, so it compiles silently — the bug surfaces only as behavioral drift until someone reads the file.

## Investigation findings (2026-04-17)

Traced the project→global toggle code path end to end. Summary: hypotheses 3 and 4 from the original plan are **falsified** by the code; hypothesis 2 is **the confirmed root cause**, but via a mechanism subtler than "concatenation without dedup". Hypothesis 1 is a downstream symptom of the same root cause.

### Confirmed root cause: `mergeConfigs` agent-key collapses scope; merge loop fans existing duplicates out by name

**File:** `src/cli/lib/configuration/config-merger.ts`
**Function:** `mergeConfigs` (lines 23–85, agent merge at lines 42–51)

```ts
const agentKey = (a: AgentScopeConfig) => (a.excluded ? `${a.name}:excluded` : a.name);
const newAgentsByKey = indexBy(merged.agents, agentKey);
const existingKeys = new Set(existingConfig.agents.map((a) => agentKey(a)));
const updatedExisting = existingConfig.agents.map(
  (existing) => newAgentsByKey[agentKey(existing)] ?? existing,
);
const addedAgents = merged.agents.filter((a) => !existingKeys.has(agentKey(a)));
merged.agents = [...updatedExisting, ...addedAgents];
```

**Two structural problems here:**

1. **`agentKey` ignores scope.** For non-excluded entries the key is just `name`. That means `{name:"web-researcher", scope:"project"}` and `{name:"web-researcher", scope:"global"}` collide on the same key. Two distinct semantic entries are treated as one.

2. **`updatedExisting` is a positional `.map()` over existing.** If `existingConfig.agents` contains N entries with the same name (say, five `web-researcher:project` rows accumulated from a prior bug), the map produces N copies of the same new value (`newAgentsByKey["web-researcher"] = {web-researcher, global}`). Combined with (1), this means a single new entry fans out to replace every collision — duplication is *preserved* by count and *mutated* by value, never deduped. Old rows aren't "not removed"; they are rewritten in place, multiplicatively.

The "5 duplicates matching 5 total agents" clue in the original plan is misleading. The 5× is the count of pre-existing `web-researcher` rows in `existingConfig.agents` at merge time, not a function of how many agents are selected. That explains why:

- The stale project row isn't "not removed" — it *is* rewritten, but there were multiple of them, and the merge faithfully copies the count.
- The scope written to each row depends on which new entry the name maps to; if wizard result has web-researcher at project (some other flow) they all get rewritten at project. If at global, all get rewritten at global.
- The bug is self-amplifying across edits when combined with the inlined-global write path.

### Why duplicates accumulate in the first place: the loaded `existingConfig` has pre-resolved/inlined globals

**File:** `src/cli/lib/configuration/config-writer.ts`
**Function:** `generateProjectConfigWithInlinedGlobal` (lines 312–410+)

Project config files are written with **all agents inlined** (no `import globalConfig` spread):

```
const agents: AgentScopeConfig[] = [
  // global
  {"name":"web-developer","scope":"global"},
  ...
  // project
  {"name":"web-researcher","scope":"project"},
];
```

**File:** `src/cli/lib/configuration/config-loader.ts`
**Function:** `loadConfig` (lines 28–68)

`loadConfig` uses `jiti.import` which evaluates the TS file and returns the resolved default export. For inlined configs, `existingConfig.agents` contains every agent in the file verbatim — *including global entries that duplicate what's in the global config*. The project config is the source of truth for the project's view of both global and project agents.

That means on every edit, `mergeConfigs` sees:
- `existingConfig.agents` = inlined globals (from project file) + project-scoped (from project file)
- `newConfig.agents` = freshly generated from the wizard

If *any* prior write left a stale name-colliding row in the project file (e.g. web-researcher appears both under `// global` and `// project`), `agentKey`'s name-only key collapses them, `updatedExisting.map` rewrites all positions, and the next round-trip persists the duplicated count.

### Secondary contributor: `splitConfigByScope` filter is scope-true but trusts counts

**File:** `src/cli/lib/configuration/config-generator.ts`
**Function:** `splitConfigByScope` (lines 321–404, agent split at lines 329–332)

```ts
const globalAgents = config.agents.filter((a) => a.scope === "global" && !a.excluded);
const projectAgents = config.agents.filter(
  (a) => a.scope === "project" || (a.scope === "global" && a.excluded),
);
```

If `finalConfig.agents` (post-merge) contains N copies of `web-researcher:project`, the filter keeps all N. The split is correct per entry but has no dedup, so it propagates the corruption into `projectSplitConfig.agents`, which `generateProjectConfigWithInlinedGlobal` then writes as N lines under `// project`.

### Falsified hypotheses

- **Hypothesis 3 (config-generator O(n²) push in outer loop):** FALSIFIED. `generateProjectConfigFromSkills` builds `activeAgentConfigs` via `agentList.map(name => providedAgentsByName[name])` where `providedAgentsByName = indexBy(agentConfigs.filter(!excluded), a => a.name)`. `indexBy` dedupes by key; `.map` is O(n), not nested. `finalAgentConfigs = [...activeAgentConfigs, ...excludedAgentConfigs]` has exactly one row per selected agent plus one per excluded tombstone. No multiplicative push.

- **Hypothesis 4 (wizard store `toggleAgentScope` pushes without replace):** FALSIFIED. `toggleAgentScope` at `src/cli/stores/wizard-store.ts` lines 1121–1153 uses `state.agentConfigs.map(ac => ac.name === agentName && !ac.excluded ? { ...ac, scope: newScope } : ac)`. It replaces in place; it only appends in the *global→project* direction when `wasInstalledGlobally` is true, and only an excluded tombstone (guarded by an existence check). The project→global branch filters tombstones, never pushes.

- **Hypothesis 1 (stale project row not removed on migration):** FALSIFIED at the merge layer. When wizard output has `{web-researcher, global}` and existing has one `{web-researcher, project}` row, the merge's name-keyed rewrite replaces the existing row with the new row. The stale row *is* removed — in the single-row case. The observed "not removed" is a symptom of the multi-row case described in the root cause above.

### Remaining open question

The investigation could not identify the *first* write that introduced a name-colliding duplicate into the project file. Candidates to trace with an actual reproduction (init → edit → edit with scope toggles mixed across sessions):

- `mergeConfigs`'s `addedAgents = merged.agents.filter((a) => !existingKeys.has(agentKey(a)))` — if `existingKeys` lacks a name but `merged.agents` has two entries with the same name and different scopes, both get added. Plausible when the *new* wizard output itself contains `name` collisions (e.g., active agent + excluded tombstone both without `excluded: true` in some edge case, or when `wizardResult.agentConfigs` is mis-hydrated).
- The first P→G toggle on a project that has a global config with that agent already present: wizard hydration at `edit.tsx:230` seeds `installedAgentConfigs` from `projectConfig?.agents` (the inlined-resolved array). If the agent appeared in both `// global` and `// project` sections (because it was installed at project scope while the global config also has it), the store receives two entries with the same name, and downstream merges amplify.

## Scope

- `src/cli/lib/configuration/config-merger.ts` — **primary fix site.** Change `agentKey` and `skillKey` to include scope so entries at different scopes are distinct, not collapsed. Consider a dedup pass on the output to be defensive against malformed input.
- `src/cli/lib/configuration/config-generator.ts` — `splitConfigByScope` agent/skill splits should dedup by `(name, scope)` / `(id, scope)` to not propagate existing file corruption into a new write.
- `src/cli/lib/configuration/config-writer.ts` — `generateProjectConfigWithInlinedGlobal` could defensively dedup `cleanedProject.agents` and `cleanedGlobal.agents` before rendering, as a belt-and-suspenders measure.
- `src/cli/commands/edit.tsx` — no fix needed in the command itself; `detectConfigChanges` and `toggleAgentScope` behave correctly. The bug is downstream in the merge/write pipeline.
- Tests: `src/cli/lib/configuration/config-merger.test.ts` (unit), `src/cli/lib/configuration/config-generator.test.ts` (integration for `splitConfigByScope`), `e2e/lifecycle/scope-toggle-config-snapshot.e2e.test.ts` (extend to assert `agents` array cardinality, not just file existence — existing E2E asserts `projectConfigAfter.toContain("web-developer")` which doesn't catch count duplication).

## Fix direction

**Primary (`config-merger.ts::mergeConfigs`):**

1. Change `agentKey` to compose name + scope + excluded:
   `(a) => \`${a.name}:${a.scope}${a.excluded ? ":excluded" : ""}\``
2. Apply the same shape to `skillKey` (`id:scope:excluded`). The current `skillKey` has the identical structural defect.
3. After the `updatedExisting`/`addedAgents` concat, dedup the final array by the same compound key, keeping the last occurrence. This repairs any existing on-disk corruption on the next edit cycle instead of faithfully copying it forward.

**Secondary (`config-generator.ts::splitConfigByScope`):**

Dedup `globalAgents`/`projectAgents` and `globalSkills`/`projectSkills` by `(name, scope, excluded)` / `(id, scope, excluded)` before returning. This prevents new writes from amplifying duplicates already present in the input.

**Red tests to write first:**

- Unit (`config-merger.test.ts`):
  - Given `existingConfig.agents = [{wres, project} ×5, {wd, global}]` and `newConfig.agents = [{wd, global}, {wres, global}]`, assert `mergeConfigs(new, existing).agents` has exactly one `web-researcher` at scope `global` and exactly one `web-developer` at scope `global`. Currently fails: produces 5× `web-researcher:global`.
  - Given existing has `{wres, global}` and new has `{wres, project}` (P-flip), assert merge produces `[{wres, project}]`, not both. Currently fails because name-only key keeps the existing row and the add loop drops the new one as a "collision".

- Integration (`config-generator.test.ts`):
  - Given `config.agents = [{wres, project} ×5]`, `splitConfigByScope(config).project.agents` should have exactly one entry. Currently fails: 5 entries.

- E2E (`e2e/lifecycle/scope-toggle-config-snapshot.e2e.test.ts`, extend existing G→P test or add P→G):
  - After a P→G toggle on web-researcher, parse the written project `config.ts` and assert the `agents` array contains exactly one entry with `name: "web-researcher"` and that entry has `scope: "global"`. Also assert no `(name, scope)` pair appears more than once across the whole array.

## Acceptance

- Red tests turn green.
- For every `(name, scope, excluded)` triple in `config.ts::agents` (and the same for `skills` with `(id, scope, excluded)`), there is exactly ONE entry.
- After a scope migration, the old scope row for the migrated agent is removed (i.e., a P→G toggle results in exactly one `{name, global}` and zero `{name, project}` entries for that agent).
- Existing scope-toggle E2Es stay green.
- No regression in `init` (fresh agent array assembly).
- The fix is idempotent: running `cc edit` on a project with pre-existing duplicate rows produces a deduped file.

## Non-goals

- Don't rewrite `AgentScopeConfig` shape.
- Don't change the semantics of dual-scope agents (an agent can still legitimately appear at both scopes via an excluded tombstone at one scope and an active row at the other — confirmed behavior in `toggleAgentScope` and `splitConfigByScope`).
- Don't change the inlined-global write format. The root cause is in merge-key identity, not in how the file is serialized.
