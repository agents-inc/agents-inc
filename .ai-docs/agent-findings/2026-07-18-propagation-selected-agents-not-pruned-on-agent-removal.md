---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-writer.ts
standards_docs:
  - .ai-docs/standards/ (no standard exists for this invariant)
date: 2026-07-18
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >
  Added `retainReconciledSelectedAgents` helper in local-installer.ts and wired it
  into `propagateGlobalChangesToProjects` so `selectedAgents[]` is reconciled
  symmetrically with `agents[]`. A name is retained only when backed by an active
  project-scoped agent the project owns OR an agent still active in the current
  globalConfig (`globalHasActiveAgent`). Confirmed-red test
  `edit-global-agent-removal-propagation.e2e.test.ts` now passes with `.fails`
  removed; full unit suite + related propagation E2E suites green.
---

<!--
How to resolve a finding:
- Edit this file in place. Do NOT move or rename it (cross-links break silently).
- Add BOTH `status: resolved` AND `resolved_by: <short note>` to the frontmatter — always paired.
-->

## What Was Wrong

When a GLOBAL agent is removed via `cc edit` at global scope,
`propagateGlobalChangesToProjects` (`src/cli/lib/installation/local-installer.ts`)
reconciles a registered project's `agents[]` (via `retainReconciledAgents`) and
its `stack` (via `retainReconciledStack`) against the now-current global config,
but it never reconciles `selectedAgents[]`.

`projectSplit` is built as `{ ...projectConfig, skills, agents, stack }` — so
`selectedAgents` is carried forward verbatim from the project's on-disk config.
A registered project's stored `selectedAgents` is a flat name array that
legitimately contains global agent names (the inlined writer
`generateProjectConfigWithInlinedGlobal` emits
`selectedAgents = union(global.selectedAgents, project.selectedAgents)`). On
re-propagation the inlined writer re-unions that stale project copy with the
now-shrunken global list, so the removed global agent's name **survives** in the
rendered `selectedAgents[]` even though it is correctly dropped from `agents[]`.

Result: after removing global `web-developer`, a registered project's
`config.ts` renders:

```ts
const agents: AgentScopeConfig[] = [
  // project
  { name: "api-developer", scope: "project" },
];
const selectedAgents: SelectedAgentName[] = ["web-developer", "api-developer"];
//                                            ^ removed global agent, no longer in agents[]
```

`selectedAgents[]` now references an agent absent from `agents[]` — an internal
drift that persists across every subsequent propagation (it is never pruned).

This is the **agent-REMOVAL** direction that D-222 explicitly deferred. D-222
(`todo/D-222-agent-propagation-selected-agents-type-drift.md`, marked DONE)
fixed the agent-ADDITION case (value/type lockstep when adding a global agent)
and lists "agent REMOVAL propagation" as an uncovered follow-up. It is distinct
from the store/config-generator mismatch in
`2026-04-22-excluded-agent-tombstone-vs-selected-agents-mismatch.md` (that one is
the wizard store's `selectedAgents`/`agentConfigs` tombstone semantic; this one
is the propagation write path in `local-installer.ts`).

Evidence (real CLI run, seeded via `writeProjectConfig` mirroring
`edit-global-propagation-stale-stack-ref.e2e.test.ts`): after a global-scope
edit removing `web-developer`, the registered project loads with
`agents (active) = ["api-developer"]` but
`selectedAgents = ["web-developer", "api-developer"]`. Captured by
`e2e/lifecycle/edit-global-agent-removal-propagation.e2e.test.ts` — the
`selectedAgents` assertion is marked `it.fails(...)` to document the confirmed
bug without fixing it.

## Fix Applied

Added `retainReconciledSelectedAgents(selectedAgents, reconciledAgents, globalConfig)`
in `src/cli/lib/installation/local-installer.ts`, mirroring the existing
`retainReconciledAgents` / `globalHasActiveAgent` pattern. It keeps a name only when
it is backed by a real active agent — either a project-scoped agent the project owns
(read from the already-reconciled `agents[]`, where project-scoped entries are always
retained) or an agent still active in the current `globalConfig`
(`globalHasActiveAgent`). Wired into `propagateGlobalChangesToProjects`: the reconciled
`agents[]` is computed once into `reconciledAgents`, then reused for both the
`agents` field and the new `selectedAgents` field of `projectSplit`, so the two arrays
are reconciled symmetrically before the inlined writer re-unions with the shrunken
global list. `selectedAgents === undefined` short-circuits (no crash, unchanged output).

Confirmed-red assertion in
`e2e/lifecycle/edit-global-agent-removal-propagation.e2e.test.ts` now passes with
`.fails` removed.

## Proposed Standard

Add to CLAUDE.md "Scope Awareness (project vs global)" section:

> When `propagateGlobalChangesToProjects` reconciles a registered project's
> inlined global data, reconcile ALL scope-derived arrays symmetrically —
> `skills[]`, `agents[]`, `stack`, AND `selectedAgents[]`. A removed global
> agent/skill dropped from `agents[]`/`skills[]` but left in `selectedAgents[]`
> is a silent drift that never self-heals across propagation cycles. Never
> carry `selectedAgents` forward verbatim while reconciling its sibling arrays.

Also worth a config-writer/loader invariant test: every name in a rendered
project `selectedAgents[]` must correspond to an active entry in that project's
`agents[]` (project-scoped) or the current global `agents[]`.
