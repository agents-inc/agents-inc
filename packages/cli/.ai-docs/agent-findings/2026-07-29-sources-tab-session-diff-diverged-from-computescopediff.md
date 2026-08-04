---
type: architectural-drift
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/wizard/scope-diff.ts
  - src/cli/components/wizard/source-grid.tsx
standards_docs:
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/wizard/store-map.md
date: 2026-07-29
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Landed: added-detection re-keyed onto the shared (id, scope) slot helper now exported from
  scope-diff.ts; the global-scope gate removed from removal detection. Pending: removal detection
  is still keyed by id alone, deliberately, because full slot semantics collide with the spec'd
  dual-scope-collapse rendering (see "Residual divergence" below).
---

## What Was Wrong

The wizard has **two independent implementations of the same session diff**:

- `computeScopeDiff` (`src/cli/lib/wizard/scope-diff.ts`) — the confirm-step summary.
  Keys on the `(id, scope)` **slot**, counts tombstones as occupying a slot, and has
  no edit-context gate.
- The Sources-tab collectors in `src/cli/stores/wizard-store.ts` — `buildSourceRows`
  and friends. Keyed on **id alone**, with an extra `isEditingFromGlobalScope` gate on
  the removal half.

Nothing tied the two together, so they drifted into disagreement and the same change
read differently on the two surfaces the user sees back to back:

1. **Removal, global-scope edit.** `collectRemovedInstalledEntries` early-returned an
   empty Map whenever `isEditingFromGlobalScope`, justified by a JSDoc claiming "a
   removal is a genuine uninstall rather than a project-overlay change". That premise
   is inverted: at global scope `reconcileSkillConfigs` passes `null`, so
   `applySkillRemoval` **drops** the entry outright and the hydration snapshot becomes
   the ONLY surviving record — exactly the record this collector reads. Gating it off
   is what makes the row vanish. Confirm listed the skill with `-`; Sources showed
   nothing.

2. **Addition, dual-scope adoption.** `collectAddedSkillIds` was a set difference over
   ids, so a skill already installed globally could never register as added when
   adopted at project scope (`s` on a `[G]` row). The id is old; the `(id, project)`
   slot is new. `classifyDiffRow` gets this right; Sources did not.

3. **Addition, threading.** Even where the flag was computed, `classifySkillSourceRows`
   only spread `added` on its final single-row branch. The excluded-global branch and
   the global→project two-row branch built rows without it, so the flag could not reach
   the very row that needed it (the newly occupied project half).

4. **Focus destroyed the diff colour.** `source-grid.tsx` rendered the focused branch
   with a hardcoded `CLI_COLORS.WHITE`, discarding `rowLabelColor(row)`. Focusing an
   added row silently downgraded it to an ordinary row in colour terms.

A test had calcified the inverted premise: a unit spec asserted
`buildSourceRows()` returns `[]` for a deselected saved skill during a global-scope
edit, restating the same wrong rationale verbatim in its comment. Its fixture was also
unreachable — it placed a `scope: "project"` entry in the snapshot of a global edit,
but `splitConfigByScope` only ever routes `isActiveAt(s, "global")` entries into the
global config.

## Fix Applied

- Extracted the slot key into `skillSlotKey(id, scope)`, **exported from
  `scope-diff.ts`** (the reference implementation) and re-exported via
  `lib/wizard/index.ts`. `computeScopeDiff`'s `prevSkillKeySet`, `prevSourceMap` and
  `classifyDiffRow` now call it instead of inlining the template literal, and the
  wizard store imports the same function. The alignment is now enforced by the
  compiler rather than by comment.
- `collectAddedSkillIds` → `collectInstalledSkillSlots` + `addedSlotFlag`: the store
  builds the snapshot's occupied-slot set (tombstones included, matching
  `prevSkillKeySet` per D-232) and each emitted row derives its own `added` flag from
  its own slot.
- `classifySkillSourceRows` threads the flag through every row shape. In the
  global→project pair the `+` lands on the editable project row while the locked
  global row stays a plain lock.
- Removed the `isEditingFromGlobalScope` gate and parameter from
  `collectRemovedInstalledEntries`, and rewrote the JSDoc to state the real mechanism.
- `source-grid.tsx`: `rowDiffColor()` now feeds both `rowLabelColor()` (unfocused,
  defaults to NEUTRAL) and the new `focusedRowLabelColor()` (defaults to WHITE). A
  diff row keeps its colour under focus; ordinary focused rows deliberately stay WHITE
  because NEUTRAL grey on the LABEL_BG highlight is the low-contrast pairing.
- Inverted the calcified unit spec to assert the corrected behaviour and corrected its
  fixture to a `scope: "global"` snapshot entry.

### Residual divergence (deliberate, not fixed)

Removal detection is still keyed by **id**, not by slot. Full slot semantics would
make a collapsed dual-scope pair (`[P][G]` → `[G]` via `s`) emit a project-scope
removal row alongside the surviving global row, because the `(id, project)` slot
empties while `(id, global)` goes active — which is what `computeScopeDiff` already
reports on confirm. The Sources tab deliberately renders that collapse as a single
locked global row (`wizard-store.test.ts` → "should render a collapsed dual-scope
skill as a locked global row, not a disabled row"), and `todo/D-271` explicitly asks
for the dual-scope-collapse case to be excluded from any unification. Forcing slot
semantics here would either break that spec or reduce to a no-op carve-out, and it
would additionally expose a latent hazard: `classifySkillSourceRows` returns EARLY
with only the removal row when `removedInstalledEntry` is set, and `buildSourceRows`
looks removals up per-id, so one id holding both a removed slot and an active slot
would lose its active row. Verified that this cannot occur today (added spec: "should
not mark a collapsed dual-scope skill as added" asserts the single surviving global
row).

## Proposed Standard

Add to `.ai-docs/reference/concepts/scope-system.md` a section **"One diff, one key"**:

- Any surface that classifies a wizard change as added / removed / source-changed MUST
  key on the `(id, scope)` slot via `skillSlotKey()` from `lib/wizard/scope-diff.ts`.
  Never re-derive the key inline and never key on the skill id alone — an id can occupy
  slots at both scopes simultaneously, which is the normal dual-scope shape, not an
  edge case.
- A diff detector MUST NOT be gated on `isEditingFromGlobalScope`. Edit context changes
  what the STORE does with a change (drop vs. tombstone), never whether the change is
  reportable. Before adding such a gate, check what `reconcileSkillConfigs` /
  `applySkillRemoval` actually do at that scope — at global scope they drop, which
  makes the hydration snapshot the only record and makes the gate self-defeating.
- When a classifier returns several row shapes, every shape must be fed the same
  classification inputs. A flag spread onto only one branch is a bug waiting for the
  other branch to be reached.

Add to `.ai-docs/standards/clean-code-standards.md` (testing section): a spec comment
that restates an implementation's rationale is not independent verification. When a
JSDoc rationale is found to be inverted, grep for specs quoting it — they encode the
same defect and must be re-derived from the reference implementation, not preserved.
