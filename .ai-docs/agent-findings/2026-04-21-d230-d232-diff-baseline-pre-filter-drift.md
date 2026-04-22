---
type: convention-drift
severity: high
affected_files:
  - src/cli/components/wizard/skill-agent-summary.tsx
  - e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts
  - src/cli/components/wizard/step-confirm.test.tsx
  - todo/D-225-investigations/09-tombstone-interaction.md
standards_docs:
  - todo/D-225-investigations/09-tombstone-interaction.md
date: 2026-04-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
---

## What Was Wrong

`skill-agent-summary.tsx` pre-filtered tombstones out of the diff baseline:

```ts
const skillDiffBaseline = installedSkillConfigs
  ? installedSkillConfigs.filter((s) => !s.excluded)
  : null;
```

This pre-filter produced two distinct user-facing bugs:

- **D-230**: G→P toggle on a pre-existing global install emits the dual-scope
  shape `[{react, project}, {react, global, excluded: true}]` (the tombstone
  is a D-223 dual-scope indicator — the global install survives). But the
  renderer saw the baseline global as active and the current global slot as
  unoccupied (because the tombstone at current was ignored by the
  `&& !c.excluded` clause in the `removedSkills` match), flagging the global
  as removed and rendering a spurious `- React` in the Global section.

- **D-232**: On the next `cc edit`, the saved config carries the same
  dual-scope shape. The baseline post-filter stripped the `react:global`
  tombstone, so `prevSkillKeySet` lacked the `react:global` key. The
  tombstone in current then rendered via `uniqueExcludedGlobalSkills` with
  `isNew=true`, producing a spurious `+ React` on a long-installed global.

The D-225 investigation 09 (`todo/D-225-investigations/09-tombstone-interaction.md`)
explicitly analyzed this and concluded: **"Do NOT introduce `const diffBaseline
= installedSkillConfigs.filter((s) => !s.excluded)` — it regresses Scenario
B and Scenario D."** The pre-filter recommendation in investigation 08 was
superseded by investigation 09, but the implementation adopted the 08
version anyway.

Additionally, existing E2E assertions for D-225 Scenarios A and C encoded
the INCORRECT behavior — they asserted `Global: +` on P→G restoration, but
per investigation 09 Scenario D the correct rendering is `Global: •`
(the global install was always live behind the tombstone; stripping the
tombstone restores it, not re-adds it).

## Fix Applied

1. `skill-agent-summary.tsx`:
   - Removed the `!s.excluded` pre-filter on `skillDiffBaseline` /
     `agentDiffBaseline` — tombstones are now first-class baseline entries
     that occupy `(id, scope)` slots.
   - Changed `removedSkills` / `removedAgents` predicates to slot-occupancy
     match: a baseline entry is removed only if NOTHING (active or
     tombstone) occupies that slot in current. A current tombstone at the
     same key keeps the slot occupied (dual-scope indicator, not a
     removal).
   - `prevSourceMap` still filters to active baseline entries — tombstones
     don't track a live install source.
   - `inheritedGlobalSkills` still operates on active baseline entries only
     — a tombstone in baseline isn't an install.
   - Removed the `removedGlobalSkillIds` dedup in `uniqueExcludedGlobalSkills`
     — under slot-occupancy matching, a baseline-tombstoned global cannot
     collide with a current-tombstoned global.

2. `src/cli/components/wizard/step-confirm.test.tsx`:
   - Added 5 new unit tests under
     `describe("dual-scope G→P toggle diff (D-230 / D-232)")` covering the
     skill + agent path, plus a P→G restoration assertion that pins
     investigation 09 Scenario D's expected behavior (`Global: •`, not `+`).
   - Tests use `toStrictEqual` with an explicit per-scope prefix map and a
     scope-anchored extractor rather than `expect.arrayContaining` —
     avoids the assertion-broadening that let Scenarios A/C ship with the
     wrong expected behavior.

3. `e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts`:
   - Rewrote Scenarios A, B, C to assert the correct dual-scope rendering
     (`•` on the surviving global row) plus a negative assertion against
     the bug prefix.
   - Added Scenario E covering D-232 (re-open with saved dual-scope state
     must produce a no-op diff — no `+`, no `-` on either scope).
   - Updated the file JSDoc header to document the slot-occupancy
     invariants instead of the stale "symmetric P→G / G→P" framing.

## Proposed Standard

When tests are explicitly called out as "superseded" in an investigation
document, the superseding recommendation must land in the implementation.
Specifically: `todo/D-225-investigations/09-tombstone-interaction.md`
states:

> The plan's proposed "pre-filter tombstones" (`const diffBaseline =
installedSkillConfigs.filter((s) => !s.excluded)`) is not necessary and
> would be WRONG.

A pointer from `skill-agent-summary.tsx` to the superseding investigation
— or a plan-level commit note referencing which investigation the final
code adopts — would have prevented the drift.

**Rule addition to `.ai-docs/standards/clean-code-standards.md` §
Investigation Referencing**: when a task has multiple investigation
documents that disagree, the implementation must either (a) cite the
specific investigation that was adopted in a comment near the load-bearing
line, or (b) update the superseded investigation with a deprecation note
pointing to the adopted one.

**Rule addition to `.ai-docs/standards/e2e/assertions.md` § Diff-Shape
Assertions**: never use `expect.arrayContaining([...])` for info-panel
diff assertions without a matching `.not.toEqual(arrayContaining([bug
prefix]))` negative check — `arrayContaining` passes as long as the
expected entries exist, so it silently tolerates extra wrong entries.
