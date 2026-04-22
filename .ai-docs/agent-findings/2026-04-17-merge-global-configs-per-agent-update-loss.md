---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - CLAUDE.md
  - todo/D-220-agent-skill-removal-regression.md
date: 2026-04-17
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: D-220 (0.137.0) replaced existing-wins policy with deep-additive stack merge
---

## What Was Wrong

Two coordinated changes altered stack-merge semantics in opposite directions and created a correctness hole.

### 1. `mergeGlobalConfigs` in `src/cli/lib/installation/local-installer.ts` — "existing wins per agent"

The new implementation:

```ts
if (mergedStack[agentName]) continue;
mergedStack[agentName] = agentConfig;
```

The inline comment justifies this as a protection against the split-by-scope global partition "omitting agents that have moved to project scope". That reasoning applies ONLY to agents present in `existingGlobal` but absent from `incoming`. But the implementation ALSO skips agents present in both — which silently DROPS legitimate per-agent updates on the global side.

**Concrete scenario where writes are lost:**

- Project A has global `stack.web-developer = { "web-framework": [...] }`.
- User edits and adds a new global skill in `web-styling` category owned by `web-developer`.
- `splitConfigByScope` produces `incoming.stack.web-developer = { "web-framework": [...], "web-styling": [...new] }`.
- `existingGlobal.stack.web-developer` has the old `{ "web-framework": [...] }` only.
- At the `continue` guard: `mergedStack["web-developer"]` is truthy (from `existing`), so incoming is skipped entirely.
- **Result: the new `web-styling` assignment never reaches the global config.** The skill exists in `global.skills[]` but is orphaned from the agent stack.

Correct policy: agents in `incoming` should take `incoming`'s version (mutator is authoritative); agents only in `existing` should be preserved as-is.

### 2. `mergeConfigs` in `src/cli/lib/configuration/config-merger.ts` — "trust the mutator"

The change from deep-merge to "new wins when defined" is structurally correct IF the mutator emits correct stacks. Per open bug D-220 (`todo/D-220-agent-skill-removal-regression.md`), the mutator (`config-generator.ts::buildAgentStack`) regenerates each agent's stack membership from ownership rules on every save and OVERRIDES user hand-curation of `stack.<agent>`. The previous deep-merge behavior was masking this over-eager regeneration for triples that were already in the existing config.

Removing the safety net without fixing D-220 first means:

- Any user curation of `stack.<agent>` (removing a skill from a specific agent's stack) is now silently reverted on the next `cc edit` run.
- The "trust the mutator" comment should cross-reference D-220 explicitly.

## Fix Applied

None — discovery only. Recommended remediation (in order):

1. Revise `mergeGlobalConfigs` stack policy: `if (incoming.stack?.[agentName]) mergedStack[agentName] = incoming.stack[agentName]`, keeping the absent-from-incoming case as "preserve existing". The "diverges from mergeConfigs" comment becomes unnecessary — both merges then agree on "new wins when present, preserve when absent".
2. Either (a) land the D-220 fix BEFORE the `config-merger.ts` "trust the mutator" change, or (b) extend the comment to reference D-220 and document the known regression window.
3. Add an E2E test that covers: init → edit adds new category owned by an existing global agent → global `stack.<agent>` contains the new category after the edit.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`:

> When a merge function's behavior intentionally diverges from a sibling merge function (same module, similar inputs), the divergence comment MUST include: (1) the exact scenario the divergence handles, (2) a concrete example scenario where it does NOT introduce a regression, and (3) a cross-reference to any open bug whose fix depends on the current behavior staying this way. Divergent merge policies that quietly drop inputs are a recurring source of data-loss bugs.

Also: when changing merge semantics, the commit should include an E2E test that exercises the "new wins" path end-to-end (not just the unit merge function) to catch propagation bugs in `splitConfigByScope` → `mergeGlobalConfigs` → `writeConfigFile` round-trips.
