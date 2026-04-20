# D-222 — Global-agent propagation writes `selectedAgents` value but not its type → type error in other projects

> **Status: DONE (2026-04-20).** `propagateGlobalChangesToProjects` in `src/cli/lib/installation/local-installer.ts` now merges `selectedAgents` into `combinedConfig` (dedup-union of global + project), mirroring the existing `domains` merge. Both writers receive symmetric input. E2E `e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts` 1/1 pass (24s).
>
> **Nice-to-have follow-ups**: unit symmetry-invariant test, agent REMOVAL propagation, multi-project (3+ registered) coverage, `tsc --noEmit` gate. Related finding: `.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md` — must route E2E through project-context edit to trigger propagation.


## Symptom

User toggles an agent (e.g. `web-pm`) to global scope in Project A. Global config is updated. Other registered projects (B, C, …) are then propagated:

- Project B's `config.ts` gets `web-pm` appended to its `selectedAgents: SelectedAgentName[]` literal array.
- Project B's `config-types.ts` does NOT get `"web-pm"` added to the `SelectedAgentName` type union.

Observed state (Project B after propagation):

```ts
// config.ts
const selectedAgents: SelectedAgentName[] = [
  "web-developer", "web-reviewer", "web-researcher", "web-tester", "web-pm",
];

// config-types.ts
export type SelectedAgentName = "web-developer" | "web-reviewer" | "web-researcher" | "web-tester";
//                                                                                                 ^ missing "web-pm"
```

Result: `tsc` errors because `"web-pm"` is not assignable to `SelectedAgentName`.

## Why this matters

- Every downstream project breaks its type check silently until the user runs `tsc` or opens the file.
- Value-side and type-side writers must stay in lockstep. Drift indicates two separate paths touching config on propagation, or a shared path that forgets one output.

## Related

- D-216 "Global → project config propagation + context-sensitive scope defaults" — same feature area. This bug is downstream of that propagation implementation: value-side merging of `selectedAgents` was implemented, but the matching merge on the type-side `combinedConfig` was omitted.
- `.ai-docs/agent-findings/` may have notes on config-types generation.

## Verified code paths

- **Propagation entry point:** `propagateGlobalChangesToProjects` in `src/cli/lib/installation/local-installer.ts` (defined at line 548; called from two sites within the same file at lines 661 and 715). Both `writeStandaloneConfigTypes` (type side) and `writeConfigFile` (value side) are called in sequence inside the per-project loop (lines 590 and 600). So BOTH writers run on propagation — refutes hypothesis 3.
- **Type-side writer:** `generateConfigTypesSource` in `src/cli/lib/configuration/config-types-writer.ts`. The `SelectedAgentName` union is emitted at line 395 from `config?.selectedAgents` directly (lines 375-377):
  ```ts
  const selectedAgentNameLine = config?.selectedAgents?.length
    ? formatUnion(config.selectedAgents as string[])
    : "AgentName";
  ```
  It is **not** matrix-sourced and **not** cached — refutes hypothesis 2. It reads whatever `selectedAgents` array lives on the passed config.
- **Value-side writer:** `generateProjectConfigWithInlinedGlobal` in `src/cli/lib/configuration/config-writer.ts`. Emits the value array at lines 380-381 + 447-452 by **merging global + project selectedAgents deduplicated**:
  ```ts
  const allSelectedAgents = [...new Set([...globalSelectedAgentsArr, ...projectSelectedAgentsArr])];
  // ...
  lines.push(`const selectedAgents: SelectedAgentName[] = [${items}];`);
  ```

## Confirmed root cause — hypothesis 1 (value vs type input diverge)

In `propagateGlobalChangesToProjects` (`local-installer.ts` lines 581-590), the `combinedConfig` passed to `writeStandaloneConfigTypes` spreads `projectConfig` and merges `skills`, `agents`, `domains` from global — but **omits `selectedAgents`**:

```ts
const combinedConfig: ProjectConfig = {
  ...projectConfig,
  skills: [...globalConfig.skills, ...projectConfig.skills.filter(isProjectOwnedEntry)],
  agents: [...globalConfig.agents, ...projectConfig.agents.filter(isProjectOwnedEntry)],
  domains: [...new Set([...(globalConfig.domains ?? []), ...(projectConfig.domains ?? [])])],
  // MISSING: selectedAgents merge
};
```

The spread carries over `projectConfig.selectedAgents` (the stale pre-propagation list), so `generateConfigTypesSource` emits `SelectedAgentName` without the newly-added global agent.

Meanwhile the value-side call at line 600 (`writeConfigFile(projectSplit, projectConfigPath, { isProjectConfig: true, globalConfig })`) routes through `generateProjectConfigWithInlinedGlobal`, which merges global + project `selectedAgents` correctly → the value array gets the new agent.

Result: value-side adds `"web-pm"`, type-side does not → compile error.

**Hypotheses disposition:**
- Hypothesis 1 — **CONFIRMED**: Both writers run, but the input (`combinedConfig`) passed to the type-side writer is missing the merged `selectedAgents` field that the value-side writer computes from `globalConfig + projectConfig`.
- Hypothesis 2 — REFUTED: No caching; type generator reads directly from the config it's given.
- Hypothesis 3 — REFUTED: Both `writeStandaloneConfigTypes` and `writeConfigFile` are called on propagation.
- Hypothesis 4 — REFUTED: Regeneration is unconditional within the propagation loop.

## Fix direction

In `propagateGlobalChangesToProjects` (`src/cli/lib/installation/local-installer.ts`, lines 581-587), extend the `combinedConfig` to merge `selectedAgents` the same way it merges `domains`:

```ts
const combinedConfig: ProjectConfig = {
  ...projectConfig,
  skills: [...globalConfig.skills, ...projectConfig.skills.filter(isProjectOwnedEntry)],
  agents: [...globalConfig.agents, ...projectConfig.agents.filter(isProjectOwnedEntry)],
  domains: [...new Set([...(globalConfig.domains ?? []), ...(projectConfig.domains ?? [])])],
  selectedAgents: [
    ...new Set([
      ...(globalConfig.selectedAgents ?? []),
      ...(projectConfig.selectedAgents ?? []),
    ]),
  ],
};
```

This mirrors the existing dedup-merge logic in `generateProjectConfigWithInlinedGlobal` (`config-writer.ts` line 381), keeping value-side and type-side inputs symmetric. No change needed to `config-types-writer.ts`, `config-writer.ts`, or the writer call sites — the fix is a single field addition to the one object construction site that currently diverges.

Note: `generateConfigTypesSource` in `config-types-writer.ts` will then emit `SelectedAgentName = "<merged union>"` matching the value array exactly. The fallback `"AgentName"` case (line 377) remains correct for configs with no selectedAgents.

## Scope

- Single-site change: the `combinedConfig` object literal inside `propagateGlobalChangesToProjects` in `src/cli/lib/installation/local-installer.ts`.
- Tests: `config-types`-related integration tests, propagation E2E (`e2e/lifecycle/project-tracking-propagation.e2e.test.ts` already exists — check what it asserts and extend it to cover `selectedAgents` + `SelectedAgentName` symmetry on propagation).

## Red tests

**Integration**:

```ts
it("propagates global-agent additions to both selectedAgents array AND SelectedAgentName type", async () => {
  // Setup: project B with agents ["web-developer", "web-reviewer", "web-researcher", "web-tester"]
  // User globally adds "web-pm" from project A.
  // Propagation runs.
  // Assert both:
  expect(projectBConfigTs).toContain(`"web-pm"`);  // value side
  expect(projectBConfigTypesTs).toMatch(/SelectedAgentName\s*=\s*[^;]*"web-pm"/);  // type side
  // tsc on project B passes
});
```

**E2E** (`e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts`):

1. Register two projects with the CLI's project tracking.
2. In Project A, add `web-pm` at global scope.
3. After Project A's wizard completes, inspect Project B's `config.ts` AND `config-types.ts`.
4. Assert value array and type union are both updated, and `tsc --noEmit` on Project B passes.

## Acceptance

- Red tests turn green.
- After any global-agent addition/removal, every registered project's `config.ts::selectedAgents` and `config-types.ts::SelectedAgentName` are updated consistently.
- `tsc --noEmit` on a propagated project passes.
- No regression in existing propagation behavior for skills/domains.

## Non-goals

- Don't redesign the propagation architecture.
- Don't change the shape of `SelectedAgentName` or `AgentScopeConfig`.
- Don't couple to D-216 scope-defaults work — fix the drift in isolation first.

## Open question — RESOLVED

`SelectedAgentName` is the **SELECTED set** (strictly bounded by `selectedAgents`), not the matrix universe. Evidence from `config-types-writer.ts`:

- `generateConfigTypesSource` (lines 375-377) emits `SelectedAgentName` via `formatUnion(config.selectedAgents)` — a direct string-array → union conversion.
- When no selectedAgents exist, it falls back to the literal alias `"AgentName"` (the full universe). This fallback confirms the bounded-set intent: the narrower union is preferred when selections exist; the universe is only used as the absence-fallback.
- `generateProjectConfigTypesSource` (lines 556-558, the global-extending variant) uses the same pattern: `options.selectedAgentNames?.length ? formatUnion(options.selectedAgentNames) : "AgentName"`.
- The value-side writer (`generateProjectConfigWithInlinedGlobal`) emits a concrete literal array of selections, which requires the type to match exactly for `satisfies ProjectConfig` to pass.

**Implication for fix:** value and type must match exactly. The fix is to merge `selectedAgents` into `combinedConfig` on the propagation type-side call, as described in "Fix direction" above.
