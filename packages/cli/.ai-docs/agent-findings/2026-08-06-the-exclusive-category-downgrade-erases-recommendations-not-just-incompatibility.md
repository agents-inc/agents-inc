---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/wizard/build-step-logic.ts
  - packages/cli/src/cli/lib/matrix/matrix-resolver.ts
  - packages/matrix/src/contract/selection-scenarios.ts
standards_docs:
  - todo/editor.md
date: 2026-08-06
reporting_agent: web-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Resolved by removal (CLI-404, owner ruling 2026-08-06): the "recommended" concept was deleted
  from the product entirely — the recommends rules, isRecommended/recommendedReason, the
  recommended advisory tier, validateRecommendations, the editor's Recommended filter, and the
  contract's `recommended` field. Both questions this finding poses are moot: there is no
  recommendation for the exclusive-category downgrade to erase, and no recommendation surface for
  a CLI-side divergence to land on. The SelectionDivergence vocabulary question survives only in
  its general form under EDITOR-11 step 2.
---

## What Was Wrong

Two things the new bilateral selection contract (EDITOR-13) surfaced and could not encode.

**1. The pick-one downgrade throws away the recommendation with the incompatibility.**

`buildCategoriesForDomain` replaces the whole advisory state, not just the status:

```ts
state: isExclusive && skill.advisoryState.status === "incompatible" ? { status: "normal" } : skill.advisoryState,
```

`computeAdvisoryState` ranks `incompatible > discouraged > recommended > normal`, so a skill that
is both a catalogue recommendation and in conflict resolves to `incompatible` — and then the
downgrade turns it into `normal`. The recommendation is gone, though nothing about the selection
made it a bad recommendation; only the conflict did, and the conflict is the part the downgrade
means to forgive.

Measured against the real catalogue: with Prisma selected, Drizzle — flagged `isRecommended` —
shows `normal` in the CLI wizard. The editor, which forgives the same sibling conflict without
touching the advisory state, still offers Drizzle under its Recommended filter. Same data, same
ruling, two answers, and nothing in the contract catches it.

This is the same root as the fourth divergence EDITOR-11 step 1 already recorded (that
`build-step-logic.ts` downgrade suppresses incompatibility across all 27 exclusive categories).
What is new is that it also suppresses the _recommendation_, which the narrowing EDITOR-11
proposes — restricting the downgrade to sibling conflicts — would not fix on its own: a
swap-resolvable sibling conflict is exactly the case where the recommendation disappears.

**2. `SelectionDivergence` has no vocabulary for a CLI-side divergence.**

The type is documented as "the editor answering differently from the CLI", and the runners are
built on that: the editor's marks divergent scenarios `it.fails`, the CLI's runs every scenario
green. A scenario where the CLI is the one out of step has nowhere to live. Encoding the Drizzle
case would have meant either mislabelling it as an editor bug or inventing an enum value on the
spot for an outcome nobody has ruled on — so it is not encoded, and that silence is this finding.

A second, quieter instance of the same shape: the CLI's `isRecommended` gates on `compatibleWith`,
which lists frameworks rather than the skill actually selected. With Expo selected the CLI does not
recommend React Hook Form (its `compatibleWith` names React Native, not Expo) while the editor
does. That belongs to the already-ruled `framework-constraint` divergence class in its cause, but
it lands on the recommendation surface rather than the availability surface, where no scenario
looks.

## Fix Applied

None — discovery only, deliberately.

EDITOR-13 added `recommended` to `SelectionScenario` and a runner on each side, and the goldens
were chosen to steer clear of both cases rather than to pin them: pinning either would have meant
adapting the contract to an undecided question, which the brief forbids. The editor's
selection-aware ranking landed and every scenario that _is_ pinned passes on both sides.

## Proposed Standard

Two decisions for the owner, both in `todo/editor.md`:

1. Under **EDITOR-11**, extend the pending ruling on the exclusive-category downgrade. Narrowing it
   to sibling conflicts is not sufficient — the downgrade must preserve the rest of the advisory
   state rather than collapsing to `{ status: "normal" }`. Concretely, an incompatible verdict
   forgiven inside a pick-one category should fall back to what the skill would have been _without_
   the conflict (`recommended` when the catalogue flags it, `normal` otherwise), not to `normal`
   unconditionally.

2. Under **EDITOR-11 step 2**, decide whether `SelectionDivergence` should name which side is
   wrong (e.g. a `side: "editor" | "cli"` field) so a CLI-side divergence can be pinned in the same
   place as the four editor-side ones. Until it can, findings like this one are the only record,
   and the contract's claim to be bilateral is weaker than it reads: both runners exist, but only
   one of them can express a failure the goldens predict.
