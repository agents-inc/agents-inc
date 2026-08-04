---
type: convention-drift
severity: medium
affected_files:
  - src/cli/components/wizard/category-grid.tsx
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/wizard/scope-diff.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/component-patterns.md
  - .ai-docs/reference/wizard/state-transitions.md
  - .ai-docs/reference/store-map.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Docs landed: the three reference docs now describe the two cooperating focus writers, the corrected
  tombstone-transition directions, and the removed prevSource/2-arg signatures. Pending: the two
  documentation-bible rules proposed below (negative-claim expiry + direction-convention statement)
  are not yet codified, and the DOCUMENTATION_MAP row annotations are owned by a separate pass.
---

## What Was Wrong

Two distinct drift classes surfaced while reconciling the wizard reference docs against product 0.146.0.

**1. A doc recorded a DELETION that a later task reverted, and nothing re-checked it.**

D-233 removed `CategoryGrid`'s post-mount focus-seed effect in favour of a synchronous store seed. Three docs faithfully recorded the removal in absolute terms:

- `component-patterns.md`: "`CategoryGrid` has no post-mount effect."
- `wizard/state-transitions.md`: "CategoryGrid's former fire-once post-mount seed effect was **deleted**."
- `store-map.md`: "the old CategoryGrid post-mount seed effect was deleted, so the Scenario B `null` race for skills no longer applies."

D-272 then **re-added a mount effect** to `category-grid.tsx` — keyed on the drawn cell, dispatching `onFocusedSkillChange` — and simultaneously removed that dispatch from `handleFocusChange`. So every one of those three sentences became false, and a fourth claim ("CategoryGrid dispatches on move" / "fired by its internal `handleFocusChange`") became exactly backwards: the dispatch is no longer navigation-gated, which is the whole point of the change.

The failure mode is specific to negative claims. A positive claim ("X calls Y") gets re-checked the moment an agent greps for `Y`. A negative claim ("there is no post-mount effect") matches nothing, so no later grep can contradict it — it only dies if someone re-reads the component for an unrelated reason. Two targeted doc syncs (the D-260 and D-277 scope-rule passes) touched all three files after D-272 shipped and left all four sentences standing, because both were scoped to the scope-rule contract.

**2. A transition table stated a direction convention it then contradicted.**

`wizard/state-transitions.md`'s Tombstone Lifecycle table used `G -> P` to mean global→project in one row and the opposite in two others:

| Row                                                      | Claimed                           | Actual (`toggleSkillScope`)                                 |
| -------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| "`toggleSkillScope` P -> G while global-eject installed" | → dual-scope, **gains** tombstone | P→G **drops** every tombstone, unconditionally              |
| "`toggleSkillScope` G -> P (undo)"                       | → tombstone **removed**           | G→P **adds** the tombstone, gated on `wasInstalledGlobally` |
| "`toggleSkillScope` G -> P (not global-installed)"       | → flips scope, no tombstone       | correct                                                     |

`store-map.md` had the directions right for the same action, so the two docs contradicted each other in the same repository. An agent reading only the transition table would invert the tombstone lifecycle. The convention was never stated in the table, so nothing made the inconsistency visible on review.

The same table also still described a transition D-277 had abolished — "`toggleTechnology` deselect (globally installed) → global-only; `reconcileSkillConfigs` marks `excluded: true`" — where the current code refuses that deselect outright and `applySkillRemoval` cannot stamp `excluded` at all.

## Fix Applied

Docs only; no source touched.

- Replaced all four focus-seeding sentences with a two-writer description naming both mechanisms (synchronous `seedFocusedSkillForActiveDomain` with its `FALLBACK_DOMAIN` resolution, plus `CategoryGrid`'s mount effect) and stating why neither alone suffices — `useFocusedListItem` only fires `onChange` during navigation, so the initially highlighted cell would never reach the store.
- Rewrote the Tombstone Lifecycle table with an explicit direction convention stated immediately above it, corrected rows, added the refused-by-guard transitions (D-260/D-277) and the `toggleDomain` collapse path, and added a closing invariant: tombstones now originate from exactly two places (`toggleSkillScope`'s G→P arm and `reconcileSkillConfigs`'s dual-scope restore, plus the agent mirrors).
- Corrected the adjacent stale signatures found in the same sweep: `setSourceSelection` (2-arg → 3-arg scope-keyed, D-262), `setAllSources*` (all entries → active only, D-265), `SkillDiffRow.prevSource` (removed, D-261), `buildSourceRows`' return shape, and `classifySkillSourceRows`' row shapes.

## Proposed Standard

Both for `.ai-docs/standards/documentation-bible.md`.

1. **New subsection under "Line Numbers and Staleness" — "Negative claims carry an anchor and expire."** A doc may state that a mechanism does not exist ("no post-mount effect", "no fallback", "this field is gone") ONLY when the sentence names the file the absence holds in and the task ID that removed it. On any re-validation of that doc, every negative claim must be re-verified by opening the named file — a grep cannot refute one. Prefer the positive framing where one exists ("focus is dispatched from X") since it is self-refuting when X changes. This is the rule that would have caught D-272 reverting D-233's deletion.

2. **Addition to the same file's format rules — "State the direction convention above any transition table."** A table whose rows encode a direction (`G→P`, `P→G`, `before→after`, `on/off`) must state, in prose immediately above it, what the notation means. Direction is the one column reviewers pattern-match rather than read, and an inverted row is invisible without the stated convention. Where two docs describe the same transition, they must use one notation — `store-map.md` and `wizard/state-transitions.md` had disagreed on this for at least one release.

3. **Extension of the existing "Doc-Touching Changes" table.** Add a row: _Change that RESTORES a previously-removed mechanism → grep the reference docs for the removal note and the task ID that recorded it._ The current table keys on adding, deleting and renaming; restoration is the case it misses, and it is the case that leaves docs asserting a falsehood rather than merely an omission.
