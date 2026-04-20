# D-220 — Agent-skill regeneration overrides user stack curation

> **Status: DONE (2026-04-20).** Fix landed across `config-generator.ts` (new `shouldIncludeTriple` predicate + `StackBuildInputs.newlyAddedSkillIds`) and `local-installer.ts` (`buildEjectConfig` computes `newlyAddedSkillIds` + `scopeEligibilityGained` and threads them into the generator). E2E coverage lives in `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` (both scenarios green). Unit coverage across `config-generator.test.ts`, `config-merger.test.ts`, `local-installer.test.ts`: 183/183 pass. Beyond the original plan, a second delta — `scopeEligibilityGained` — admits skills whose (agent, skill) pair became scope-compatible since the last save (pure scope-flip case). The plan's 3-case rule alone would silently omit these.
>
> **Nice-to-have test hardening (not blocking)**: (1) dedicated unit test for all-agents-empty → merger fallback, (2) YAML-authored `preloaded: true` roundtrip combined with the D-220 branch. Noted in `D-220-investigations/08-edge-cases.md`.
>
> **Related finding**: `.ai-docs/agent-findings/2026-04-17-shared-config-stack-parser.md` — `stack-per-agent-curation.e2e.test.ts` is one of four E2E tests hand-rolling a config.ts parser; opportunistic DRY refactor candidate post-D-220.
>
> **Verified against current code on 2026-04-17.** Root cause, fix direction, and non-goals are accurate. One scope refinement: `write-project-config.ts` itself needs no changes (it only routes to `buildAndMergeConfig`, which already threads `existingStack`); the `newlyAddedSkillIds` delta should be computed inside `buildEjectConfig` where `existing` config is already loaded. `edit.tsx` uses `writeProjectConfig` (via `operations/project/`), which transitively calls `buildAndMergeConfig` → `buildEjectConfig` — no changes needed in `edit.tsx` or `write-project-config.ts`.

## The rule (user-stated multiple times)

**Only newly-added skills should be appended to existing agents' stacks.** Existing agents keep their curated skill list untouched. The user, not the CLI, is authoritative for stack membership of any agent that already exists in the saved config.

- User's saved `stack.<agent>` is the source of truth for that agent's skills.
- NEW skills the user just added this session get appended to existing agents' stacks (where ownership/scope applies).
- NEW agents added this session seed their stack from ownership-derived defaults as today.
- Globally-removed skills drop out (already handled).
- `preloaded` flag preservation (prior fix) stays as-is.

## Symptom

1. User has a project with `stack.web-researcher` including `web-framework-nextjs`.
2. User edits `config.ts` and removes `web-framework-nextjs` from `stack.web-researcher` (keeping it in top-level `skills[]` and other agents' stacks).
3. User runs `cc edit` and adds an unrelated skill (e.g. an observability skill).
4. After the edit completes, `web-framework-nextjs` has been re-added to `stack.web-researcher`.

## Confirmed root cause (10-agent investigation 2026-04-17)

`src/cli/lib/configuration/config-generator.ts::buildAgentStack` regenerates each agent's stack from `(activeSkillsByCategory) × (selectedAgents) × (ownsCategory) × (scope)` on every save. The `existingStack` parameter is consulted ONLY for the `preloaded` boolean (`wasPreviouslyPreloaded`). Membership is re-derived from scratch.

The wizard store has no per-agent skill field at all — `domainSelections` is `domain → category → SkillId[]`, flat. So there is no place in the current pipeline where user-driven per-agent removals are even representable.

The prior 2026-04-15 stack-ownership fix plumbed `existingStack` through but only used it for `preloaded` inheritance, not membership preservation.

### Dimension-by-dimension handling (current state)

| Dimension | Handled? |
|---|---|
| Add new skill globally → appears in agent stacks | Yes |
| Remove skill globally → disappears everywhere | Yes |
| Preserve `preloaded: true` | Yes (prior fix) |
| Remove agent globally → stack entry drops | Yes |
| **Remove skill from ONE agent's stack only** | **No** — gets re-added next save |

## Fix direction

The fix lives in `buildAgentStack` + its caller chain. Per the rule:

1. For each `(agent, category, skillId)` triple in `activeSkillsByCategory × selectedAgents`:
   - If `agent` exists in `existingStack`:
     - If `skillId` was in `existingStack[agent][category]` → keep it (with `preloaded` preserved).
     - If `skillId` was NOT in `existingStack[agent][category]` AND `skillId` is in the "newly added this session" set → append (with `preloaded: false`).
     - Otherwise → **omit**. Respects the user's removal.
   - If `agent` does NOT exist in `existingStack`:
     - Seed from ownership-derived defaults (current behavior).

2. Compute "newly added this session" = `difference(wizardResult.skills.map(s => s.id), existingConfig.skills.map(s => s.id))` inside `buildEjectConfig` (where `existing = await loadProjectConfig(projectDir)` already runs at local-installer.ts:187). Thread `newlyAddedSkillIds` into `generateProjectConfigFromSkills` options alongside `existingStack`, then into `StackBuildInputs` for `buildStackForSelection` / `buildAgentStack`. `buildAndMergeConfig` and `writeProjectConfig` signatures do NOT need to change — the delta is internal to `buildEjectConfig`.

3. The wizard store still doesn't need a per-agent skill field — the preservation is a pure function of `(existingStack, activeSkillsByCategory, newlyAddedSkillIds)` at write time.

## Related prior findings

- `.ai-docs/agent-findings/2026-04-15-stack-ownership-model-and-preloaded-preservation.md` — earlier work on `preloaded` preservation. Same seam; this adds membership preservation alongside flag preservation.

## Tests (red before fix)

### Integration — `src/cli/lib/configuration/config-generator.test.ts` (new case in `stack ownership contract`)

```ts
it("preserves user removal of a skill from one agent's stack while keeping it on others", () => {
  initializeMatrix(REACT_SCSS_MATRIX);
  const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];
  const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
    "web-developer": {
      "web-framework": [{ id: "web-framework-react", preloaded: false }],
      // web-styling intentionally absent — user hand-removed it
    },
    "web-reviewer": {
      "web-framework": [{ id: "web-framework-react", preloaded: false }],
      "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
    },
  };

  const config = generateProjectConfigFromSkills(
    "my-project",
    ["web-framework-react", "web-styling-scss-modules"],
    {
      selectedAgents,
      skillConfigs: buildSkillConfigs([...]),
      agentConfigs: buildAgentConfigs(selectedAgents),
      existingStack,
      newlyAddedSkillIds: [],
    },
  );

  expect(config.stack?.["web-developer"]?.["web-styling"]).toBeUndefined();
  expect(config.stack?.["web-reviewer"]?.["web-styling"]).toStrictEqual([
    { id: "web-styling-scss-modules", preloaded: false },
  ]);
});

it("appends newly-added skills to existing agents' stacks", () => {
  // existingStack has web-developer with one skill; user adds a new skill globally.
  // Expected: new skill appended to web-developer, existing skill preserved.
});

it("seeds new agents' stacks from ownership defaults", () => {
  // existingStack has web-developer only; user adds web-reviewer this session.
  // Expected: web-reviewer stack seeded from ownership, web-developer untouched.
});
```

### E2E — `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` (new)

1. Init with a stack; snapshot resulting `stack.*`.
2. Hand-edit `config.ts`: remove one skill from one agent's stack (keep it in `skills[]` and other agents).
3. `cc edit` → add an unrelated skill → confirm.
4. Reload `config.ts`, parse `stack`.
5. Assert:
   - The removed skill stays removed from the curated agent.
   - The newly-added skill appears on every agent that owns its category.
   - Other agents' stacks are byte-identical to the pre-edit snapshot (`toStrictEqual`).

## Scope

- `src/cli/lib/configuration/config-generator.ts` — `buildAgentStack`, `buildStackForSelection`, `generateProjectConfigFromSkills` (add `newlyAddedSkillIds` option; extend `StackBuildInputs`).
- `src/cli/lib/installation/local-installer.ts` — `buildEjectConfig` only (compute delta from `existing.config.skills` vs `wizardResult.skills`, pass to generator). `buildAndMergeConfig` signature unchanged.
- `src/cli/lib/operations/project/write-project-config.ts` — **no changes needed**. It calls `buildAndMergeConfig` which delegates to `buildEjectConfig`.
- `src/cli/commands/edit.tsx` — **no changes needed**. It uses `writeProjectConfig`.
- Tests: `config-generator.test.ts` + new E2E (`stack-per-agent-curation.e2e.test.ts`).

## Non-goals

- Don't redesign stack ownership or wizard-store per-agent state.
- Don't remove `preloaded` preservation behavior.
- Don't block `init` first-run behavior where `existingStack` is empty.

## Acceptance

- Red tests above turn green with the fix.
- All existing `stack ownership contract` tests stay green.
- `preloaded-preservation.e2e.test.ts` stays green.
- No regression in `init` first-run stack seeding.
- Dimension-by-dimension handling table updated to "Yes" for per-agent removal.
