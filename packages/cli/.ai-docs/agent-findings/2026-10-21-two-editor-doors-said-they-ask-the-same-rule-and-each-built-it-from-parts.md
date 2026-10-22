---
type: convention-drift
severity: low
affected_files:
  - apps/editor/src/features/configure/lib/provider.ts
  - apps/editor/src/features/configure/components/skill-cell.tsx
  - apps/editor/src/features/configure/components/skill-options-panel.tsx
  - apps/editor/src/features/configure/components/sub-agent-card.tsx
  - apps/editor/src/features/configure/components/roster-panel.tsx
  - apps/editor/src/features/configure/lib/derive.ts
  - apps/editor/src/features/configure/lib/marketplace-switch.ts
  - apps/editor/src/features/configure/components/stack-grid.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  pressRefusal and agentRefusal in provider.ts are the one statement of each rule, and
  displayNameOf in derive.ts the one name-or-id lookup; every door calls them (expressive-ts
  round 2, lane X7-editor-features-r2).
---

## What Was Wrong

The editor stated three rules more than once, in the same way as
`2026-10-21-the-matrix-read-model-declared-who-reviewer-and-pm-serve-twice-under-two-names`:

- **Is a press on a skill's placement refused?** `skill-cell.tsx` and `skill-options-panel.tsx`
  each built it from `placementRefusal` and `patchForPress`. The panel's comment said "the second
  door onto the cell's pairs, so it asks the same rule". The only thing that made that true was that
  both files spelled the composition the same way.
- **Is a press on a sub-agent refused?** `sub-agent-card.tsx` had a private `pressRefusal`.
  `roster-panel.tsx` wrote the same ternary inline, under "so the roster and the install agree".
- **What is a skill's name, or its id when the seated catalogue has none?** It was declared twice in
  `derive.ts` (`nameOf` and `displayNameOf`, identical bodies), once in `marketplace-switch.ts`, and
  written inline in `stack-grid.tsx`.

In each case a comment claimed the copies agree, and each file's specs stay green if one copy changes.

## Fix Applied

`pressRefusal(provider, options, patch)` and `agentRefusal(provider, agentId)` are exported from
`provider.ts`, and every door calls them. `displayNameOf` is exported from `derive.ts` and its
other copies are deleted. Census after the fix, over `apps/editor/src` without tests: each of
`grep -rn 'placementRefusal('`, `grep -rn 'leftOutOfCodexReason()'` and
`grep -rn 'displayName ?? '` returns one hit, in the module that owns the rule.

## Proposed Standard

None. No scan can tell "the same rule" from "the same text". The cheap tell is a comment saying
two call sites agree: that claim holds only when both sites call one function.
