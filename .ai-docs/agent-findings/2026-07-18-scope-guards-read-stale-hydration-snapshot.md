---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/reference/concepts/guard-pattern.md
date: 2026-07-18
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: superseded
superseded_by: 2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md
resolved_by: "toggleTechnology/toggleAgent blanket guards now also check live skillConfigs/agentConfigs (tombstone-arm gated on isSelected); toggleSkillScope wasInstalledGlobally counts tombstones; persisted-pair guards consult a session-scoped `_sessionRebuiltScopePair{Skills,Agents}` set so a collapsed-then-rebuilt pair is treated as session-authored, not pristine-from-disk. SUPERSEDED by D-277: the guards no longer have an isInitMode bypass, so the stale-snapshot deselect route this finding described is unreachable by construction rather than merely patched, and the bare tombstone it could produce no longer exists on any removal path."
---

## What Was Wrong

Several wizard-store scope guards decided behaviour purely from the immutable
hydration snapshot (`installedSkillConfigs` / `installedAgentConfigs`), which is
set once at hydration and never updated. That is correct only while the live
config still mirrors the snapshot. Once an in-session action reaches a NEW live
state the snapshot cannot represent, snapshot-only guards misfire:

- The blanket "global skills/agents cannot be changed from project scope" guards
  (`toggleTechnology`, `toggleAgent`) read `hasGlobalActive(installed, id)`. After
  an in-session spacebar collapse of a persisted `[P][G]` pair, the live config
  holds a plain active global entry while the snapshot still shows the global
  _tombstone_ (excluded). `hasGlobalActive(installed)` is false, so a second
  spacebar was NOT blocked and silently tombstoned the still-real global install.
- `toggleSkillScope`'s `wasInstalledGlobally` filtered the snapshot with
  `&& !sc.excluded`, so it could not see a real global install sitting behind a
  tombstone — a `s` (G→P) on the collapsed row produced a bare `[P]` instead of a
  fresh `[P][G]`. (The agent path already omitted `!excluded`, so the two paths
  had silently diverged.)
- The "persisted dual-scope pair — `s` is inert" guards keyed off shape alone
  (`hasGlobalTombstone(installed) && hasProjectActive(live) && hasGlobalTombstone(live)`).
  A pair collapsed and rebuilt within the same session ends up shape-identical to
  a pristine reopened-from-disk pair, so the guard wrongly re-locked a
  user-reconstructed pair. A shape/snapshot comparison cannot distinguish
  "pristine from disk" from "reconstructed this session".

## Fix Applied

- Blanket guards additionally recognise a live plain active global entry, but only
  when the snapshot proves a real global install exists (active global OR global
  tombstone) and only for the DESELECT direction (the tombstone arm is gated on
  `isSelected` so the sanctioned re-select restore still runs).
- `wasInstalledGlobally` (skill) now counts global tombstones, matching the agent
  path — a tombstone means the skill IS installed globally.
- Added a session-scoped `_sessionRebuiltScopePairSkills` / `_sessionRebuiltScopePairAgents`
  set, populated whenever a store action re-establishes a `[P][G]` pair
  (`toggleSkillScope`/`toggleAgentScope` G→P tombstone creation, spacebar/agent
  restore). The persisted-pair guards suppress themselves for ids in that set, so a
  reconstructed pair flips P↔G freely while a genuinely untouched pair stays inert.

Covered by new unit tests (full in-session sequence, skill + agent) in
`wizard-store.test.ts` and E2E
`e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts`.

## Proposed Standard

In `.ai-docs/reference/concepts/guard-pattern.md`, add a rule to the guard
authoring guidance:

> A guard that gates on the hydration snapshot (`installed*Configs`) must also
> consider live state (`skillConfigs`/`agentConfigs`) for any transition reachable
> WITHIN a session. The snapshot is a frozen diff baseline, not a live truth — once
> an in-session action can produce a live state the snapshot no longer reflects
> (e.g. a collapsed dual-scope pair), a snapshot-only guard is stale. When a guard
> must distinguish "pristine from hydration" from "reconstructed by a store action
> this session", track the reconstruction explicitly with session-scoped state
> (a `Set` of touched ids) — shape/snapshot comparison alone cannot tell them apart.
