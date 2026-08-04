---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/stack-selection.tsx
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-17
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A task requested CLI-driven E2E coverage for D-227 (agent-path tombstone loss on
stack merge + preselect), mirroring the skill-side sibling
`e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts` (D-223). The
proposed scenario: global agent install → fresh `cc init` in a clean project →
pick a stack → advance to the Agents step → toggle an agent G→P (producing the
dual-scope pair) → navigate back to the Stack step and re-pick a stack (to
re-trigger `preselectAgentsFromStack`) → assert the dual-scope pair survives.

**That scenario cannot exercise the D-227 fix, and no realistic end-to-end CLI
flow can.** This was verified empirically against the current (fixed) code with
a throwaway store-level probe replicating exactly what `cc init` does, driving
the real store methods in sequence:

```
AFTER FIRST PICK:  [{web-developer, global}, {api-developer, global}]
AFTER TOGGLE G->P: [{web-developer, project}, {web-developer, global, excluded:true}, {api-developer, global}]
AFTER RE-PICK:     [{web-developer, global}, {api-developer, global}]   <-- dual pair GONE, on fixed code
```

Root cause is the data flow, not the fix:

1. `toggleAgentScope` (agents step) mutates only `state.agentConfigs`.
2. Re-picking a stack calls `selectStack`, which **wipes `agentConfigs: []`**
   (it resets all selections — skills, domains, agents — by design).
3. `preselectAgentsFromStack` then rebuilds `agentConfigs` from
   `state.globalAgentPreselections.configs`, an **immutable snapshot** set once
   at hydrate time (`hydrateWizardStore`, the only writer) from the loaded
   config's `agents`. The agents-step toggle never updates this snapshot.

So the fix's tombstone-preservation branch (`savedConfigs.filter(ac =>
ac.excluded)`) is only non-empty when `globalAgentPreselections.configs` already
contains an excluded tombstone. In the init/stack flow the loaded config is the
**global** (`~/.claude-src`) config, which never legitimately holds a
project-scoped dual pair — that state only exists in a **project** config, and
no wizard flow that reads a project config also runs the agent preselect methods:

- `preselectAgentsFromStack` is stack-step-only → init-only → reads the global config.
- `preselectAgentsFromDomains` reads live `agentConfigs` (so a toggle WOULD feed
  it), but its only trigger (`wizard.tsx`, sources→agents transition) is gated on
  `if (!initialAgents?.length)`. A tombstone requires the agent to be globally
  installed, which makes `initialAgents` (global `selectedAgents`) non-empty —
  permanently closing that gate for the session. The two required conditions are
  mutually exclusive.
- `cc edit` re-open loads the project config (which CAN hold the dual pair) but
  starts at the `build` step, never runs either agent preselect, and hydrates
  `agentConfigs` directly — a path with no D-227-style filter bug.

Contrast with the skill sibling (D-223): the skill dual-scope bug lives in the
**hydrator** (`populateFromSkillIds`), which `cc edit` re-open DOES exercise
against a project config holding the dual pair — hence that E2E is reachable. The
agent hydrate path (`hydrateWizardStore` sets `agentConfigs = installedAgentConfigs`
directly) has no equivalent filter, so there is nothing to regress there; the
agent bug lives exclusively in the preselect methods, which are unreachable with
a tombstone via real CLI state.

Both D-227 preselect paths ARE covered at the unit level and remain green:
`wizard-store.test.ts` "preserves excluded tombstone when active agent entry
exists for same agent at different scope" (`preselectAgentsFromDomains`) and
"preserves excluded tombstone in preselectAgentsFromStack when active entry
exists at different scope" (`preselectAgentsFromStack`) — both seed the dual pair
directly into store state, bypassing the unreachable hydration question.

## Fix Applied

None — discovery only. No E2E test was written, because every candidate would
either be RED against fixed code (asserting a survival the flow cannot produce)
or a vacuous pass that cannot distinguish fixed from buggy code (the merge
produces identical output with and without the fix when no tombstone is present)
— both are explicitly forbidden by `.ai-docs/standards/e2e/README.md` ("Prove the
code path fired — don't just assert the contract" and "Never broaden
assertions"). The task itself authorized this outcome: "do not force a test
through an unrealistic path just for coverage." The throwaway probe used to
confirm the data flow was deleted.

## Proposed Standard

Two additions:

1. **`.ai-docs/standards/e2e/anti-patterns.md`** — add a short rule: "Not every
   fixed bug is E2E-reachable. Before writing an E2E test for a store/hydration
   bug, confirm the buggy branch is reachable through a realistic CLI flow —
   trace which config (global vs project) feeds the state the branch reads, and
   whether any trigger gate (`!initialAgents?.length`, `isEditingFromGlobalScope`,
   dashboard-vs-wizard on existing install) blocks the path. If the branch is
   only reachable via directly-seeded store state, unit tests are the correct and
   only gate; do not manufacture a vacuous or red E2E."

2. **`todo/active-bugfixes.md` (D-227 log)** — record that E2E coverage was
   evaluated and found architecturally unreachable (this finding), so the unit
   tests are the intended correctness gate. (Not edited here — that file is
   user-curated and untouched per the git-safety rule.)

Separately, a genuinely valuable but DISTINCT follow-up (not D-227): the repo has
no agent analog of the skill dual-scope E2E. An `agent` version mirroring
`edit-wizard-dual-scope-indicator.e2e.test.ts` — global agent install → toggle
G→P → complete → re-open → assert both scope entries persist in `config.ts` and
both badges render — would cover the agent create/persist/re-display path
end-to-end. It exercises `toggleAgentScope` + config write + hydrate-render, not
the D-227 preselect branch, so it belongs to its own task.
