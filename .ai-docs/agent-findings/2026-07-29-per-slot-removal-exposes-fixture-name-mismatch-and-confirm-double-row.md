---
type: standard-gap
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/stores/wizard-store.test.ts
  - src/cli/lib/wizard/scope-diff.ts
  - src/cli/components/wizard/skill-agent-summary.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-29
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Docs + code comments landed (store-map, tombstone-pattern, component-patterns, D-271 annotations,
  in-code rationale). Item 1 (the fixture/name mismatch spec) is RESOLVED 2026-07-30: the fixture
  now establishes the named state (live entry explicitly project-scoped, one row, readOnly pinned),
  and a new spec covers the project-to-global migration shape the old fixture accidentally built
  (added global row + project pending-removal row). Still open: the confirm-step
  computeScopeDiff double Global row for the inherited-global shape, and the `-` it reports for a
  removed mask (the Sources tab deliberately declines to mirror both).
---

## What Was Wrong

Re-keying the Sources tab's removal detection from **id** to **(id, scope) slot** (owner ruling:
"any scope a skill leaves this session shows a minus while the surviving scope keeps its row")
surfaced three things that the coarser id-keyed rule had been hiding.

**1. A green unit spec whose fixture never establishes the state its name claims.**

`wizard-store.test.ts` → `"should not mark project-scoped skills as readOnly when previously
installed as project"` builds its live state with `toggleTechnology(...)`, which produces a
**global**-scoped config entry (`buildSkillConfigForId` defaults to `scope: "global"`), while its
snapshot is `buildSkillConfigs([...])` — which defaults to `scope: "project"`. So the state under
test is not "project-scoped skill, previously installed as project"; it is a project→global
**migration**. The `readOnly` assertion the test is named for still passes for the right reason (no
active global entry in the snapshot → no lock), but the incidental `expect(rows).toHaveLength(1)`
pinned the id-keyed behaviour for a second, unlisted shape, and now fails.

The behaviour it now reports is correct on both surfaces. Verified by driving the real functions:

| Surface                 | snapshot `[P react eject]`, live `[G react]`                        |
| ----------------------- | ------------------------------------------------------------------- |
| `computeScopeDiff`      | Project `- React` (removed) + Global `+ React` (added)              |
| `buildSourceRows` (new) | `{scope:"global", added:true}` + `{scope:"project", disabled:true}` |

Two defaults pointing opposite ways (`buildSkillConfig` → `project`, `createDefaultSkillConfig` /
`buildSkillConfigForId` → `global`) make this mismatch class easy to write and invisible to review.

**2. `computeScopeDiff` renders the same skill twice under Global for the inherited-global shape.**

Snapshot `[G active]` + live `[P active]` with **no** tombstone (exactly what hydration produces
from a config holding a skill at both scopes, before any keypress) yields:

```
GLOBAL: [{status:"unchanged"}, {status:"removed"}]   // • React AND - React, same skill
```

`inheritedGlobalSkills` re-surfaces the snapshot's global entry as `•`, and the slot-occupancy
`removedSkills` filter independently classifies the same entry as `-`. No spec pins this, so it is
live but unnoticed. It is also why a _literal_ port of `computeScopeDiff`'s removal rule to the
Sources tab is wrong: the Sources implementation needed `isSlotAlreadyRendered` to suppress a
removal row for a slot an emitted row already renders.

**3. `computeScopeDiff` prints `-` for a removed MASK.**

Snapshot `[G tombstone]` + live `[]` → `GLOBAL: [{status:"removed"}]`. A tombstone is a mask over a
global install, not an install: dropping it deletes nothing, so the `-` announces a deletion that
never happens. Unreachable through store transitions today (every path that drops a tombstone fills
the same slot with an active entry), which is why it has gone unnoticed.

## Fix Applied

Code (shipped): `collectRemovedInstalledEntries` now keys per `(id, scope)` slot; pending-removal
rows are emitted separately from live rows (`toPendingRemovalRow`) and de-duplicated per slot by
`isSlotAlreadyRendered`; snapshot tombstones are deliberately excluded as removal candidates, with
the divergence from `computeScopeDiff` and its rationale stated in the function docstring.

Docs (shipped): `reference/store-map.md` ("Sources-tab session diff"),
`reference/concepts/tombstone-pattern.md` ("UI Indicators" + "State Transition Summary"),
`reference/component-patterns.md` ("SourceGrid Row States"), and supersession annotations on
`todo/D-271-pending-removal-row-not-rendering.md`.

**Not fixed — deliberately left for the owner:**

- Item 1's spec was left **exactly as written** (it is outside the single authorized inversion, and
  adjusting it unasked would either weaken a spec or silently bless a second behaviour change).
- Items 2 and 3 are `computeScopeDiff` bugs on the confirm step, outside this change's scope.

## Proposed Standard

1. `.ai-docs/standards/clean-code-standards.md`, test-data section: **a test's fixture must
   establish the state its name claims.** When a spec's name asserts a scope/source/mode, the
   fixture must set it explicitly rather than relying on a factory default — the two relevant
   defaults disagree (`buildSkillConfig` → `project`, `createDefaultSkillConfig` /
   `buildSkillConfigForId` → `global`), so an unstated scope is a coin flip.
2. Same doc: **incidental `toHaveLength` assertions are contracts too.** A row/entry count in a spec
   whose subject is a flag silently pins derivation behaviour the spec never claims to own. Either
   assert the count deliberately (with a comment saying why that count is the contract) or assert on
   the specific row (`rows.find(...)`) instead of the collection.
3. `.ai-docs/reference/concepts/tombstone-pattern.md`: file the two `computeScopeDiff` shapes above
   as known gaps (double Global row for inherited-global; `-` for a removed mask) so the next author
   comparing the two surfaces knows which one is authoritative for each shape.
