---
type: convention-drift
severity: low
affected_files:
  - packages/matrix/src/read-model/assignment-defaults.ts
  - packages/matrix/src/read-model/preload-defaults.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  assignment-defaults.ts now calls isDomainlessRoleAgent, exported from preload-defaults.ts, and
  its private isCrossDomainRoleAgent is deleted (expressive-ts round 2, lane X6-packages-server-r2).
---

## What Was Wrong

Two read-model modules each declared the rule "`reviewer` and `pm` sit under `meta` but serve every
domain":

- `isCrossDomainRoleAgent(agent: SubAgent)` in `assignment-defaults.ts` decided which sub-agents a
  skill reaches.
- `isDomainlessRoleAgent(agentId)` in `preload-defaults.ts` decides whether a reached sub-agent
  preloads it.

The bodies were the same rule (domain `meta`, flavor not `meta`) but did not match as text
(`agent.flavor` against `AGENT_DEFINITIONS[agentId].flavor`), had different names, and had comments
worded differently. So a search for either name, or for either body, missed the other. If someone
changed one copy, targeting and preloading would disagree (`pm` targeted but never preloaded, or the
reverse). No spec checks the two together.

Found by reading the code, not by any search.

## Fix Applied

Deleted `isCrossDomainRoleAgent`. `implementationDomainReach` now calls
`isDomainlessRoleAgent(agent.id)`. The two are equivalent because `SubAgent.domainId` is
`agentDomainOf(id)` and `SubAgent.flavor` is `flavorOf(id)`, which is the same `AGENT_DEFINITIONS`
value. Census after the fix, `grep -rn 'flavor !== "meta"' packages/matrix/src apps/editor/src packages/compile/src packages/cli/src`:
one hit, in `preload-defaults.ts`.

## Proposed Standard

No check reports a duplicated body, and none is proposed: a body-similarity scan is more than this
needs. What would have held the rule is a spec in `assignment-defaults.test.ts` stating it as one
invariant: for every shipped skill, every sub-agent that `resolveLoadState` would preload is among
the targets `resolveAssignment` returns. Not written here, because test files are outside this lane.
This proposal conflicts with nothing in either `CLAUDE.md`.
