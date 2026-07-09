---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/ (no standard exists for this invariant)
date: 2026-04-22
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: rule-not-specific-enough
---

## What Was Wrong

In the Global Scope edit wizard, removing a globally-installed agent (e.g. `web-architecture`) fires `toggleAgent` → `applyAgentToggle` which intentionally leaves the agent name in `selectedAgents` but rewrites its entry in `agentConfigs` to `{ excluded: true }` (src/cli/stores/wizard-store.ts:1115-1125). The "excluded tombstone" semantic preserves the name for other projects that share the global config.

But `generateProjectConfigFromSkills` (config-generator.ts:240) computes `agentList = selectedAgents` — which still contains `web-architecture` — while `agentScope` is built from `agentConfigs.filter((a) => !a.excluded)` (line 331-333). The stack builder then iterates `agentList` and calls `isScopeCompatible` → `getScopeOrThrow(agentScope, "web-architecture", "agent")`, which throws:

```
generateProjectConfigFromSkills: agent 'web-architecture' missing from
agentConfigs. Caller must pass a AgentScopeConfig for every selected agent.
```

The error is caught at src/cli/commands/edit.tsx:573 and degraded to `this.warn(...)`, so the wizard completes but config.ts skips the update silently. The "selected agent" invariant is inconsistent with the store's tombstone semantics.

## Fix Applied

None — discovery only. Proposed one-line fix: in `generateProjectConfigFromSkills` (config-generator.ts:240), filter `selectedAgents` against the non-excluded `agentConfigs` before sorting:

```ts
const activeAgentNames = new Set(
  (options?.agentConfigs ?? []).filter((a) => !a.excluded).map((a) => a.name),
);
const agentList = options?.selectedAgents
  ? [...options.selectedAgents].filter((a) => activeAgentNames.has(a)).sort()
  : [];
```

This restores the caller contract: `agentList` is "agents whose stack must be built this save" — excluded tombstones are preserved separately via `excludedAgentConfigs` at line 378 and flow through to `finalAgentConfigs`. No behavior change for callers that pass a fully-active list.

## Proposed Standard

Add to CLAUDE.md "Data Integrity" section:

> NEVER treat `selectedAgents` and `agentConfigs` as parallel arrays — `selectedAgents` may intentionally contain names whose `agentConfigs` entry is `{ excluded: true }` (global-install tombstone semantic). Derive active agent names from `agentConfigs.filter(a => !a.excluded)`, not from `selectedAgents` directly. The same rule applies to `skillConfigs` for skill-side excluded tombstones.

Also add a unit test under `config-generator.test.ts` that passes `selectedAgents: ["web-architecture", "web-developer"]` with `agentConfigs` containing `web-architecture` marked `excluded: true` — the function must succeed and only build stack entries for `web-developer`.
