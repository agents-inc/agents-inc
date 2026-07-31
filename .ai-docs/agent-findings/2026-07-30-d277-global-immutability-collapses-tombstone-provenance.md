---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/installation/local-installer.test.ts
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/concepts/guard-pattern.md
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/concepts/guard-pattern.md
date: 2026-07-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: "Code + docs landed (D-277 sections A, B, D). The two pending local-installer specs were repaired 2026-07-30: each fixture gained an active project-scoped entry of the same id/name, turning the bare mask into a legitimate identity-collision mask, and the specs were renamed to 'preserves the dual-scope pair's tombstone while the global skill/agent still exists'. Full unit suite green (5162 passed, 0 failed). Re-verified 2026-07-30: `local-installer.test.ts` carries the renamed spec, `buildProjectCollisionTest` / `dropOrphanedDerivedMasks` / `dropOrphanedDerivedAgentMasks` are all present in `local-installer.ts`, and the Proposed Standard's provenance rule is in `reference/concepts/tombstone-pattern.md` alongside the Mask vs. Tombstone terminology section. Field renamed from `partial_note:` this pass — the note always described a completed resolution, so it was the key that was wrong, not the status; content preserved verbatim above the re-verification sentence."
supersedes:
  - 2026-07-17-d227-same-scope-active-tombstone-duplicate.md
  - 2026-07-18-scope-guards-read-stale-hydration-snapshot.md
  - 2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable.md
---

## What Was Wrong

Before D-277, a project could reach into the global config three ways that the
owner ruling forbids ("you should never be able to deselect a globally installed
skill from a project, ever"):

1. The `isInitMode` arm bypassed every global-item guard, so a deselect in init
   mode tombstoned or dropped a global entry.
2. `applySkillRemoval` gated its tombstone branch on a **scope-agnostic**
   `installedIds` set, so a skill installed at PROJECT scope, re-scoped to global
   in-session with `s`, then deselected, produced a bare
   `{scope: "global", excluded: true}` tombstone for a skill that was never
   installed globally.
3. `toggleDomain` had no guard at all, and `preselectAgentsFromDomains` rebuilt
   `agentConfigs` from `DOMAIN_AGENTS` wholesale, silently dropping a
   globally-installed agent no selected domain rosters.

The deeper consequence was on **tombstone provenance**. As long as deselection
could mint a bare tombstone, a machine-derived conflict mask and a user's
deliberate exclusion were byte-identical on disk with no way to tell them apart.
That forced `dropOrphanedDerivedMasks` to be narrowed to categories the matrix
declares both `exclusive` AND `required`, leaving a documented trade-off: in an
optional exclusive category the mask outlived its collision forever.

## Fix Applied

Sections A and B of `todo/D-277-global-immutability-from-project-scope.md`:

- Deleted `&& !state.isInitMode` from all four guards (`toggleTechnology`
  deselect + exclusive swap, `toggleFilterIncompatible`, `toggleAgent`).
- `applySkillRemoval` now removes only what the project OWNS. It drops
  `isProjectOwned` entries and entries absent from the hydration snapshot (added
  this session); an INHERITED global-active entry present in the snapshot
  survives byte-identical. It no longer stamps `excluded` at all.
- Deleted `applyAgentToggle`'s tombstone branch and its `installedAgentConfigs`
  parameter, plus the now-dead `effectiveInstalledConfigs`, `wasInstalledGlobal`,
  `isExcludedToggleOff`, and the corresponding `nextSelectedAgents` arm.
- `preselectAgentsFromDomains` merges instead of replacing: it retains all
  tombstones (D-227) plus every non-project-owned entry outside the roster.
- Generalised the self-heal: `dropOrphanedDerivedMasks` and the new
  `dropOrphanedDerivedAgentMasks` retain a mask iff the collision that would
  re-derive it still holds. Skills share `buildProjectCollisionTest` with
  `maskCollidingGlobalSkills` so producer and self-heal cannot disagree; the
  `exclusive && required` narrowing and its TRADE-OFF paragraph are deleted.

With deselection removed as a source, every **bare** tombstone is necessarily
machine-derived — the only user route (`s`, G→P) always pairs it with an active
project entry. That is what makes the one-test retention rule sound.

## Deviation From The Plan (deliberate, forced by the spec set)

Plan step A5 prescribed changing `applySkillRemoval`'s third parameter from
`installedSkillConfigs` to `isEditingFromGlobalScope: boolean`. That signature is
**provably unable** to satisfy the spec set, so the parameter was kept:

- `wizard-store.test.ts` → "should remove global skill when toggling off during
  fresh init (no installed configs)" (green, must stay green) calls
  `applySkillRemoval([{react, scope: "global", source: "agents-inc"}], {react})`
  with `isEditingFromGlobalScope === false` and expects `[]`.
- `wizard-store.test.ts` → "writes no tombstone when a project skill re-scoped to
  global in-session is then deselected" (RED spec (c)) calls it with a
  **byte-identical** `configs`/`removed`/`isEditingFromGlobalScope` triple and
  expects the entry to SURVIVE.

The only field that differs is `installedSkillConfigs` (`null` vs an entry for
the same id). A boolean third parameter therefore cannot discriminate them. The
retention predicate is `!isProjectOwned(entry) && installedIds.has(entry.id)`,
which satisfies both and preserves the invariant already documented on
`isGloballyLockedSkill`: "a skill freshly added this session (absent from the
snapshot) stays freely deselectable" — otherwise an accidental add in an edit
session would be un-undoable. `null` still means "editing from global scope", so
the plan's "at global scope drop all removed ids" behaviour is unchanged.

## What Is Still Open

Two `local-installer.test.ts` specs assert the **pre-D-277** semantics and now
fail. They were deliberately NOT modified (the task forbade adjusting tests):

- "preserves a skill tombstone when the global skill still exists"
- "preserves an agent tombstone when the global agent still exists"

Both write a project config whose only global-scope entry is a **bare** tombstone
with no active project sibling of the same id/name, a live global install, and
then assert the tombstone survives propagation. Under owner ruling 3 ("the only
mechanism that may mask a global skill in a project is a system-derived conflict
mask") that shape is no longer legitimate: nothing collides, so nothing justifies
the mask, and the generalised self-heal drops it. The RED specs (e)
"reactivates the masked global skill once the project owns nothing in an optional
exclusive category" and (f) "drops an orphaned agent mask once the project no
longer owns that agent" assert the opposite outcome for the same shape, so the
old and new specs are irreconcilable by any principled predicate — the only
difference between the pairs is an unrelated project-scoped entry (`vitest` /
`web-reviewer`) and, for skills, whether the fixture matrix declares the category
`exclusive`.

Their true subject is `retainProjectOwnedSkills` / `retainProjectOwnedAgents`
(drop a tombstone whose global entry is gone), which stays covered by their green
partners "drops a skill tombstone when the global skill has been removed" and
"drops an agent tombstone when the global agent has been removed". Recommended
rewrite: give each fixture an active project-scoped entry for the SAME id/name,
which makes the mask legitimate (identity collision) and restores the intended
assertion without weakening it.

## Proposed Standard

Add to `.ai-docs/reference/concepts/tombstone-pattern.md` (done in this batch, in
the Overview and the Creation section) and enforce in review:

> **A tombstone assertion must name its provenance.** A test that expects a
> `{scope: "global", excluded: true}` entry to survive a write must set up the
> thing that justifies it — an active project-scoped entry for the same id/name
> (identity), or an active project skill in the same matrix-declared `exclusive`
> category. A bare tombstone with no collision is, by definition, orphaned, and
> the self-heal will drop it. Fixtures that assert "tombstone survives" without a
> collision are pinning a shape the product no longer produces.
